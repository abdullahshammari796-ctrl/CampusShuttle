import { api, logout, requireUser } from './api.js';
import { barChart, inkFor, sequentialColor } from './charts.js';
import { LiveFeed } from './live-feed.js';
import { CampusMap } from './map.js';
import {
  $, $$, bindAppBar, enableTooltips, etaText, formatAgo, formatClock, formatDateTime, formatDistance, formatDuration, html, icon,
  occupancyPill, paintColors, render, routeDot, setConnection, signalPill, toast,
} from './ui.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const state = {
  network: null,
  stops: new Map(),
  routes: new Map(),
  vehicles: new Map(),
  waiting: {},
  drivers: new Map(),
  overview: null,
  feed: null,
  map: null,
  trackMap: null,
  loaded: new Set(),
  forecast: null,
  newRouteStops: [],
  terminateTripId: null,
  editRouteId: null,
};

const user = await requireUser('office');
if (user) start();

async function start() {
  bindAppBar(user, logout);
  await loadNetwork();
  state.map = new CampusMap($('#live-map'), {});
  state.map.setNetwork(state.network);

  const feed = new LiveFeed();
  state.feed = feed;
  feed.onState((s) => setConnection($('#conn'), s));
  feed.on('snapshot', (s) => {
    state.vehicles = new Map(s.vehicles.map((v) => [v.tripId, v]));
    state.waiting = s.waiting;
    state.map.setVehicles(s.vehicles);
    state.map.setWaiting(s.waiting);
    refreshActiveTrips();
    refreshOverview(); // our own connection now counts as a live viewer
    renderLive();
  });
  feed.on('vehicle', (v) => {
    const isNew = !state.vehicles.has(v.tripId);
    state.vehicles.set(v.tripId, v);
    state.map.upsertVehicle(v);
    if (isNew) refreshActiveTrips();
    renderLive();
  });
  feed.on('vehicle-removed', ({ tripId }) => {
    state.vehicles.delete(tripId);
    state.map.removeVehicle(tripId);
    renderLive();
    if (state.loaded.has('trips')) loadTrips();
  });
  feed.on('waiting', ({ stopId, waiting }) => {
    state.waiting = { ...state.waiting, [stopId]: waiting };
    state.map.setWaiting(state.waiting);
    renderLive();
  });
  feed.on('network', async () => {
    await loadNetwork();
    state.map.setNetwork(state.network);
    if (state.loaded.has('routes')) renderRoutes();
  });
  feed.connect();

  $('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) showTab(tab.dataset.tab);
  });
  $('#active-table').addEventListener('click', onActiveTableClick);
  // Dialog forms use method=dialog; act on the (synchronous) submit event and its submitter.
  $('#terminate-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'confirm') onTerminateConfirm();
  });
  $('#forecast-date').addEventListener('change', loadForecast);
  $('#forecast-model').addEventListener('change', loadForecast);
  $('#forecast-heat').addEventListener('click', onHeatClick);
  $('#routes-table').addEventListener('click', onRoutesTableClick);
  $('#route-edit-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'confirm') onRouteEditConfirm();
  });
  $('#route-form').addEventListener('submit', onCreateRoute);
  $('#route-stop-button').addEventListener('click', addRouteStop);
  $('#route-stop-clear').addEventListener('click', () => {
    state.newRouteStops = [];
    renderRouteStops();
  });
  $('#route-stops').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-index]');
    if (!chip) return;
    state.newRouteStops.splice(Number(chip.dataset.index), 1);
    renderRouteStops();
  });
  $('#trip-filter').addEventListener('change', loadTrips);
  $('#trips-table').addEventListener('click', onTripsTableClick);
  $('#track-close').addEventListener('click', () => $('#track-card').classList.add('hidden'));
  $('#system-refresh').addEventListener('click', loadSystem);
  enableTooltips($('#forecast-heat'));
  enableTooltips($('#history-heat'));

  refreshOverview();
  setInterval(refreshOverview, 10_000);
  setInterval(refreshActiveTrips, 15_000);
  setInterval(renderLive, 5000);
}

async function loadNetwork() {
  state.network = await api('/api/network');
  state.stops = new Map(state.network.stops.map((s) => [s.id, s]));
  state.routes = new Map(state.network.routes.map((r) => [r.id, r]));
}

function showTab(name) {
  for (const button of $$('.tabs [data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === name));
  for (const panel of $$('[role=tabpanel]')) panel.classList.toggle('hidden', panel.id !== `tab-${name}`);
  if (name === 'demand' && !state.loaded.has('demand')) loadDemand();
  if (name === 'routes' && !state.loaded.has('routes')) renderRoutes();
  if (name === 'trips') loadTrips();
  if (name === 'system') loadSystem();
}

/* ------------------------------ Live operations ------------------------------ */

async function refreshOverview() {
  try {
    state.overview = await api('/api/office/overview');
    renderLive();
  } catch {
    /* transient; next poll retries */
  }
}

async function refreshActiveTrips() {
  try {
    const { trips } = await api('/api/office/trips/active');
    state.drivers = new Map(trips.map((t) => [t.tripId, t.driverName]));
    renderLive();
  } catch {
    /* transient */
  }
}

function renderLive() {
  const vehicles = [...state.vehicles.values()];
  const now = state.feed ? state.feed.now() : Date.now();
  const stale = vehicles.filter((v) => v.signal.status === 'STALE').length;
  const lost = vehicles.filter((v) => v.signal.status === 'LOST').length;
  const waitingTotal = Object.values(state.waiting).reduce((s, n) => s + n, 0);
  const stopsWithWaiting = Object.values(state.waiting).filter((n) => n > 0).length;

  $('#kpi-active').textContent = vehicles.length;
  $('#kpi-active-detail').textContent = vehicles.length ? `on ${new Set(vehicles.map((v) => v.routeId)).size} route(s)` : 'No trips running';
  $('#kpi-signal').textContent = stale + lost;
  $('#kpi-signal-detail').textContent = stale + lost ? `${stale} delayed · ${lost} lost` : 'All positions live';
  $('#kpi-waiting').textContent = waitingTotal;
  $('#kpi-waiting-detail').textContent = waitingTotal ? `at ${stopsWithWaiting} stop(s)` : 'Nobody waiting';
  const viewers = state.overview?.viewers;
  $('#kpi-viewers').textContent = viewers ? viewers.clients : '–';
  $('#kpi-viewers-detail').textContent = viewers ? `${viewers.byRole.student} students · ${viewers.byRole.driver} drivers · ${viewers.byRole.office} office` : '';

  const served = state.network.stops.filter((s) => state.network.routes.some((r) => r.active && r.stopIds.includes(s.id)));
  const rows = served.map((s) => ({ stop: s, n: state.waiting[s.id] || 0 })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  render($('#waiting-bars'), html`${rows.map((r) => html`<div class="list-item">
    <div class="grow"><div class="title small">${r.stop.name}</div><div class="hbar" data-width="${(r.n / max) * 100}"></div></div>
    <strong class="mono">${r.n}</strong></div>`)}`);
  for (const bar of $$('#waiting-bars .hbar')) {
    bar.style.width = `${Math.max(bar.dataset.width > 0 ? 4 : 0, Number(bar.dataset.width))}%`;
  }

  $('#active-hint').textContent = vehicles.length ? `${vehicles.length} running` : '';
  if (vehicles.length === 0) {
    render($('#active-table'), html`<tbody><tr><td class="empty">No active trips. Start one from the driver interface.</td></tr></tbody>`);
    return;
  }
  render($('#active-table'), html`
    <thead><tr><th>Shuttle</th><th>Route</th><th>Driver</th><th>GPS</th><th>Last position</th><th>Load</th><th>Next stop</th><th></th></tr></thead>
    <tbody>${vehicles.map((v) => {
      const next = v.nextStops[0];
      return html`<tr>
        <td><strong>${v.shuttleLabel}</strong></td>
        <td><span class="row">${routeDot(v.routeColor)}${v.routeName}</span></td>
        <td>${state.drivers.get(v.tripId) ?? '…'}</td>
        <td>${signalPill(v.signal.status)}</td>
        <td class="small">${v.signal.lastFixAt ? formatAgo(now - v.signal.lastFixAt) : 'none yet'}${v.offRoute ? ' · off route' : ''}</td>
        <td>${occupancyPill(v.occupancy)}</td>
        <td class="small">${next ? `${state.stops.get(next.stopId)?.name ?? next.stopId} · ${next.confidence === 'approximate' ? '~' : ''}${etaText((next.arrivalAt - now) / 1000)}` : '—'}</td>
        <td><div class="row"><button class="btn btn-sm" type="button" data-track="${v.tripId}">Track</button><button class="btn btn-sm btn-danger" type="button" data-terminate="${v.tripId}">End</button></div></td>
      </tr>`;
    })}</tbody>`);
  paintColors($('#active-table'));
}

function onActiveTableClick(event) {
  const terminate = event.target.closest('[data-terminate]');
  const track = event.target.closest('[data-track]');
  if (terminate) {
    const v = state.vehicles.get(terminate.dataset.terminate);
    if (!v) return;
    state.terminateTripId = v.tripId;
    $('#terminate-text').textContent = `${v.shuttleLabel} on ${v.routeName} (driver: ${state.drivers.get(v.tripId) ?? 'unknown'}) will be removed from the live map. The driver's app will stop sharing location.`;
    $('#terminate-form').reset();
    $('#terminate-dialog').showModal();
  } else if (track) {
    showTab('trips');
    showTrack(track.dataset.track);
  }
}

async function onTerminateConfirm() {
  if (!state.terminateTripId) return;
  try {
    await api(`/api/office/trips/${encodeURIComponent(state.terminateTripId)}/terminate`, { method: 'POST', body: { reason: $('#terminate-form').reason.value } });
    toast('Trip ended and recorded in the audit log.');
  } catch (e) {
    toast(e.message, 'error');
  }
  state.terminateTripId = null;
}

/* ------------------------------ Demand & forecast ------------------------------ */

async function loadDemand() {
  state.loaded.add('demand');
  const { models, today } = await api('/api/office/demand/models');
  render($('#forecast-model'), html`${models.map((m) => html`<option value="${m.id}">${m.label}</option>`)}`);
  $('#forecast-date').value = today;
  state.models = models;
  await Promise.all([loadForecast(), loadHistory(), loadEvaluation()]);
}

function renderDataNotice(sources) {
  const box = $('#demand-notice');
  if (sources.includes('synthetic')) {
    box.className = 'banner banner-warn';
    render(box, html`${icon('alert')}<div><strong>Demonstration data.</strong> The history below includes SYNTHETIC records generated by the prototype from stated assumptions (see docs/demand-prediction.md). ${sources.includes('live') ? 'It also includes live waiting requests recorded by this system. ' : ''}Forecasts and accuracy figures illustrate the method only; they do not describe real university demand.</div>`);
  } else {
    box.className = 'banner banner-info';
    render(box, html`${icon('info')}<div>All history shown was recorded live by this system.</div>`);
  }
}

async function loadForecast() {
  const date = $('#forecast-date').value;
  const model = $('#forecast-model').value;
  try {
    const f = await api(`/api/office/demand/forecast?date=${encodeURIComponent(date)}&model=${encodeURIComponent(model)}`);
    state.forecast = f;
    renderForecast(f);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function renderForecast(f) {
  renderDataNotice(f.dataSources);
  $('#forecast-hint').textContent = `${f.weekday} ${f.date}`;
  $('#model-description').textContent = f.model.description;
  const total = f.hourlyTotals.reduce((s, h) => s + h.expected, 0);
  const busiest = [...f.stops].sort((a, b) => b.total - a.total)[0];
  render($('#forecast-kpis'), html`
    <div class="card kpi"><div class="label">Expected requests</div><div class="value">${Math.round(total)}</div><div class="detail">whole day, all stops</div></div>
    <div class="card kpi"><div class="label">Peak hour</div><div class="value">${f.peak ? hourLabel(f.peak.hour) : '–'}</div><div class="detail">${f.peak ? `${Math.round(f.peak.expected)} expected requests` : 'not enough history'}</div></div>
    <div class="card kpi"><div class="label">Busiest stop</div><div class="value text">${busiest && busiest.total > 0 ? busiest.stopName : '–'}</div><div class="detail">${busiest && busiest.total > 0 ? `${Math.round(busiest.total)} expected` : ''}</div></div>
    <div class="card kpi"><div class="label">Cells with history</div><div class="value">${f.coverage.forecastCells}</div><div class="detail">${f.coverage.noHistoryCells} without history (no forecast)</div></div>`);

  barChart($('#forecast-chart'), f.hourlyTotals.map((h) => ({
    label: hourLabel(h.hour),
    value: h.expected,
    tip: `${hourLabel(h.hour)}–${hourLabel(h.hour + 1)} · ${h.expected} expected requests`,
  })), { height: 200, tickEvery: 2, label: 'Expected waiting requests per hour' });

  const max = Math.max(1, ...f.stops.flatMap((s) => s.predictions.map((p) => p.expected ?? 0)));
  // Each cell holds a real button, so the explanation (UC5 step 3) can be opened with the keyboard too.
  const cellButton = (label, text) => html`<button type="button" class="heat-cell" aria-label="${label}">${text}</button>`;
  render($('#forecast-heat'), html`
    <thead><tr><th></th>${f.hours.map((h) => html`<th>${String(h).padStart(2, '0')}</th>`)}<th>Total</th></tr></thead>
    <tbody>${f.stops.map((s) => html`<tr><th>${s.stopName}</th>${s.predictions.map((p) => {
      if (p.expected === null) return html`<td class="nodata clickable" data-stop="${s.stopId}" data-hour="${p.hour}" data-tip="${s.stopName} ${hourLabel(p.hour)}: no history">${cellButton(`${s.stopName} ${hourLabel(p.hour)}: no history`, '–')}</td>`;
      const bg = sequentialColor(p.expected, max);
      const shown = p.expected >= 1 || p.expected === 0 ? String(Math.round(p.expected)) : '<1';
      return html`<td class="clickable" data-stop="${s.stopId}" data-hour="${p.hour}" data-bg="${bg ?? ''}" data-ink="${inkFor(bg)}" data-tip="${s.stopName} ${hourLabel(p.hour)}: ${p.expected} expected (range ${p.low}–${p.high})">${cellButton(`${s.stopName} ${hourLabel(p.hour)}: ${shown} expected`, shown)}</td>`;
    })}<td class="num"><strong>${Math.round(s.total)}</strong></td></tr>`)}</tbody>`);
  paintHeat($('#forecast-heat'));
}

function paintHeat(table) {
  for (const cell of table.querySelectorAll('td[data-bg]')) {
    if (cell.dataset.bg) {
      cell.style.background = cell.dataset.bg;
      cell.style.color = cell.dataset.ink;
    } else {
      cell.style.background = 'var(--seq-0)';
    }
  }
}

async function onHeatClick(event) {
  const cell = event.target.closest('td[data-stop]');
  if (!cell) return;
  for (const c of $$('#forecast-heat td.selected')) c.classList.remove('selected');
  cell.classList.add('selected');
  const params = new URLSearchParams({ stopId: cell.dataset.stop, hour: cell.dataset.hour, date: $('#forecast-date').value, model: $('#forecast-model').value });
  try {
    const p = await api(`/api/office/demand/explain?${params}`);
    render($('#explain'), html`<div class="stack">
      <div class="row between"><strong>${p.stopName} · ${hourLabel(p.hour)}–${hourLabel(p.hour + 1)} · ${p.date}</strong><span class="pill pill-brand">${p.model}</span></div>
      <div>${p.explanation}</div>
      ${p.expected === null ? '' : html`<dl class="kv"><dt>Expected</dt><dd>${p.expected} requests</dd><dt>Plausible range</dt><dd>${p.low}–${p.high} (lowest–highest of the basis)</dd></dl>`}
      ${p.basis.length ? html`<table class="data"><thead><tr><th>Past date</th><th>Day</th><th class="num">Requests</th><th class="num">Weight</th></tr></thead>
        <tbody>${p.basis.map((b) => html`<tr><td>${b.date}</td><td>${WEEKDAYS[new Date(`${b.date}T00:00:00Z`).getUTCDay()]}</td><td class="num">${b.count}</td><td class="num">${b.weight}</td></tr>`)}</tbody></table>` : ''}
    </div>`);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadHistory() {
  const h = await api('/api/office/demand/history?weeks=8');
  $('#history-hint').textContent = `${h.from} → ${h.to} · sources: ${h.dataSources.join(', ') || 'none'}`;
  barChart($('#history-chart'), h.daily.map((d) => ({
    label: d.date.slice(5),
    value: d.total,
    cls: d.weekday === 0 || d.weekday === 6 ? 'weekend' : '',
    tip: `${WEEKDAYS[d.weekday]} ${d.date}: ${d.total} requests`,
  })), { height: 210, tickEvery: 7, label: 'Waiting requests per day' });

  const max = Math.max(1, ...h.weekdayHour.rows.flatMap((r) => r.values));
  render($('#history-heat'), html`
    <thead><tr><th></th>${h.weekdayHour.hours.map((x) => html`<th>${String(x).padStart(2, '0')}</th>`)}</tr></thead>
    <tbody>${h.weekdayHour.rows.map((r) => html`<tr><th>${r.name.slice(0, 3)}</th>${r.values.map((v, i) => {
      const bg = sequentialColor(v, max);
      return html`<td data-bg="${bg ?? ''}" data-ink="${inkFor(bg)}" data-tip="${r.name} ${hourLabel(h.weekdayHour.hours[i])}: ${v} requests on average">${v >= 1 ? Math.round(v) : v > 0 ? '<1' : '0'}</td>`;
    })}</tr>`)}</tbody>`);
  paintHeat($('#history-heat'));

  const top = Math.max(1, ...h.byStop.map((s) => s.total));
  render($('#history-stops'), html`${h.byStop.map((s) => html`<div class="list-item"><div class="grow"><div class="title small">${s.stopName}</div><div class="hbar" data-width="${(s.total / top) * 100}"></div></div><strong class="mono">${s.total}</strong></div>`)}`);
  for (const bar of $$('#history-stops .hbar')) bar.style.width = `${Number(bar.dataset.width)}%`;
}

async function loadEvaluation() {
  const e = await api('/api/office/demand/evaluation?days=14');
  $('#eval-hint').textContent = `${e.testFrom} → ${e.testTo}`;
  const withMae = e.results.filter((r) => r.mae !== null);
  const best = withMae.length ? withMae.reduce((a, b) => (b.mae < a.mae ? b : a)) : null;
  render($('#eval-table'), html`
    <thead><tr><th>Model</th><th class="num">MAE</th><th class="num">RMSE</th><th class="num">Bias</th><th class="num">Range coverage</th><th class="num">Stop-hours</th></tr></thead>
    <tbody>${e.results.map((r) => html`<tr class="${best && r.predictorId === best.predictorId ? 'best' : ''}">
      <td>${r.label}${best && r.predictorId === best.predictorId ? html` <span class="pill pill-good">${icon('check')}lowest error</span>` : ''}</td>
      <td class="num">${r.mae ?? '–'}</td><td class="num">${r.rmse ?? '–'}</td><td class="num">${r.bias ?? '–'}</td>
      <td class="num">${r.intervalCoverage === null ? '–' : `${Math.round(r.intervalCoverage * 100)}%`}</td>
      <td class="num">${r.samples}${r.skipped ? ` (+${r.skipped} skipped)` : ''}</td></tr>`)}</tbody>`);
  const box = $('#eval-note');
  if (e.dataSources.includes('synthetic')) {
    box.className = 'banner banner-warn';
    render(box, html`${icon('alert')}<div>Computed on SYNTHETIC demonstration data. These numbers show that the evaluation pipeline works; they are <strong>not</strong> evidence of how accurately any model would predict real campus demand.</div>`);
  } else {
    box.className = 'banner banner-info';
    render(box, html`${icon('info')}<div>Computed on live data recorded by this system.</div>`);
  }
}

/* ------------------------------ Routes ------------------------------ */

async function renderRoutes() {
  state.loaded.add('routes');
  const { routes, stops } = await api('/api/office/routes');
  state.officeRoutes = routes;
  const names = new Map(stops.map((s) => [s.id, s.name]));
  const lengths = new Map(state.network.routes.map((r) => [r.id, r.lengthMeters]));
  render($('#routes-table'), html`
    <thead><tr><th>Route</th><th>Stops (in order)</th><th class="num">Length</th><th class="num">Speed</th><th class="num">Dwell</th><th>Status</th><th></th></tr></thead>
    <tbody>${routes.map((r) => html`<tr>
      <td><span class="row">${routeDot(r.color)}<strong>${r.name}</strong>${r.loop ? html`<span class="pill pill-neutral">loop</span>` : ''}</span></td>
      <td class="small">${r.stopIds.map((id) => names.get(id) ?? id).join(' → ')}</td>
      <td class="num">${lengths.has(r.id) ? formatDistance(lengths.get(r.id)) : '–'}</td>
      <td class="num">${r.nominalSpeedKmh} km/h</td>
      <td class="num">${r.dwellSeconds} s</td>
      <td>${r.active ? html`<span class="pill pill-good">${icon('check')}In service</span>` : html`<span class="pill pill-neutral">${icon('dot')}Inactive</span>`}</td>
      <td><div class="row">
        <button class="btn btn-sm" type="button" data-toggle="${r.id}">${r.active ? 'Take out of service' : 'Put in service'}</button>
        <button class="btn btn-sm" type="button" data-edit="${r.id}">Edit</button>
      </div></td></tr>`)}</tbody>`);
  paintColors($('#routes-table'));
  render($('#route-stop-add'), html`${stops.map((s) => html`<option value="${s.id}">${s.name}</option>`)}`);
  renderRouteStops();
}

async function onRoutesTableClick(event) {
  const toggle = event.target.closest('[data-toggle]');
  const edit = event.target.closest('[data-edit]');
  if (toggle) {
    const route = state.officeRoutes.find((r) => r.id === toggle.dataset.toggle);
    try {
      await api(`/api/office/routes/${encodeURIComponent(route.id)}`, { method: 'PATCH', body: { active: !route.active } });
      toast(`${route.name} is now ${route.active ? 'out of service' : 'in service'}.`);
      await renderRoutes();
    } catch (e) {
      toast(e.message, 'error');
    }
  } else if (edit) {
    const route = state.officeRoutes.find((r) => r.id === edit.dataset.edit);
    state.editRouteId = route.id;
    const form = $('#route-edit-form');
    form.name.value = route.name;
    form.color.value = route.color;
    form.nominalSpeedKmh.value = route.nominalSpeedKmh;
    form.dwellSeconds.value = route.dwellSeconds;
    $('#route-dialog').showModal();
  }
}

async function onRouteEditConfirm() {
  if (!state.editRouteId) return;
  const form = $('#route-edit-form');
  try {
    await api(`/api/office/routes/${encodeURIComponent(state.editRouteId)}`, {
      method: 'PATCH',
      body: { name: form.name.value, color: form.color.value, nominalSpeedKmh: Number(form.nominalSpeedKmh.value), dwellSeconds: Number(form.dwellSeconds.value) },
    });
    toast('Route updated.');
    await renderRoutes();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function addRouteStop() {
  const id = $('#route-stop-add').value;
  if (!id || state.newRouteStops.includes(id)) return;
  state.newRouteStops.push(id);
  renderRouteStops();
}

function renderRouteStops() {
  const box = $('#route-stops');
  if (state.newRouteStops.length === 0) {
    render(box, html`<span class="muted small">Add at least two stops in driving order.</span>`);
    return;
  }
  render(box, html`${state.newRouteStops.map((id, i) => html`<button type="button" class="chip" data-index="${i}" aria-label="Remove ${state.stops.get(id)?.name}">${i + 1}. ${state.stops.get(id)?.name ?? id} ✕</button>`)}`);
}

async function onCreateRoute(event) {
  event.preventDefault();
  const form = event.target;
  const error = $('#route-error');
  error.classList.add('hidden');
  try {
    const { route } = await api('/api/office/routes', {
      method: 'POST',
      body: {
        name: form.name.value,
        color: form.color.value,
        loop: form.loop.checked,
        nominalSpeedKmh: Number(form.nominalSpeedKmh.value),
        dwellSeconds: Number(form.dwellSeconds.value),
        stopIds: state.newRouteStops,
      },
    });
    toast(`Route "${route.name}" created (inactive).`);
    form.reset();
    state.newRouteStops = [];
    await renderRoutes();
  } catch (e) {
    error.textContent = e.message;
    error.classList.remove('hidden');
  }
}

/* ------------------------------ Trips ------------------------------ */

async function loadTrips() {
  state.loaded.add('trips');
  const status = $('#trip-filter').value;
  const { trips } = await api(`/api/office/trips?limit=100${status ? `&status=${status}` : ''}`);
  if (trips.length === 0) {
    render($('#trips-table'), html`<tbody><tr><td class="empty">No trips recorded yet.</td></tr></tbody>`);
    return;
  }
  const statusPill = (t) => t.status === 'ACTIVE' ? html`<span class="pill pill-good">${icon('play')}Active</span>`
    : t.status === 'COMPLETED' ? html`<span class="pill pill-neutral">${icon('check')}Completed</span>`
      : html`<span class="pill pill-critical">${icon('stop')}Terminated</span>`;
  const reasons = { DRIVER_ENDED: 'Ended by driver', OFFICE_TERMINATED: 'Ended by office', NO_SIGNAL_TIMEOUT: 'Closed: no GPS for 30 min' };
  render($('#trips-table'), html`
    <thead><tr><th>Started</th><th>Route</th><th>Shuttle</th><th>Driver</th><th>Status</th><th class="num">Duration</th><th>End reason</th><th></th></tr></thead>
    <tbody>${trips.map((t) => html`<tr>
      <td>${formatDateTime(t.startedAt)}</td><td>${t.routeName}</td><td>${t.shuttleLabel}</td><td>${t.driverName}</td>
      <td>${statusPill(t)}</td>
      <td class="num">${formatDuration(((t.endedAt ?? Date.now()) - t.startedAt) / 1000)}</td>
      <td class="small">${t.endReason ? reasons[t.endReason] ?? t.endReason : '—'}</td>
      <td><button class="btn btn-sm" type="button" data-track="${t.id}">Track</button></td></tr>`)}</tbody>`);
}

function onTripsTableClick(event) {
  const button = event.target.closest('[data-track]');
  if (button) showTrack(button.dataset.track);
}

async function showTrack(tripId) {
  try {
    const t = await api(`/api/office/trips/${encodeURIComponent(tripId)}/track`);
    $('#track-card').classList.remove('hidden');
    $('#track-title').textContent = `${t.trip.shuttleLabel} · ${t.trip.routeName} · ${formatDateTime(t.trip.startedAt)}`;
    if (!state.trackMap) state.trackMap = new CampusMap($('#track-map'), { legend: false });
    state.trackMap.setNetwork(state.network);
    state.trackMap.setRouteFilter([t.trip.routeId]);
    state.trackMap.setTrack(t.points);
    render($('#track-stats'), html`
      <dt>Driver</dt><dd>${t.trip.driverName}</dd>
      <dt>Status</dt><dd>${t.trip.status.toLowerCase()}</dd>
      <dt>Duration</dt><dd>${formatDuration(t.stats.durationSeconds)}</dd>
      <dt>GPS positions</dt><dd>${t.stats.fixes}</dd>
      <dt>Distance (from GPS)</dt><dd>${formatDistance(t.stats.distanceMeters)}</dd>
      <dt>Longest gap</dt><dd>${formatDuration(t.stats.longestGapSeconds)}</dd>
      <dt>Gaps over stale threshold</dt><dd>${t.stats.gapsOverStaleThreshold}</dd>
      <dt>First / last fix</dt><dd>${t.points.length ? `${formatClock(t.points[0].recordedAt)} / ${formatClock(t.points[t.points.length - 1].recordedAt)}` : '—'}</dd>`);
    $('#track-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast(e.message, 'error');
  }
}

/* ------------------------------ System ------------------------------ */

async function loadSystem() {
  const s = await api('/api/office/system');
  render($('#system-kv'), html`
    <dt>Server time</dt><dd>${formatDateTime(s.serverTime)}</dd>
    <dt>Uptime</dt><dd>${formatDuration(s.uptimeSeconds)}</dd>
    <dt>Memory (RSS)</dt><dd>${s.memoryMb} MB</dd>
    <dt>ETA strategy</dt><dd>${s.etaStrategy.id}<div class="small muted">${s.etaStrategy.description}</div></dd>
    <dt>Signal thresholds</dt><dd>delayed after ${s.thresholds.staleAfterSeconds} s · lost after ${s.thresholds.lostAfterSeconds} s · auto-close after ${s.thresholds.abandonAfterMinutes} min</dd>
    <dt>Live connections</dt><dd>${s.viewers.clients} (${s.viewers.byRole.student} student, ${s.viewers.byRole.driver} driver, ${s.viewers.byRole.office} office)</dd>
    <dt>Push messages</dt><dd>${s.viewers.messagesSent} sent · ${s.viewers.messagesSkipped} skipped for slow clients · ${s.viewers.snapshotsSent} snapshots · ${s.viewers.sessionsExpired} closed at session expiry</dd>
    <dt>Domain events</dt><dd>${s.eventBus.published} published · ${s.eventBus.handlerErrors} handler errors</dd>`);
  render($('#privacy-info'), html`
    <p>${icon('pin')} Students never share their location; they choose a stop.</p>
    <p>${icon('users')} Waiting requests store a keyed pseudonym, not the student's identity; it is erased ${s.retention.waitingDeidentifyHours} h after the request closes. Requests expire after ${s.waitingTtlMinutes} min.</p>
    <p>${icon('bus')} Driver location is collected only during an active trip. Raw GPS traces are deleted after ${s.retention.locationFixDays} days.</p>
    <p>${icon('info')} Students see shuttles, never driver names. Office actions are written to the audit log.</p>`);
  render($('#audit-table'), s.audit.length === 0
    ? html`<tbody><tr><td class="empty">No office actions recorded yet.</td></tr></tbody>`
    : html`<thead><tr><th>When</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>${s.audit.map((a) => html`<tr><td>${formatDateTime(a.at)}</td><td><span class="mono">${a.action}</span></td><td class="mono">${a.target}</td><td class="small">${a.details}</td></tr>`)}</tbody>`);
}
