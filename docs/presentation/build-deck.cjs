// Builds docs/presentation/campus-shuttle-presentation.pptx (editable PowerPoint).
//   node docs/presentation/build-deck.cjs
// The deck uses a theme, named layouts and placeholders, so it can be restyled in
// PowerPoint (Design → Variants) or here. Edit the text in PowerPoint freely; rebuilding
// overwrites the file.
const path = require('node:path');
const fs = require('node:fs');
const PptxGenJS = require('pptxgenjs');
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }));

const OUT = path.join(__dirname, 'campus-shuttle-presentation.pptx');
const SHOT = (name) => path.join(__dirname, 'screenshots', name);

const THEME = {
  name: 'Campus Shuttle',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '0F172A', lt1: 'FFFFFF', dk2: '0B4F4A', lt2: 'EEF4F3',
    accent1: '0F766E', accent2: 'D97706', accent3: '2563EB', accent4: 'DC2626', accent5: '16A34A', accent6: '64748B',
    hlink: '0F766E', folHlink: '0B4F4A',
  },
};

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.title = 'Campus Shuttle Tracking & Demand Prediction';
pres.subject = 'BCS 305 Software Architecture course project';
pres.author = 'BCS 305 Campus Shuttle team (AI-assisted draft)';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;
const M = 0.6; // side margin

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: 'Title dark',
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 1.7, w: 7.2, h: 2.2, fontSize: 40, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 4.1, w: 7.2, h: 2.4, fontSize: 18, color: C.background2, valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'Content',
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.35, w: W - 2 * M, h: 0.85, fontSize: 28, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'BCS 305 Software Architecture · Campus Shuttle Tracking & Demand Prediction', options: { x: M, y: 7.02, w: 9, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
});
pres.defineSlideMaster({
  title: 'Closing dark',
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.45, w: W - 2 * M, h: 0.9, fontSize: 28, bold: true, color: C.background1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
  ],
});

// ---------- Helpers ----------
const tb = (slide, text, opts) => slide.addText(text, { isTextBox: true, margin: 0, fontSize: 14, color: C.text1, valign: 'top', ...opts });

function card(slide, { x, y, w, h, badge, title, body, foot, fill = C.background2, objectName }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.12, objectName });
  let top = y + 0.25;
  if (badge) {
    slide.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: top, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    tb(slide, badge, { x: x + 0.25, y: top, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tb(slide, title, { x: x + 0.9, y: top, w: w - 1.15, h: 0.5, fontSize: 18, bold: true, valign: 'middle' });
    top += 0.65;
  } else {
    tb(slide, title, { x: x + 0.25, y: top, w: w - 0.5, h: 0.45, fontSize: 18, bold: true });
    top += 0.5;
  }
  tb(slide, body, { x: x + 0.25, y: top, w: w - 0.5, h: y + h - top - (foot ? 0.55 : 0.2), fontSize: 14, color: C.text1 });
  if (foot) tb(slide, foot, { x: x + 0.25, y: y + h - 0.5, w: w - 0.5, h: 0.35, fontSize: 11, color: C.accent6, valign: 'bottom' });
}

function stat(slide, { x, y, w, value, label, color = C.accent1 }) {
  tb(slide, value, { x, y, w, h: 0.95, fontSize: 44, bold: true, color, fontFace: THEME.headFontFace, valign: 'bottom' });
  tb(slide, label, { x, y: y + 1.0, w, h: 0.7, fontSize: 14, color: C.text1 });
}

function box(slide, { x, y, w, h, text, fill = C.accent1, color = C.background1, fontSize = 14, bold = true }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.1 });
  tb(slide, text, { x: x + 0.08, y, w: w - 0.16, h, fontSize, bold, color, align: 'center', valign: 'middle' });
}

function arrow(slide, x1, y1, x2, y2, color = C.accent6) {
  slide.addShape(pres.ShapeType.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: 2, endArrowType: 'triangle' } });
}

function picture(slide, file, { x, y, w, h }) {
  slide.addShape(pres.ShapeType.rect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: C.background2 }, line: { color: C.background2 } });
  slide.addImage({ path: file, x, y, w, h, altText: path.basename(file, '.jpg') });
}

function bullets(slide, items, opts) {
  slide.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 } })), { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, valign: 'top', ...opts });
}

const content = (section) => pres.addSlide({ masterName: 'Content', sectionTitle: section });

// ---------- Slides ----------
pres.addSection({ title: 'Problem' });
{
  const s = pres.addSlide({ masterName: 'Title dark', sectionTitle: 'Problem' });
  s.addText('Campus Shuttle Tracking & Demand Prediction', { placeholder: 'title' });
  s.addText([
    { text: 'Timely, honest shuttle information — and the demand data to plan with', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 10 } },
    { text: 'Abdullah · Zuhair Halawa', options: { bold: true, breakLine: true } },
    { text: 'BCS 305 Software Architecture · Dr. Khaled Ammar · Fall 2026', options: { fontSize: 14 } },
  ], { placeholder: 'body' });
  s.addImage({ path: SHOT('student.jpg'), x: 8.3, y: 1.9, w: 4.45, h: 2.81, altText: 'Student view of the prototype' });
  s.addNotes('Introduce the team and the one-sentence problem. The screenshot is the real student view of our prototype, running on a laptop.');
}
{
  const s = content('Problem');
  s.addText('Students wait blind; the office plans without data', { placeholder: 'title' });
  const cards = [
    ['1', 'Students', 'Cannot see where the shuttle is, so they wait outdoors — often in the heat — or miss it.', 'We give: live map, arrival times with a confidence level, "I\'m waiting here".'],
    ['2', 'Drivers', 'Interrupted by calls asking where they are; blamed when GPS or mobile data fails.', 'We give: one-tap trips, offline-tolerant location sharing, a GPS simulator.'],
    ['3', 'Transport office', 'Sees neither the fleet nor where and when students actually wait.', 'We give: live operations, routes, trip tracks, demand trends and explainable forecasts.'],
  ];
  cards.forEach(([badge, title, body, give], i) => {
    const x = M + i * 4.12;
    card(s, { x, y: 1.45, w: 3.85, h: 3.45, badge, title, body: [{ text: body, options: { breakLine: true } }, { text: ' ', options: { breakLine: true } }, { text: give, options: { color: C.accent1, bold: true } }], objectName: `stakeholder-${title}` });
  });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.2, w: W - 2 * M, h: 1.2, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, rectRadius: 0.12 });
  tb(s, [{ text: 'Also affected  ', options: { bold: true, color: C.text2 } }, { text: 'University IT, who must run it securely and cheaply · the data-protection officer, because driver locations and student identities are personal data · university management, who fund the fleet.' }], { x: M + 0.3, y: 5.2, w: W - 2 * M - 0.6, h: 1.2, fontSize: 15, valign: 'middle' });
  s.addNotes('Three distinct user groups (the brief requires at least three). Also affected: university IT and the data-protection officer — location and identity data. All data in the prototype is demonstration data, not a real university.');
}
{
  const s = content('Problem');
  s.addText('The hard quality: information that is timely and honest', { placeholder: 'title' });
  tb(s, [
    { text: 'When GPS and mobile data are good, every viewer must see a new position within about a second.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: 'When they fail, the system must say so — "location delayed", "GPS lost" — instead of showing a confident but wrong arrival time, and recover — delivering positions buffered during a network outage, within stated limits.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: 'Second hard concern: privacy of location and identity data.', options: { color: C.accent6 } },
  ], { x: M, y: 1.55, w: 5.6, h: 4.6, fontSize: 18 });
  stat(s, { x: 6.9, y: 1.4, w: 2.8, value: '35 ms', label: 'p95 to 1,000 simulated viewers (local benchmark, one PC)' });
  stat(s, { x: 10.0, y: 1.4, w: 2.8, value: '20 / 60 s', label: 'no position → "delayed" → "GPS lost", no ETA', color: C.accent2 });
  stat(s, { x: 6.9, y: 4.0, w: 2.8, value: '10 min', label: 'network outage with no validated position lost (page open; tested)' });
  stat(s, { x: 10.0, y: 4.0, w: 2.8, value: '9', label: 'measurable quality-attribute scenarios (report §2.3)', color: C.text2 });
  s.addNotes('This is the quality attribute named in our proposal. Every number here comes from a test or a local benchmark, not an estimate. The 35 ms is a local benchmark: simulated viewers in the same process over loopback, no browsers, not a field measurement. The network-outage guarantee is bounded: newest 500 positions kept, at most 10 minutes old on arrival, lost if the driver closes the page. The thresholds are configurable and must be validated with real phones.');
}

pres.addSection({ title: 'Architecture' });
{
  const s = content('Architecture');
  s.addText('Four architectures compared — the modular monolith wins', { placeholder: 'title' });
  s.addChart(pres.ChartType.bar, [{ name: 'Weighted score (max 70)', labels: ['A  Modular monolith + SSE', 'D  Serverless backend-as-a-service', 'C  Monolith + client polling', 'B  Microservices + broker'], values: [61, 51, 46, 44] }], {
    x: M, y: 1.45, w: 6.6, h: 4.9, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [THEME.colors.accent1],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 16, dataLabelColor: THEME.colors.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelFontSize: 14, catAxisLabelColor: THEME.colors.dk1, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valAxisMaxVal: 70,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, showTitle: false, barGapWidthPct: 60,
  });
  bullets(s, [
    'Weighted against freshness, robustness, security & privacy, modifiability, team-of-two simplicity, growth',
    'A: best measured freshness, one trust boundary, one command to run',
    'B: independent scaling one campus does not need; ≥ 5 deployables',
    'C: data 2.5 s old on average; 200 req/s for 1,000 idle viewers',
    'D: location data held by a third party; paid tiers; hard offline demo',
  ], { x: 7.6, y: 1.55, w: 5.1, h: 4.8, fontSize: 15 });
  s.addNotes('Scores are our judgement, justified in report section 6.3, but the freshness column is backed by the load test. Say what would change our mind: several campuses or more than one server instance — then put a broker behind the existing EventPublisher interface.');
}
{
  const s = content('Architecture');
  s.addText('One process, eight components, enforced boundaries', { placeholder: 'title' });
  const clients = ['Student UI', 'Driver UI + GPS simulator', 'Office UI'];
  clients.forEach((t, i) => box(s, { x: 0.9 + i * 3.95, y: 1.4, w: 3.6, h: 0.6, text: t, fill: C.accent3 }));
  tb(s, 'REST (JSON) + Server-Sent Events over HTTP', { x: 0.9, y: 2.08, w: 11.5, h: 0.3, fontSize: 12, color: C.accent6, align: 'center' });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 2.45, w: W - 2 * M, h: 4.3, fill: { color: C.background2 }, line: { color: C.background2 }, rectRadius: 0.12 });
  tb(s, 'Campus Shuttle server — one Node.js process (src/)', { x: 0.85, y: 2.55, w: 8, h: 0.35, fontSize: 13, bold: true, color: C.text2 });
  box(s, { x: 0.9, y: 3.0, w: 5.6, h: 0.65, text: 'Web API — auth, role checks, CSRF, CSP (web/)' });
  box(s, { x: 6.85, y: 3.0, w: 5.6, h: 0.65, text: 'Real-time Gateway — SSE, coalescing (realtime/)' });
  ['Identity & Access\n(identity/)', 'Network & routes\n(network/)', 'Tracking, ETA, GPS states\n(tracking/)', 'Demand & forecasting\n(demand/)'].forEach((t, i) =>
    box(s, { x: 0.9 + i * 2.92, y: 3.9, w: 2.7, h: 0.95, text: t, fill: C.background1, color: C.text1 }));
  box(s, { x: 0.9, y: 5.1, w: 5.6, h: 0.6, text: 'Event Bus — domain events, Observer (shared/)', fill: C.accent2 });
  box(s, { x: 6.85, y: 5.1, w: 5.6, h: 0.6, text: 'Persistence — SQLite repositories (persistence/)', fill: C.text2 });
  tb(s, 'test/architecture.test.ts fails if an import breaks these rules: tracking and demand never import each other · business code sees routes only through interfaces · only the composition root knows SQLite. (It checks imports, not every UML detail.)', { x: 0.9, y: 5.9, w: 11.5, h: 0.7, fontSize: 13, color: C.text1 });
  s.addNotes('Each box is a folder you can open. Components talk through port interfaces and domain events. Point at the component diagram in the UML appendix for the UML notation (lollipops, required interfaces).');
}
{
  const s = content('Architecture');
  s.addText('One GPS upload reaches every viewer in milliseconds', { placeholder: 'title' });
  const steps = ['Driver app\nqueue + batch\n(sentAt)', 'Web API\nsession, role,\ntrip owner', 'TrackingService\nvalidate · snap\nto route · ETA', 'SQLite\nstore first,\nthen memory', 'Event Bus\ntrip.location', 'SSE Hub\none message per\ntrip, serialised once'];
  steps.forEach((t, i) => {
    const x = M + i * 2.07;
    box(s, { x, y: 1.55, w: 1.8, h: 1.45, text: t, fill: i === 0 ? C.accent3 : C.accent1, fontSize: 13 });
    if (i < steps.length - 1) arrow(s, x + 1.82, 2.27, x + 2.05, 2.27);
  });
  s.addTable([
    [{ text: 'Local benchmark (1 PC, Node 24)', options: { bold: true } }, { text: 'p50', options: { bold: true } }, { text: 'p95', options: { bold: true } }, { text: 'max', options: { bold: true } }, { text: 'skipped', options: { bold: true } }],
    ['1,000 viewers × 60 updates', '23–25 ms', '35–37 ms', '55–56 ms', '0'],
    ['3,000 viewers × 30 updates', '70–72 ms', '90–98 ms', '108–113 ms', '0'],
  ], { x: M, y: 3.45, w: 7.4, colW: [2.7, 1.15, 1.15, 1.4, 1.0], fontSize: 13, color: THEME.colors.dk1, border: { type: 'solid', pt: 0.75, color: 'CBD5E1' }, fill: { color: 'FFFFFF' }, rowH: 0.45 });
  tb(s, 'npm run load-test · viewers share the server process over loopback, one session, no browsers: a fan-out benchmark with simulated viewers, not a field test (31 Oct and 1 Nov runs)', { x: M, y: 5.1, w: 7.4, h: 0.6, fontSize: 12, color: C.accent6 });
  bullets(s, [
    'Server-Sent Events: browsers reconnect by themselves and get a full snapshot',
    'A slow phone skips updates and is resynchronised — it cannot grow server memory',
    'Positions are stored before memory changes: a restart loses nothing',
  ], { x: 8.4, y: 3.45, w: 4.35, h: 3.2, fontSize: 15 });
  s.addNotes('Walk through the design sequence diagram (UML appendix A.5). The load test is npm run load-test. Be precise about what it shows: the fan-out of the server with simulated viewers in the same process over loopback, sharing one session, with no browser rendering and no real network. It does not prove that 3,000 real students on campus Wi-Fi get the same latency; a deployment test from separate machines is still needed.');
}
{
  const s = content('Architecture');
  s.addText('When GPS fails, the system says so instead of guessing', { placeholder: 'title' });
  const states = [
    ['Awaiting fix', 'trip started, no position yet', C.accent6, '"waiting for first GPS position"'],
    ['Live', 'newest position ≤ 20 s old', C.accent5, 'ETA: "4 min · at 08:14"'],
    ['Delayed', '20–60 s without a position', C.accent2, 'ETA marked "~4 min", then "Due"'],
    ['GPS lost', 'more than 60 s', C.accent4, 'no ETA — "last seen 2 min ago"'],
  ];
  states.forEach(([name, rule, color, sees], i) => {
    const x = M + i * 3.1;
    box(s, { x, y: 1.55, w: 2.75, h: 0.85, text: name, fill: color, fontSize: 18 });
    tb(s, rule, { x, y: 2.5, w: 2.75, h: 0.45, fontSize: 13, color: C.accent6, align: 'center' });
    tb(s, [{ text: 'Students see', options: { bold: true, breakLine: true } }, { text: sees }], { x, y: 3.0, w: 2.75, h: 0.9, fontSize: 14, align: 'center' });
    if (i < states.length - 1) arrow(s, x + 2.77, 1.97, x + 3.08, 1.97);
  });
  tb(s, 'Any accepted position → Live again · no position for 30 min → trip closed automatically', { x: M, y: 4.0, w: 12.1, h: 0.4, fontSize: 14, bold: true, color: C.text2, align: 'center' });
  card(s, { x: M, y: 4.6, w: 12.1, h: 1.75, title: 'Network loss on the driver\'s phone', body: 'Positions are queued in the open driver page (newest 500 kept) and retried with backoff (1 → 15 s). On reconnection the server corrects the phone\'s clock using sentAt, sorts them, rejects duplicates, positions over 10 min old and impossible jumps, and the shuttle jumps to its true position. Closing the page loses the queue.' });
  s.addNotes('This is the State pattern: four classes, one per state, each deciding how to react and how much ETA information it is honest to show. The UML state machine (appendix A.6) maps one-to-one onto those classes.');
}
{
  const s = content('Architecture');
  s.addText('Five design patterns, each solving a concrete problem', { placeholder: 'title' });
  const patterns = [
    ['Strategy', 'ETA and forecasting algorithms change without touching the services; models compared side by side.', 'EtaStrategy · DemandPredictor'],
    ['Observer', 'One update reaches hundreds of browsers and the waiting module; tracking knows none of them.', 'EventBus · callback subscribers'],
    ['State', 'What passengers may be told depends on GPS freshness; no status switch statements.', 'SignalState: Live / Stale / Lost'],
    ['Repository', 'Business rules independent of SQL; unit tests run without a database.', 'TripRepository → SQLite / in-memory'],
    ['Adapter', 'Demo without vehicles, but through exactly the same upload path as a real phone.', 'DeviceGps · SimulatedGps (duck-typed)'],
    ['Composition root', 'One place knows concrete classes; tests swap the clock, database and strategies.', 'src/container.ts'],
  ];
  patterns.forEach(([title, body, foot], i) => {
    const x = M + (i % 3) * 4.12;
    const y = 1.45 + Math.floor(i / 3) * 2.7;
    card(s, { x, y, w: 3.85, h: 2.45, badge: String(i + 1), title, body, foot, fill: i === 5 ? 'F8FAFC' : C.background2 });
  });
  s.addNotes('The brief asks for at least three patterns with class diagrams; we have five (appendix A.13–A.17), plus the composition root. For each, say the problem first, then where it is in the code.');
}

pres.addSection({ title: 'Prototype' });
{
  const s = content('Prototype');
  s.addText('Three roles, one live system', { placeholder: 'title' });
  const shots = [
    ['student.jpg', 'Student', 'Live map, arrivals with confidence, "I\'m waiting here"'],
    ['driver.jpg', 'Driver', 'Trip status, what passengers see, GPS simulator'],
    ['office-live.jpg', 'Transport office', 'Fleet, waiting demand, trips, routes, forecasts'],
  ];
  shots.forEach(([file, title, caption], i) => {
    const x = M + i * 4.1;
    picture(s, SHOT(file), { x, y: 1.5, w: 3.85, h: 2.44 });
    tb(s, title, { x, y: 4.15, w: 3.85, h: 0.4, fontSize: 18, bold: true });
    tb(s, caption, { x, y: 4.6, w: 3.85, h: 0.7, fontSize: 14, color: C.accent6 });
  });
  tb(s, 'Two primary use cases run end to end: run a trip → track it live, and waiting request → office demand view → forecast.', { x: M, y: 5.6, w: 12.1, h: 0.7, fontSize: 16, bold: true, color: C.text2 });
  s.addNotes('These are real screenshots of the running prototype. Everything on them works: no mock screens. Next we demonstrate it live.');
}
{
  const s = content('Prototype');
  s.addText('Demand forecasts the office can explain', { placeholder: 'title' });
  picture(s, SHOT('office-explanation.jpg'), { x: M, y: 1.5, w: 6.4, h: 4.0 });
  tb(s, 'Each forecast shows the exact past values, weights and range it came from — and "no forecast" instead of a guessed zero.', { x: M, y: 5.7, w: 6.4, h: 0.8, fontSize: 14, color: C.accent6 });
  const lifecycle = [
    ['Discovery', 'Question: requests per stop and hour'],
    ['Feasibility', 'No real data → no trained model yet'],
    ['Design', 'Explanations and ranges for staff'],
    ['Development', 'Naive → seasonal → weighted → median'],
    ['Production', 'Live requests become history automatically'],
    ['Maintenance', 'Backtest = monitoring; retrain only if it wins'],
  ];
  tb(s, 'ML lifecycle (RBC Borealis field guide)', { x: 7.4, y: 1.45, w: 5.3, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
  lifecycle.forEach(([stage, what], i) => {
    const y = 1.95 + i * 0.75;
    s.addShape(pres.ShapeType.ellipse, { x: 7.4, y, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    tb(s, String(i + 1), { x: 7.4, y, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tb(s, [{ text: `${stage}  `, options: { bold: true } }, { text: what }], { x: 8.05, y, w: 4.7, h: 0.6, fontSize: 14, valign: 'middle' });
  });
  s.addNotes('Feasibility is the key stage: without real data a trained model would only learn our own assumptions. We built the pipeline, the explanations and the evaluation so a model can be added later as one more strategy.');
}
{
  const s = content('Prototype');
  s.addText('Synthetic backtest: the method works, accuracy unproven', { placeholder: 'title' });
  s.addChart(pres.ChartType.bar, [{ name: 'MAE (requests per stop-hour)', labels: ['Same-weekday median (6 weeks)', 'Weighted seasonal (6 weeks)', 'Seasonal average (4 weeks)', 'Hour-of-day mean (naive)'], values: [1.42, 1.44, 1.45, 1.98] }], {
    x: M, y: 1.45, w: 6.8, h: 4.6, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [THEME.colors.accent1],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.00', dataLabelFontSize: 16, dataLabelColor: THEME.colors.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelFontSize: 14, catAxisLabelColor: THEME.colors.dk1, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 2.5,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false,
    showTitle: true, title: 'Mean absolute error, last 14 days (lower is better)', titleFontSize: 14, titleColor: THEME.colors.dk1, titleFontFace: '+mn-lt',
  });
  tb(s, 'SYNTHETIC DATA', { x: 7.8, y: 1.55, w: 4.9, h: 0.5, fontSize: 20, bold: true, color: C.accent2 });
  bullets(s, [
    'History generated from our own written assumptions (weekday peaks, quiet weekends) — not from any university',
    'Weekday-aware models beat the naive one because the data was built that way: this checks the pipeline, nothing more',
    'With one semester of real requests, the same backtest decides whether a trained model is worth adding',
  ], { x: 7.8, y: 2.15, w: 4.9, h: 4.2, fontSize: 15 });
  s.addNotes('Be explicit: we do not report this as accuracy. 1,890 stop-hours, rolling origin, no look-ahead (tested). Reproduce with npm run evaluate.');
}
{
  const s = content('Prototype');
  s.addText('Live demonstration', { placeholder: 'title' });
  card(s, { x: M, y: 1.45, w: 5.9, h: 3.45, badge: '1', title: 'Run a trip and track it', body: [
    { text: 'Driver starts a trip with simulated GPS', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Student sees the shuttle move and the ETA update', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Network loss → trip cannot end offline → queue delivered', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Injected GPS glitch is rejected', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'GPS outage button → "delayed" (~20 s) → "GPS lost" (~60 s) → Live', options: { bullet: true, paraSpaceAfter: 8 } },
  ] });
  card(s, { x: 6.8, y: 1.45, w: 5.9, h: 3.45, badge: '2', title: 'Waiting request → demand → forecast', body: [
    { text: 'Student taps "I\'m waiting here"', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Office map badge and KPI update live', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Shuttle reaches the stop → request closed', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Forecast cell → explanation of its basis', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Office ends a trip with a reason → audit log', options: { bullet: true, paraSpaceAfter: 8 } },
  ] });
  card(s, { x: M, y: 5.15, w: 12.1, h: 1.25, title: 'Set-up before the session', body: 'npm start  ·  npm run simulate -- --outage --outage-at 30  ·  three private browser windows: student1, driver1, office1', fill: 'F8FAFC' });
  tb(s, 'Backup if anything fails live: docs/evidence/ (test run, load tests, evaluation)', { x: M, y: 6.55, w: 12.1, h: 0.3, fontSize: 12, color: C.accent6 });
  s.addNotes('Follow docs/demo-script.md. Start npm start and npm run simulate -- --outage --outage-at 30 before the session; use separate private windows for student, driver and office. The GPS-loss step is triggered with the Simulate GPS outage button in the driver window, so its timing is under your control.');
}

pres.addSection({ title: 'Evidence' });
{
  const s = content('Evidence');
  s.addText('Tested, measured — and honest about the gaps', { placeholder: 'title' });
  stat(s, { x: M, y: 1.35, w: 2.8, value: '141', label: '119 Node + 22 Chromium tests, all passing' });
  stat(s, { x: 3.7, y: 1.35, w: 2.8, value: '26 × 4', label: 'endpoints × caller types checked for role access' });
  stat(s, { x: 6.8, y: 1.35, w: 2.8, value: '113 ms', label: 'worst of 3,000 simulated viewers (local benchmark)' });
  stat(s, { x: 9.9, y: 1.35, w: 2.8, value: '16', label: 'defects and corrections in the test plan, all resolved', color: C.accent2 });
  card(s, { x: M, y: 3.6, w: 5.9, h: 2.6, title: 'Found by tests and independent review', body: [
    { text: 'Shuttle snapped behind at route corners (load test); hub worked after shutdown (integration test)', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Driver app gave up a trip the server had not ended; live streams outlived their session (review)', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Stale waiting state, lost keyboard focus (browser tests); reloaded GPS trip switched to the simulator (PR review)', options: { bullet: true, paraSpaceAfter: 8 } },
  ] });
  card(s, { x: 6.8, y: 3.6, w: 5.9, h: 2.6, title: 'Not done yet', body: [
    { text: 'Field test with a real phone on a real shuttle', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'HTTPS, single sign-on, Arabic, screen-reader audit', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Real demand data — forecasts shown on synthetic data only', options: { bullet: true, breakLine: true, paraSpaceAfter: 8 } },
    { text: 'Team inspection of the rendered UML; deployment load test', options: { bullet: true, paraSpaceAfter: 8 } },
  ] });
  s.addNotes('Numbers from docs/evidence and docs/test-plan.md section 4. The 21 Chromium tests drive the real pages against a fresh server; the same checks run in GitHub Actions on every pull request. Mention the V-model pairing: unit ↔ module design, architecture test ↔ architectural design, integration ↔ system design, demo ↔ requirements.');
}
{
  const s = pres.addSlide({ masterName: 'Closing dark', sectionTitle: 'Evidence' });
  s.addText('What we would do next', { placeholder: 'title' });
  const next = [
    ['Field test', 'Real phones on a real route; tune the 20 s / 60 s thresholds and the speed blend'],
    ['Production basics', 'HTTPS behind a reverse proxy, university sign-on, backups'],
    ['Real data, then ML', 'One semester of requests → rerun the backtest → add a model only if it wins'],
  ];
  next.forEach(([title, body], i) => {
    const x = M + i * 4.12;
    s.addShape(pres.ShapeType.roundRect, { x, y: 1.6, w: 3.85, h: 2.1, fill: { color: C.accent1 }, line: { color: C.accent1 }, rectRadius: 0.12 });
    tb(s, title, { x: x + 0.3, y: 1.85, w: 3.25, h: 0.5, fontSize: 20, bold: true, color: C.background1 });
    tb(s, body, { x: x + 0.3, y: 2.45, w: 3.25, h: 1.6, fontSize: 15, color: C.background1 });
  });
  tb(s, 'Questions?', { x: M, y: 4.3, w: 12.1, h: 1.0, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tb(s, 'The prototype was built with AI assistance (Claude Code; ChatGPT for Zuhair’s pull requests); what we reviewed, changed and added is stated in our AI-use statement.', { x: M, y: 5.6, w: 12.1, h: 0.6, fontSize: 14, color: C.background2 });
  s.addNotes('Keep this slide up during questions. The AI-use line must match the final AI-use statement in the report.');
}

// ---------- Write, then apply theme colours ----------
async function applyTheme(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const part = 'ppt/theme/theme1.xml';
  let xml = await zip.file(part).async('string');
  const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
  const scheme = `<a:clrScheme name="${theme.name}">${slots.map((k) => `<a:${k}><a:srgbClr val="${theme.colors[k]}"/></a:${k}>`).join('')}</a:clrScheme>`;
  xml = xml.replace(/<a:clrScheme name="[^"]*">[\s\S]*?<\/a:clrScheme>/, scheme);
  xml = xml.replace(/(<a:theme\b[^>]*\bname=")[^"]*(")/, `$1${theme.name}$2`);
  zip.file(part, xml);
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log(`Wrote ${OUT}`);
})();
