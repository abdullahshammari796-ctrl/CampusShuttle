import { ApiError, api, logout, requireUser } from './api.js';
import { LiveFeed } from './live-feed.js';
import { CampusMap } from './map.js';
import {
  $, bindAppBar, etaText, formatAgo, formatClock, html, icon, occupancyPill, paintColors, render,
  routeDot, setConnection, signalPill, toast,
} from './ui.js';

const STOP_KEY = 'campus-shuttle.stop';
const state = {
  network: null,
  stops: new Map(),
  routes: new Map(),
  vehicles: new Map(),
  waiting: {},
  selectedStop: null,
  routeFilter: null,
  request: null,
};

const user = await requireUser('student');
if (user) start();

async function start() {
  bindAppBar(user, logout);
  const feed = new LiveFeed();
  const map = new CampusMap($('#map'), { onStopClick: selectStop });

  await loadNetwork(map);
  restoreStop();
  await refreshRequest();

  feed.onState((s) => {
    setConnection($('#conn'), s);
    renderNotice(s);
  });
  feed.on('snapshot', (s) => {
    state.vehicles = new Map(s.vehicles.map((v) => [v.tripId, v]));
    state.waiting = s.waiting;
    map.setVehicles(s.vehicles);
    map.setWaiting(s.waiting);
    renderAll();
  });
  feed.on('vehicle', (v) => {
    state.vehicles.set(v.tripId, v);
    map.upsertVehicle(v);
    renderAll();
  });
  feed.on('vehicle-removed', ({ tripId }) => {
    state.vehicles.delete(tripId);
    map.removeVehicle(tripId);
    renderAll();
  });
  feed.on('waiting', ({ stopId, waiting }) => {
    state.waiting = { ...state.waiting, [stopId]: waiting };
    map.setWaiting(state.waiting);
    renderStopInfo();
  });
  feed.on('arrival', async ({ stopId, routeId }) => {
    if (state.request && state.request.status === 'WAITING' && state.request.stopId === stopId) {
      await refreshRequest();
      if (state.request && state.request.status === 'SERVED') {
        toast(`${state.routes.get(routeId)?.name ?? 'A shuttle'} has reached ${state.stops.get(stopId)?.name}.`);
      }
    }
  });
  feed.on('network', () => loadNetwork(map).then(renderAll));
  feed.connect();
  state.feed = feed;

  $('#stop-select').addEventListener('change', (e) => selectStop(e.target.value));
  $('#route-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-route]');
    if (!chip) return;
    state.routeFilter = chip.dataset.route || null;
    map.setRouteFilter(state.routeFilter ? [state.routeFilter] : null);
    renderChips();
    renderAll();
  });
  $('#waiting-card').addEventListener('click', onWaitingAction);
  state.map = map;
  map.selectStop(state.selectedStop);

  // Relative times ("2 min", "updated 8 s ago") tick without new data.
  setInterval(renderAll, 5000);
  renderAll();
}

async function loadNetwork(map) {
  const network = await api('/api/network');
  state.network = network;
  state.stops = new Map(network.stops.map((s) => [s.id, s]));
  state.routes = new Map(network.routes.map((r) => [r.id, r]));
  map.setNetwork(network);
  const select = $('#stop-select');
  const servedStops = network.stops.filter((s) => network.routes.some((r) => r.stopIds.includes(s.id)));
  render(select, html`${servedStops.map((s) => html`<option value="${s.id}">${s.name}</option>`)}`);
  if (state.selectedStop) select.value = state.selectedStop;
  renderChips();
}

function restoreStop() {
  let saved = null;
  try {
    saved = localStorage.getItem(STOP_KEY);
  } catch {
    saved = null;
  }
  const first = $('#stop-select').value;
  selectStop(saved && state.stops.has(saved) ? saved : first, false);
}

function selectStop(stopId, persist = true) {
  if (!state.stops.has(stopId)) return;
  state.selectedStop = stopId;
  $('#stop-select').value = stopId;
  if (state.map) state.map.selectStop(stopId);
  if (persist) {
    try {
      localStorage.setItem(STOP_KEY, stopId);
    } catch {
      /* storage unavailable: selection just is not remembered */
    }
  }
  renderAll();
  renderWaiting();
}

async function refreshRequest() {
  try {
    const { request } = await api('/api/student/waiting');
    state.request = request;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  renderWaiting();
}

function renderChips() {
  const routes = [...state.routes.values()];
  render($('#route-chips'), html`
    <button class="chip" type="button" data-route="" aria-pressed="${!state.routeFilter}">All routes</button>
    ${routes.map((r) => html`<button class="chip" type="button" data-route="${r.id}" aria-pressed="${state.routeFilter === r.id}">${routeDot(r.color)}${r.name}</button>`)}
  `);
  paintColors($('#route-chips'));
}

function renderAll() {
  renderStopInfo();
  renderArrivals();
  renderFleet();
  // Only the open-request view has a ticking countdown; re-rendering the form would reset the route picker.
  if (state.request && state.request.status === 'WAITING') renderWaiting();
}

function renderNotice(connection) {
  const box = $('#notice');
  if (connection === 'expired') {
    box.className = 'banner banner-critical';
    render(box, html`${icon('alert')}<div>Your session has expired, so live updates have stopped. <a href="/">Sign in again</a>.</div>`);
  } else if (connection === 'closed') {
    box.className = 'banner banner-critical';
    render(box, html`${icon('alert')}<div>Live updates stopped. Your session may have expired. <a href="/">Sign in again</a>.</div>`);
  } else if (connection === 'reconnecting') {
    box.className = 'banner banner-warn';
    render(box, html`${icon('wifi')}<div>Connection interrupted, reconnecting… Times shown may be out of date.</div>`);
  } else {
    box.className = 'hidden';
  }
}

function renderStopInfo() {
  const stop = state.stops.get(state.selectedStop);
  if (!stop) return;
  const routes = [...state.routes.values()].filter((r) => r.stopIds.includes(stop.id));
  const waiting = state.waiting[stop.id] || 0;
  render($('#stop-info'), html`
    <div>${stop.description}</div>
    <div class="row small">${routes.map((r) => html`<span class="row">${routeDot(r.color)}${r.name}</span>`)}</div>
    <div>${icon('users')} ${waiting === 1 ? '1 person is' : `${waiting} people are`} waiting here</div>
  `);
  paintColors($('#stop-info'));
}

function visibleVehicles() {
  return [...state.vehicles.values()].filter((v) => !state.routeFilter || v.routeId === state.routeFilter);
}

function renderArrivals() {
  const stopId = state.selectedStop;
  const now = state.feed ? state.feed.now() : Date.now();
  const servingRoutes = new Set([...state.routes.values()].filter((r) => r.stopIds.includes(stopId)).map((r) => r.id));
  const rows = [];
  const noEta = [];
  for (const v of visibleVehicles()) {
    if (!servingRoutes.has(v.routeId)) continue;
    const eta = v.nextStops.find((s) => s.stopId === stopId);
    if (eta) rows.push({ v, eta, left: (eta.arrivalAt - now) / 1000 });
    else noEta.push(v);
  }
  rows.sort((a, b) => a.left - b.left);
  $('#arrivals-hint').textContent = state.stops.get(stopId)?.name ?? '';

  if (rows.length === 0 && noEta.length === 0) {
    render($('#arrivals'), html`<div class="empty">No shuttles are currently running on routes that serve this stop.</div>`);
    return;
  }
  render($('#arrivals'), html`
    ${rows.map(({ v, eta, left }) => {
      const approx = eta.confidence === 'approximate';
      let value = etaText(left);
      let note = `at ${formatClock(eta.arrivalAt)}`;
      if (approx) {
        value = eta.overdue || left <= 0 ? 'Due' : `~${etaText(left)}`;
        note = 'location delayed';
      }
      return html`<div class="list-item">
        ${routeDot(v.routeColor)}
        <div class="grow">
          <div class="title">${v.routeName} · ${v.shuttleLabel}</div>
          <div class="sub row">${signalPill(v.signal.status)} ${occupancyPill(v.occupancy)} <span>${Math.round(eta.distanceMeters)} m away</span></div>
        </div>
        <div class="eta"><div class="value ${approx ? 'approx' : ''}">${value}</div><div class="note">${note}</div></div>
      </div>`;
    })}
    ${noEta.map((v) => html`<div class="list-item">
      ${routeDot(v.routeColor)}
      <div class="grow">
        <div class="title">${v.routeName} · ${v.shuttleLabel}</div>
        <div class="sub">${v.signal.status === 'LOST' ? `GPS signal lost · last seen ${formatAgo(now - (v.signal.lastFixAt ?? now))}` : 'Trip starting · waiting for first GPS position'}</div>
      </div>
      <div class="eta"><div class="value">–</div><div class="note">no estimate</div></div>
    </div>`)}
  `);
  paintColors($('#arrivals'));
}

function renderFleet() {
  const vehicles = visibleVehicles();
  const now = state.feed ? state.feed.now() : Date.now();
  $('#fleet-hint').textContent = vehicles.length ? `${vehicles.length} active` : '';
  if (vehicles.length === 0) {
    render($('#fleet'), html`<div class="empty">No shuttles are running right now.</div>`);
    return;
  }
  render($('#fleet'), html`${vehicles.map((v) => {
    const next = v.nextStops[0];
    const nextName = next ? state.stops.get(next.stopId)?.name : null;
    const updated = v.signal.lastFixAt ? `updated ${formatAgo(now - v.signal.lastFixAt)}` : 'no position yet';
    return html`<div class="list-item">
      ${routeDot(v.routeColor)}
      <div class="grow">
        <div class="title">${v.shuttleLabel} · ${v.routeName}</div>
        <div class="sub">${nextName ? `Next: ${nextName}` : '—'} · ${updated}</div>
      </div>
      <div class="row">${signalPill(v.signal.status)}${occupancyPill(v.occupancy)}</div>
    </div>`;
  })}`);
  paintColors($('#fleet'));
}

function renderWaiting() {
  const card = $('#waiting-card');
  if (!card || !state.selectedStop) return;
  const stop = state.stops.get(state.selectedStop);
  const request = state.request;
  const now = state.feed ? state.feed.now() : Date.now();
  const routes = [...state.routes.values()].filter((r) => r.stopIds.includes(stop.id));
  const routeOptions = html`<label class="field">Route (optional)
    <select id="waiting-route"><option value="">Any route</option>${routes.map((r) => html`<option value="${r.id}">${r.name}</option>`)}</select>
  </label>`;

  if (request && request.status === 'WAITING') {
    const here = request.stopId === stop.id;
    const where = state.stops.get(request.stopId)?.name ?? 'a stop';
    const minutesLeft = Math.max(0, Math.round((request.expiresAt - now) / 60000));
    render(card, html`<div class="stack">
      <div class="banner banner-info">${icon('check')}<div><strong>You're on the waiting list at ${where}</strong><br>
        <span class="small">Since ${formatClock(request.createdAt)} · expires in ${minutesLeft} min. Drivers and the transport office see the number of people waiting, not who you are.</span></div></div>
      <div class="row">
        <button class="btn btn-danger" type="button" data-action="cancel">Cancel request</button>
        ${here ? '' : html`<button class="btn" type="button" data-action="create">Wait at ${stop.name} instead</button>`}
      </div>
    </div>`);
    return;
  }

  const recent = request && request.status !== 'WAITING'
    ? html`<div class="banner ${request.status === 'SERVED' ? 'banner-info' : 'banner-warn'}">${icon(request.status === 'SERVED' ? 'bus' : 'info')}<div>${
      request.status === 'SERVED'
        ? `A shuttle reached ${state.stops.get(request.stopId)?.name} at ${formatClock(request.closedAt)} and your request was closed.`
        : request.status === 'EXPIRED' ? 'Your last waiting request expired after 20 minutes.' : 'Your last waiting request was cancelled.'
    }</div></div>`
    : '';
  render(card, html`<div class="stack">
    ${recent}
    <p class="small muted">Tell the transport team you are waiting at <strong>${stop.name}</strong>. Requests expire after 20 minutes and close automatically when a shuttle arrives. Your location is never collected.</p>
    ${routes.length > 1 ? routeOptions : ''}
    <button class="btn btn-primary btn-lg" type="button" data-action="create">${icon('pin')} I'm waiting here</button>
  </div>`);
}

async function onWaitingAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'create') {
      const routeSelect = document.getElementById('waiting-route');
      const body = { stopId: state.selectedStop, routeId: routeSelect && routeSelect.value ? routeSelect.value : null };
      const { request } = await api('/api/student/waiting', { method: 'POST', body });
      state.request = request;
      toast(`You're on the waiting list at ${state.stops.get(request.stopId)?.name}.`);
    } else if (button.dataset.action === 'cancel' && state.request) {
      const { request } = await api(`/api/student/waiting/${encodeURIComponent(state.request.id)}`, { method: 'DELETE' });
      state.request = request;
      toast('Waiting request cancelled.');
    }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    button.disabled = false;
    renderWaiting();
  }
}
