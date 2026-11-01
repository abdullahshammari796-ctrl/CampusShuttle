// Client side of the real-time channel (Server-Sent Events).
// EventSource reconnects automatically; on every (re)connect the server sends
// a full snapshot, so a client can never be left with a partial picture.
// When the session expires the server sends `session-expired` and closes the
// stream; the feed then stops for good (state 'expired') until the user signs in again.

const EVENTS = ['snapshot', 'vehicle', 'vehicle-removed', 'waiting', 'arrival', 'network', 'heartbeat'];
const SILENCE_LIMIT_MS = 40_000; // heartbeat is every 15 s

export class LiveFeed {
  constructor(url = '/api/stream') {
    this.url = url;
    this.handlers = new Map();
    this.stateHandlers = new Set();
    this.offsetMs = 0;
    this.state = 'connecting';
    this.lastMessageAt = Date.now();
    this.source = null;
    this.watchdog = null;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(handler);
    return this;
  }

  onState(handler) {
    this.stateHandlers.add(handler);
    handler(this.state);
    return this;
  }

  /** Server time estimate: the server stamps every message, so device clock errors do not distort ETAs. */
  now() {
    return Date.now() + this.offsetMs;
  }

  connect() {
    this.open();
    this.watchdog = setInterval(() => {
      if (this.state === 'expired' || this.state === 'closed') return; // reconnecting cannot help without a new sign-in
      if (Date.now() - this.lastMessageAt > SILENCE_LIMIT_MS) {
        this.setState('reconnecting');
        this.open();
      }
    }, 5000);
    return this;
  }

  close() {
    clearInterval(this.watchdog);
    if (this.source) this.source.close();
  }

  open() {
    if (this.source) this.source.close();
    this.lastMessageAt = Date.now();
    const source = new EventSource(this.url);
    this.source = source;
    source.onopen = () => this.setState('live');
    source.onerror = () => {
      if (this.state === 'expired') return;
      // CLOSED means the server refused (e.g. session expired); CONNECTING means the browser is retrying.
      this.setState(source.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
    };
    source.addEventListener('session-expired', () => {
      source.close();
      this.setState('expired');
    });
    for (const event of EVENTS) {
      source.addEventListener(event, (message) => {
        this.lastMessageAt = Date.now();
        let data;
        try {
          data = JSON.parse(message.data);
        } catch {
          return;
        }
        if (typeof data.serverTime === 'number') this.offsetMs = data.serverTime - Date.now();
        if (this.state !== 'live') this.setState('live');
        const handlers = this.handlers.get(event);
        if (handlers) for (const handler of handlers) handler(data);
      });
    }
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
}
