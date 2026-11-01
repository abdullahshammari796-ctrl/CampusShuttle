// Schematic SVG campus map. Works fully offline (no map tiles, no third-party
// requests), which also means no viewer location is ever sent anywhere.

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 1000;
const PAD = 80;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.append(node);
  return node;
}

const shortName = (name) => name.replace(/\s*\(.*\)\s*$/, '');
const shortLabel = (label) => label.split(' ').pop();

export class CampusMap {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.vehicles = new Map();
    this.waiting = {};
    this.selectedStop = null;
    this.selectedTrip = null;
    this.routeFilter = null;
  }

  setNetwork(network) {
    this.network = network;
    const points = [...network.stops, ...network.routes.flatMap((r) => r.path)];
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const scale = (WIDTH - 2 * PAD) / Math.max(1e-9, (maxLng - minLng) * cos);
    this.height = Math.round((maxLat - minLat) * scale + 2 * PAD);
    this.project = (p) => ({ x: (p.lng - minLng) * cos * scale + PAD, y: (maxLat - p.lat) * scale + PAD });
    this.metersPerUnit = 111_320 / scale;
    this.draw();
  }

  draw() {
    this.container.innerHTML = '';
    this.container.classList.add('map-wrap');
    const svg = el('svg', { viewBox: `0 0 ${WIDTH} ${this.height}`, role: this.options.onStopClick ? 'group' : 'img', 'aria-label': 'Schematic map of shuttle routes, stops and live shuttle positions' });
    this.svg = svg;

    const grid = el('g', { class: 'map-grid' }, svg);
    const step = 100 / this.metersPerUnit; // 100 m grid
    for (let x = 0; x < WIDTH; x += step) el('line', { x1: x, y1: 0, x2: x, y2: this.height }, grid);
    for (let y = 0; y < this.height; y += step) el('line', { x1: 0, y1: y, x2: WIDTH, y2: y }, grid);

    this.routeLayer = el('g', {}, svg);
    // Routes out of service are not part of live operations; draw them (and stops only they serve) only when asked to.
    const routes = this.network.routes.filter((r) => r.active || this.options.showInactive);
    const servedStops = new Set(routes.flatMap((r) => r.stopIds));
    for (const route of routes) {
      const pts = route.path.map((p) => this.project(p)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      el('polyline', { class: 'map-route-casing', points: pts, 'data-route': route.id }, this.routeLayer);
      const line = el('polyline', { class: 'map-route', points: pts, stroke: route.color, 'data-route': route.id }, this.routeLayer);
      if (!route.active) line.setAttribute('stroke-dasharray', '10 10');
    }

    this.trackLayer = el('g', {}, svg);
    this.stopLayer = el('g', {}, svg);
    const labelled = [];
    for (const stop of this.network.stops.filter((s) => servedStops.has(s.id))) {
      const p = this.project(stop);
      const g = el('g', { class: 'map-stop', 'data-stop': stop.id, ...(this.options.onStopClick ? { tabindex: 0, role: 'button', 'aria-label': `Stop: ${stop.name}` } : {}) }, this.stopLayer);
      el('title', {}, g).textContent = stop.name;
      el('circle', { class: 'hit', cx: p.x, cy: p.y, r: 30 }, g);
      el('circle', { class: 'ring', cx: p.x, cy: p.y, r: 11 }, g);
      const name = shortName(stop.name);
      const duplicate = labelled.some((l) => l.name === name && Math.hypot(l.x - p.x, l.y - p.y) < 60);
      if (!duplicate) {
        const right = p.x < WIDTH - 330;
        const text = el('text', { x: right ? p.x + 22 : p.x - 22, y: p.y + 9, 'text-anchor': right ? 'start' : 'end' }, g);
        text.textContent = name;
        labelled.push({ name, x: p.x, y: p.y });
      }
      const activate = () => this.options.onStopClick && this.options.onStopClick(stop.id);
      g.addEventListener('click', activate);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }

    this.badgeLayer = el('g', {}, svg);
    this.vehicleLayer = el('g', {}, svg);
    this.container.append(svg);

    if (this.options.legend !== false) this.drawLegend();
    const note = document.createElement('div');
    note.className = 'map-note';
    note.textContent = 'Schematic · demo coordinates · grid 100 m';
    this.container.append(note);

    this.applyRouteFilter();
    this.applySelection();
    this.renderWaiting();
    for (const vehicle of this.vehicles.values()) this.drawVehicle(vehicle);
  }

  drawLegend() {
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    for (const route of this.network.routes.filter((r) => r.active || this.options.showInactive)) {
      const row = document.createElement('div');
      row.className = 'row';
      const dot = document.createElement('span');
      dot.className = 'route-dot';
      dot.style.background = route.color;
      row.append(dot, document.createTextNode(route.name + (route.active ? '' : ' (inactive)')));
      legend.append(row);
    }
    for (const text of ['Dashed ring: location delayed', 'Grey: GPS lost']) {
      const line = document.createElement('div');
      line.className = 'muted';
      line.textContent = text;
      legend.append(line);
    }
    this.container.append(legend);
  }

  setRouteFilter(routeIds) {
    this.routeFilter = routeIds && routeIds.length ? new Set(routeIds) : null;
    this.applyRouteFilter();
    for (const vehicle of this.vehicles.values()) this.drawVehicle(vehicle);
  }

  applyRouteFilter() {
    if (!this.routeLayer) return;
    for (const line of this.routeLayer.querySelectorAll('.map-route')) {
      line.classList.toggle('dim', Boolean(this.routeFilter && !this.routeFilter.has(line.dataset.route)));
    }
  }

  selectStop(stopId) {
    this.selectedStop = stopId;
    this.applySelection();
  }

  selectTrip(tripId) {
    this.selectedTrip = tripId;
    for (const vehicle of this.vehicles.values()) this.drawVehicle(vehicle);
  }

  applySelection() {
    if (!this.stopLayer) return;
    for (const g of this.stopLayer.querySelectorAll('.map-stop')) g.classList.toggle('selected', g.dataset.stop === this.selectedStop);
  }

  setWaiting(counts) {
    this.waiting = { ...counts };
    this.renderWaiting();
  }

  renderWaiting() {
    if (!this.badgeLayer) return;
    this.badgeLayer.innerHTML = '';
    for (const stop of this.network.stops) {
      const count = this.waiting[stop.id] || 0;
      if (!count) continue;
      const p = this.project(stop);
      const label = String(count);
      const w = 26 + label.length * 14;
      const g = el('g', { class: 'map-badge' }, this.badgeLayer);
      el('title', {}, g).textContent = `${count} waiting at ${stop.name}`;
      el('rect', { x: p.x - w / 2, y: p.y - 58, width: w, height: 34, rx: 17 }, g);
      el('text', { x: p.x, y: p.y - 33, 'text-anchor': 'middle' }, g).textContent = label;
    }
  }

  setVehicles(vehicles) {
    this.vehicles = new Map(vehicles.map((v) => [v.tripId, v]));
    if (this.vehicleLayer) this.vehicleLayer.innerHTML = '';
    for (const vehicle of this.vehicles.values()) this.drawVehicle(vehicle);
  }

  upsertVehicle(vehicle) {
    this.vehicles.set(vehicle.tripId, vehicle);
    this.drawVehicle(vehicle);
  }

  removeVehicle(tripId) {
    this.vehicles.delete(tripId);
    const node = this.vehicleLayer && this.vehicleLayer.querySelector(`[data-trip="${CSS.escape(tripId)}"]`);
    if (node) node.remove();
  }

  drawVehicle(vehicle) {
    if (!this.vehicleLayer) return;
    let g = this.vehicleLayer.querySelector(`[data-trip="${CSS.escape(vehicle.tripId)}"]`);
    const hidden = !vehicle.position || (this.routeFilter && !this.routeFilter.has(vehicle.routeId));
    if (hidden) {
      if (g) g.remove();
      return;
    }
    const p = this.project(vehicle.position);
    if (!g) {
      g = el('g', { 'data-trip': vehicle.tripId });
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el('title', {}, g);
      el('circle', { class: 'halo', r: 35 }, g);
      el('circle', { class: 'body', r: 26 }, g);
      el('text', { 'text-anchor': 'middle', dy: 8 }, g);
      g.addEventListener('click', () => this.options.onVehicleClick && this.options.onVehicleClick(vehicle.tripId));
      this.vehicleLayer.append(g);
    }
    g.setAttribute('class', `map-vehicle signal-${vehicle.signal.status.toLowerCase()}${this.selectedTrip === vehicle.tripId ? ' selected' : ''}`);
    g.querySelector('circle.body').setAttribute('fill', vehicle.routeColor);
    g.querySelector('text').textContent = shortLabel(vehicle.shuttleLabel);
    g.querySelector('title').textContent = `${vehicle.shuttleLabel} · ${vehicle.routeName} · ${vehicle.signal.message}`;
    g.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }

  /** Office trip inspection: the recorded GPS trace. */
  setTrack(points) {
    if (!this.trackLayer) return;
    this.trackLayer.innerHTML = '';
    if (!points || points.length === 0) return;
    const pts = points.map((p) => this.project(p));
    el('polyline', { class: 'map-track', points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }, this.trackLayer);
    for (const p of [pts[0], pts[pts.length - 1]]) el('circle', { class: 'map-track-point', cx: p.x, cy: p.y, r: 8 }, this.trackLayer);
  }
}
