import { ApiError, api, logout, requireUser } from './api.js';
import { DeviceGps, LocationUploader, SimulatedGps } from './gps.js';
import { CampusMap } from './map.js';
import { endTripSafely } from './trip-ending.js';
import { $, OCCUPANCY, SIGNAL, bindAppBar, etaText, formatClock, formatDuration, html, render, signalPill, toast } from './ui.js';

const state = {
  network: null,
  stops: new Map(),
  routes: new Map(),
  vehicle: null,
  gps: null,
  uploader: null,
  fixCount: 0,
  lastFixAt: null,
  lastServerStatus: null,
  lastServerAt: 0,
  uploadStatus: null,
  ending: false,
  map: null,
};

const user = await requireUser('driver');
if (user) start();

async function start() {
  bindAppBar(user, logout);
  state.network = await api('/api/network');
  state.stops = new Map(state.network.stops.map((s) => [s.id, s]));
  state.routes = new Map(state.network.routes.map((r) => [r.id, r]));
  state.map = new CampusMap($('#map'), { legend: false });
  state.map.setNetwork(state.network);

  $('#start-form').addEventListener('submit', onStart);
  $('#end-trip').addEventListener('click', () => $('#end-dialog').showModal());
  $('#end-dialog form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'confirm') endTrip();
  });
  $('#occupancy').addEventListener('click', onOccupancy);
  $('#speed').addEventListener('input', (e) => {
    $('#speed-value').textContent = `${e.target.value} km/h`;
    if (state.gps && state.gps.kind === 'simulator') state.gps.setSpeed(Number(e.target.value));
  });
  $('#toggle-outage').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.classList.toggle('is-on', on);
    if (state.gps && state.gps.setOutage) state.gps.setOutage(on);
    log(on ? 'Simulated GPS outage started: no positions are being produced.' : 'GPS signal restored.');
  });
  $('#toggle-network').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.classList.toggle('is-on', on);
    if (state.uploader) state.uploader.setNetworkDown(on);
    log(on ? 'Simulated network loss: positions are queued on this device; the server cannot be reached.' : 'Network restored: sending queued positions…');
  });
  $('#inject-glitch').addEventListener('click', () => {
    if (state.gps && state.gps.glitchFix && state.uploader) {
      state.uploader.push(state.gps.glitchFix());
      log('Injected an impossible position (1.5 km jump).');
    }
  });

  const { vehicle } = await api('/api/driver/trip');
  if (vehicle) {
    log('Resumed your active trip after a page reload (simulated GPS).');
    beginTrip(vehicle, 'simulator');
  } else {
    await showStartForm();
  }
  setInterval(renderTrip, 1000);
  setInterval(pollServerView, 5000);
}

/** While no positions are being uploaded (e.g. GPS outage), still learn what passengers see and whether the trip was ended. */
async function pollServerView() {
  if (!state.vehicle || state.ending || simulatedOffline() || Date.now() - state.lastServerAt < 8000) return;
  try {
    const { vehicle } = await api('/api/driver/trip');
    state.lastServerAt = Date.now();
    if (!vehicle) return void onTripEndedElsewhere();
    state.vehicle = vehicle;
    noteSignal(vehicle.signal.status);
    renderTrip();
  } catch {
    /* offline: the upload card already says so */
  }
}

function noteSignal(status) {
  if (status !== state.lastServerStatus) {
    log(`Passengers now see: ${SIGNAL[status].label}.`);
    state.lastServerStatus = status;
  }
}

async function showStartForm() {
  state.vehicle = null;
  $('#trip-card').classList.add('hidden');
  $('#sim-card').classList.add('hidden');
  $('#start-card').classList.remove('hidden');
  $('#map-hint').textContent = '';
  state.map.setRouteFilter(null);
  state.map.setVehicles([]);
  const options = await api('/api/driver/options');
  render($('#route-select'), html`${options.routes.map((r) => html`<option value="${r.id}">${r.name} (${r.stops} stops)</option>`)}`);
  render($('#shuttle-select'), html`${options.shuttles.map((s) => html`<option value="${s.id}" ${s.busy ? 'disabled' : ''}>${s.label} · ${s.plate} · ${s.capacity} seats${s.busy ? ' (in use)' : ''}</option>`)}`);
  const firstFree = options.shuttles.find((s) => !s.busy);
  if (firstFree) $('#shuttle-select').value = firstFree.id;
}

async function onStart(event) {
  event.preventDefault();
  const form = event.target;
  const error = $('#start-error');
  error.classList.add('hidden');
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    const { vehicle } = await api('/api/driver/trips', { method: 'POST', body: { routeId: form.routeId.value, shuttleId: form.shuttleId.value } });
    log(`Trip started: ${vehicle.routeName} with ${vehicle.shuttleLabel}.`);
    beginTrip(vehicle, form.source.value);
  } catch (e) {
    error.textContent = e.message;
    error.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}

function beginTrip(vehicle, sourceKind) {
  state.vehicle = vehicle;
  state.fixCount = 0;
  state.lastFixAt = null;
  state.lastServerStatus = vehicle.signal.status;
  state.lastServerAt = Date.now();
  $('#start-card').classList.add('hidden');
  $('#trip-card').classList.remove('hidden');
  state.map.setRouteFilter([vehicle.routeId]);
  state.map.setVehicles([vehicle]);

  state.uploader = new LocationUploader(vehicle.tripId, {
    onResult: onUploadResult,
    onStatus: (s) => {
      state.uploadStatus = s;
      renderUpload();
    },
    onEnded: onTripEndedElsewhere,
  });

  const route = state.routes.get(vehicle.routeId);
  if (sourceKind === 'simulator' && route) {
    state.gps = new SimulatedGps({
      path: route.path,
      loop: route.loop,
      stops: route.stopIds.map((id) => state.stops.get(id)),
      dwellSeconds: route.dwellSeconds,
      speedKmh: Number($('#speed').value),
      startAlong: vehicle.distanceAlong ?? 0,
    });
    $('#sim-card').classList.remove('hidden');
    for (const id of ['#toggle-outage', '#toggle-network']) {
      $(id).setAttribute('aria-pressed', 'false');
      $(id).classList.remove('is-on');
    }
  } else {
    state.gps = new DeviceGps();
    $('#sim-card').classList.add('hidden');
  }
  state.gps.start(
    (fix) => {
      state.fixCount++;
      state.lastFixAt = Date.now();
      state.uploader.push(fix);
    },
    (err) => log(`GPS error: ${err.message}`),
  );
  renderTrip();
}

function stopLocalTrip() {
  if (state.gps) state.gps.stop();
  if (state.uploader) state.uploader.stop();
  state.gps = null;
  state.uploader = null;
}

function onUploadResult(result, sent) {
  state.vehicle = result.vehicle;
  state.map.upsertVehicle(result.vehicle);
  if (sent > 1) log(`Delivered ${sent} queued positions in one batch (${result.accepted} accepted).`);
  if (result.rejected.length) {
    const reasons = [...new Set(result.rejected.map((r) => r.reason.toLowerCase().replaceAll('_', ' ')))].join(', ');
    log(`Server rejected ${result.rejected.length} position(s): ${reasons}.`);
  }
  if (Math.abs(result.clockOffsetMs) > 5000) log(`Device clock differs from server by ${Math.round(result.clockOffsetMs / 1000)} s; corrected.`);
  state.lastServerAt = Date.now();
  noteSignal(result.vehicle.signal.status);
  renderTrip();
}

async function onTripEndedElsewhere() {
  if (!state.vehicle || state.ending) return; // while ending, endTrip() decides what happened
  state.vehicle = null;
  stopLocalTrip();
  log('This trip is no longer active (ended by the transport office or after a long signal loss).');
  toast('Your trip is no longer active (office termination or prolonged signal loss).', 'error', 7000);
  await showStartForm();
}

/** The "Simulate network loss" button cuts this device off from the server for uploads and for ending the trip. */
function simulatedOffline() {
  return Boolean(state.uploader && state.uploader.networkDown);
}

async function endTrip() {
  if (!state.vehicle || state.ending) return;
  state.ending = true;
  const button = $('#end-trip');
  button.disabled = true;
  button.textContent = 'Ending trip…';
  const result = await endTripSafely({
    tripId: state.vehicle.tripId,
    uploader: state.uploader,
    requestEnd: (tripId) => {
      if (simulatedOffline()) throw new ApiError(0, 'NETWORK', 'Cannot reach the server (simulated network loss).');
      return api(`/api/driver/trips/${encodeURIComponent(tripId)}/end`, { method: 'POST' });
    },
  });
  state.ending = false;
  button.disabled = false;
  button.textContent = 'End trip';

  if (result.outcome === 'failed') {
    log(`Trip NOT ended: ${result.error.message} The trip is still active and your location is still shared. Try "End trip" again.`);
    toast('Trip not ended: the server could not be reached. The trip is still active.', 'error', 8000);
    return;
  }
  stopLocalTrip();
  state.vehicle = null;
  if (result.undelivered) log(`${result.undelivered} position(s) recorded while ending were not sent (the trip is over).`);
  if (result.outcome === 'ended') {
    log('Trip ended. Location sharing stopped.');
    toast('Trip ended.');
  } else {
    log('This trip had already ended on the server (by the transport office or after a long signal loss). Location sharing stopped.');
    toast('This trip had already ended.', 'error', 7000);
  }
  await showStartForm();
}

async function onOccupancy(event) {
  const button = event.target.closest('[data-level]');
  if (!button || !state.vehicle) return;
  try {
    const { trip } = await api(`/api/driver/trips/${encodeURIComponent(state.vehicle.tripId)}/occupancy`, { method: 'POST', body: { level: button.dataset.level } });
    state.vehicle = { ...state.vehicle, occupancy: trip.occupancy };
    log(`Passenger load set to "${OCCUPANCY[trip.occupancy].label}".`);
    renderTrip();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderTrip() {
  const v = state.vehicle;
  if (!v) return;
  const now = Date.now();
  $('#trip-title').textContent = `${v.routeName} · ${v.shuttleLabel}`;
  $('#trip-meta').textContent = `Started ${formatClock(v.startedAt)} · ${formatDuration((now - v.startedAt) / 1000)} on duty`;
  render($('#server-signal'), signalPill(v.signal.status));
  $('#map-hint').textContent = v.routeName;

  const next = v.nextStops[0];
  if (next) {
    $('#next-stop-name').textContent = state.stops.get(next.stopId)?.name ?? next.stopId;
    $('#next-stop-eta').textContent = etaText((next.arrivalAt - now) / 1000);
    $('#next-stop-note').textContent = `${Math.round(next.distanceMeters)} m`;
  } else {
    $('#next-stop-name').textContent = v.signal.status === 'AWAITING_FIX' ? 'Waiting for GPS…' : '—';
    $('#next-stop-eta').textContent = '–';
    $('#next-stop-note').textContent = '';
  }

  const outage = state.gps && state.gps.outage;
  const age = state.lastFixAt ? Math.round((now - state.lastFixAt) / 1000) : null;
  $('#gps-state').textContent = outage ? 'No signal (simulated)' : state.lastFixAt ? 'Receiving' : 'Searching…';
  $('#gps-detail').textContent = `${state.fixCount} positions · last ${age === null ? '—' : `${age} s ago`}${state.gps && state.gps.dwelling ? ' · stopped at stop' : ''}`;

  for (const button of document.querySelectorAll('#occupancy [data-level]')) {
    button.setAttribute('aria-pressed', String(button.dataset.level === v.occupancy));
  }
  renderUpload();
}

function renderUpload() {
  const s = state.uploadStatus;
  if (!s) return;
  const labels = { idle: 'Up to date', sending: 'Sending…', offline: 'Offline (simulated)', paused: 'Holding positions while the trip ends…', retrying: `Retrying in ${Math.ceil(s.retryInMs / 1000)} s`, stopped: 'Stopped' };
  $('#upload-state').textContent = labels[s.state] || s.state;
  const parts = [`${s.queued} queued`];
  if (s.dropped) parts.push(`${s.dropped} dropped (queue full)`);
  if (s.lastError && s.state === 'retrying') parts.push(s.lastError);
  $('#upload-detail').textContent = parts.join(' · ');
}

function log(message) {
  const list = $('#log');
  const item = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.append(time, document.createTextNode(message));
  list.prepend(item);
  while (list.children.length > 40) list.lastChild.remove();
}
