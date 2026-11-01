// Small UI toolkit: safe HTML templating, formatting, icons, toasts.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

class Raw {
  constructor(value) {
    this.value = value;
  }
}
/** Marks trusted markup (built by our own code) so html`` does not escape it. */
export const raw = (value) => new Raw(value);

/** Tagged template that HTML-escapes every interpolated value unless wrapped in raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    if (value instanceof Raw) out += value.value;
    else if (Array.isArray(value)) out += value.map((v) => (v instanceof Raw ? v.value : esc(v))).join('');
    else out += esc(value);
    out += strings[i + 1];
  });
  return raw(out);
}

export function render(element, markup) {
  element.innerHTML = markup instanceof Raw ? markup.value : esc(markup);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const ICONS = {
  bus: '<path d="M6 17h12M6 17a2 2 0 1 0 4 0m4 0a2 2 0 1 0 4 0M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 11h14"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  off: '<path d="m3 3 18 18M8.5 8.5A5 5 0 0 0 12 17a5 5 0 0 0 3.5-1.5M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-9h.01"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  play: '<path d="M7 5v14l11-7Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01M2 9a15 15 0 0 1 20 0"/>',
  dot: '<circle cx="12" cy="12" r="5"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
};

export function icon(name) {
  return raw(`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`);
}

export const SIGNAL = {
  LIVE: { label: 'Live', cls: 'good', icon: 'check' },
  STALE: { label: 'Location delayed', cls: 'warn', icon: 'clock' },
  LOST: { label: 'GPS lost', cls: 'critical', icon: 'off' },
  AWAITING_FIX: { label: 'Starting', cls: 'neutral', icon: 'dot' },
};

export function signalPill(status) {
  const s = SIGNAL[status] || SIGNAL.AWAITING_FIX;
  return html`<span class="pill pill-${s.cls}">${icon(s.icon)}${s.label}</span>`;
}

export const OCCUPANCY = {
  SEATS_AVAILABLE: { label: 'Seats available', cls: 'good', icon: 'users' },
  FILLING_UP: { label: 'Filling up', cls: 'warn', icon: 'users' },
  FULL: { label: 'Full', cls: 'critical', icon: 'users' },
};

export function occupancyPill(level) {
  const o = OCCUPANCY[level] || OCCUPANCY.SEATS_AVAILABLE;
  return html`<span class="pill pill-${o.cls}">${icon(o.icon)}${o.label}</span>`;
}

export function routeDot(color) {
  return raw(`<span class="route-dot" data-color="${esc(color)}"></span>`);
}

/** Applies data-color attributes as CSSOM styles (inline style attributes are blocked by CSP). */
export function paintColors(root = document) {
  for (const el of root.querySelectorAll('[data-color]')) el.style.background = el.dataset.color;
}

export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ms) {
  return new Date(ms).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** Remaining minutes as passengers expect to read them. */
export function etaText(secondsLeft) {
  if (secondsLeft <= 45) return 'Now';
  return `${Math.max(1, Math.round(secondsLeft / 60))} min`;
}

let toastRoot = null;
export function toast(message, kind = 'info', ms = 4200) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.append(toastRoot);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = message;
  toastRoot.append(el);
  setTimeout(() => el.remove(), ms);
}

export function setConnection(element, state) {
  const labels = { connecting: 'Connecting…', live: 'Live updates', reconnecting: 'Reconnecting…', closed: 'Disconnected', expired: 'Session expired' };
  element.dataset.state = state;
  element.innerHTML = `<span class="dot"></span>${labels[state] || state}`;
}

let tooltipEl = null;
export function showTooltip(text, x, y) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.append(tooltipEl);
  }
  tooltipEl.textContent = text;
  tooltipEl.classList.remove('hidden');
  const rect = tooltipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, x + 12);
  const top = y - rect.height - 12 < 0 ? y + 16 : y - rect.height - 12;
  tooltipEl.style.left = `${Math.max(8, left)}px`;
  tooltipEl.style.top = `${top}px`;
}
export function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.add('hidden');
}

/** Hover tooltips for any element with a data-tip attribute inside root. */
export function enableTooltips(root) {
  root.addEventListener('pointermove', (e) => {
    const target = e.target.closest('[data-tip]');
    if (target && root.contains(target)) showTooltip(target.dataset.tip, e.clientX, e.clientY);
    else hideTooltip();
  });
  root.addEventListener('pointerleave', hideTooltip);
}

export function bindAppBar(user, onLogout) {
  const name = document.getElementById('user-name');
  if (name) name.textContent = user.displayName;
  const button = document.getElementById('logout');
  if (button) button.addEventListener('click', onLogout);
}
