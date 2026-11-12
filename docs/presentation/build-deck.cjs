// Builds docs/presentation/campus-shuttle-presentation.pptx (editable PowerPoint): 9 main slides + 3 backup slides.
//   node docs/presentation/build-deck.cjs                                   repository version (video poster only)
//   node docs/presentation/build-deck.cjs --video <mp4> --out <pptx>        submission copy with the video embedded
// The demonstration video is large and is not kept in Git; the repository deck shows its poster frame and names the
// file. The deck uses a theme, named layouts and placeholders, so it can be restyled in PowerPoint (Design →
// Variants) or here. Rebuilding overwrites the output file.
const path = require('node:path');
const fs = require('node:fs');
const PptxGenJS = require('pptxgenjs');
const JSZip = require(require.resolve('jszip', { paths: [require.resolve('pptxgenjs')] }));

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const VIDEO = arg('--video');
const OUT = arg('--out') ?? path.join(__dirname, 'campus-shuttle-presentation.pptx');
const SHOT = (name) => path.join(__dirname, 'screenshots', name);
const UML = (name) => path.join(__dirname, '..', 'uml', 'out', name);
const VIDEO_LENGTH = '4:11';

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
pres.author = 'BCS 305 Campus Shuttle team';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;
const M = 0.6; // side margin

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: 'Title dark',
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 1.2, w: 7.3, h: 2.0, fontSize: 38, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.45, w: 7.3, h: 3.4, fontSize: 17, color: C.background2, valign: 'top', margin: 0 }, text: '' } },
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

function card(slide, { x, y, w, h, badge, title, body, foot, fill = C.background2, objectName, bodySize = 14 }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.12, objectName });
  let top = y + 0.22;
  if (badge) {
    slide.addShape(pres.ShapeType.ellipse, { x: x + 0.22, y: top, w: 0.48, h: 0.48, fill: { color: C.accent1 }, line: { color: C.accent1 } });
    tb(slide, badge, { x: x + 0.22, y: top, w: 0.48, h: 0.48, fontSize: 15, bold: true, color: C.background1, align: 'center', valign: 'middle' });
    tb(slide, title, { x: x + 0.82, y: top, w: w - 1.05, h: 0.48, fontSize: 17, bold: true, valign: 'middle' });
    top += 0.62;
  } else {
    tb(slide, title, { x: x + 0.25, y: top, w: w - 0.5, h: 0.42, fontSize: 17, bold: true });
    top += 0.48;
  }
  tb(slide, body, { x: x + 0.25, y: top, w: w - 0.5, h: y + h - top - (foot ? 0.5 : 0.18), fontSize: bodySize, color: C.text1 });
  if (foot) tb(slide, foot, { x: x + 0.25, y: y + h - 0.45, w: w - 0.5, h: 0.32, fontSize: 11, color: C.accent6, valign: 'bottom' });
}

function stat(slide, { x, y, w, value, label, color = C.accent1 }) {
  tb(slide, value, { x, y, w, h: 0.8, fontSize: 34, bold: true, color, fontFace: THEME.headFontFace, valign: 'bottom' });
  tb(slide, label, { x, y: y + 0.85, w, h: 0.62, fontSize: 13, color: C.text1 });
}

function box(slide, { x, y, w, h, text, fill = C.accent1, color = C.background1, fontSize = 14, bold = true }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.1 });
  tb(slide, text, { x: x + 0.08, y, w: w - 0.16, h, fontSize, bold, color, align: 'center', valign: 'middle' });
}

function arrow(slide, x1, y1, x2, y2, color = C.accent6) {
  slide.addShape(pres.ShapeType.line, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color, width: 2, endArrowType: 'triangle' } });
}

function picture(slide, file, { x, y, w, h }, altText) {
  slide.addShape(pres.ShapeType.rect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: C.background2 }, line: { color: C.background2 } });
  slide.addImage({ path: file, x, y, w, h, altText: altText ?? path.basename(file) });
}

const bulletRuns = (items, size) => items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6, ...(size ? { fontSize: size } : {}) } }));
function bullets(slide, items, opts) {
  slide.addText(bulletRuns(items), { isTextBox: true, margin: 0, fontSize: 15, color: C.text1, valign: 'top', ...opts });
}

const content = (section) => pres.addSlide({ masterName: 'Content', sectionTitle: section });

// ---------- 1 · Problem, purpose, team ----------
pres.addSection({ title: 'Problem and requirements' });
{
  const s = pres.addSlide({ masterName: 'Title dark', sectionTitle: 'Problem and requirements' });
  s.addText('Campus Shuttle Tracking & Demand Prediction', { placeholder: 'title' });
  s.addText([
    { text: 'Problem  ', options: { bold: true, color: 'FCD34D' } },
    { text: 'Students cannot see where the campus shuttle is, so they wait outdoors or miss it; the transport office plans the fleet without data.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 8 } },
    { text: 'Purpose  ', options: { bold: true, color: 'FCD34D' } },
    { text: 'Live positions and honest arrival estimates — honest above all when GPS or mobile data fails — and "I\'m waiting here" requests that become demand history and explainable forecasts.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 8 } },
    { text: 'Abdullah · Zuhair Halawa', options: { bold: true, breakLine: true } },
    { text: 'BCS 305 Software Architecture · Dr. Khaled Ammar · Fall 2026', options: { fontSize: 13 } },
  ], { placeholder: 'body' });
  s.addImage({ path: SHOT('student.jpg'), x: 8.3, y: 1.9, w: 4.45, h: 2.81, altText: 'Student view of the prototype' });
  tb(s, 'Student view of the running prototype (demonstration data)', { x: 8.3, y: 4.8, w: 4.45, h: 0.3, fontSize: 11, color: C.background2 });
  s.addNotes([
    'Speaker: Abdullah (0:40).',
    'Say: who we are, the problem in one sentence, and the purpose: timely and honest information, plus demand data for the office.',
    'Point at the screenshot: it is the real student page of the prototype, with demonstration data (no real university).',
  ].join('\n'));
}

// ---------- 2 · Stakeholders, use cases, quality requirements ----------
{
  const s = content('Problem and requirements');
  s.addText('Three user groups, five use cases, one hard quality', { placeholder: 'title' });
  card(s, { x: M, y: 1.4, w: 3.85, h: 4.3, title: 'Stakeholders', bodySize: 13, body: [
    { text: 'Students', options: { bold: true } }, { text: ' — where is the shuttle, when will it come?', options: { breakLine: true } },
    { text: 'Drivers', options: { bold: true } }, { text: ' — one-tap trips; not blamed for GPS faults', options: { breakLine: true } },
    { text: 'Transport office', options: { bold: true } }, { text: ' — live fleet, incidents, demand to plan with', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: 'Also affected: university IT (runs it), the data-protection officer (driver locations and student identities are personal data), management (funds the fleet).', options: { color: C.accent6 } },
  ] });
  card(s, { x: 4.72, y: 1.4, w: 3.85, h: 4.3, title: 'Primary use cases', bodySize: 13, body: [
    { text: 'UC1 Track shuttles and view arrival times', options: { bullet: true, breakLine: true } },
    { text: 'UC2 Run a trip (driver; GPS receiver)', options: { bullet: true, breakLine: true } },
    { text: 'UC3 Register a waiting request', options: { bullet: true, breakLine: true } },
    { text: 'UC4 Monitor fleet and waiting demand; end a trip remotely', options: { bullet: true, breakLine: true } },
    { text: 'UC5 View and explain a demand forecast', options: { bullet: true, breakLine: true } },
    { text: ' ', options: { breakLine: true } },
    { text: 'Demonstrated end to end: UC2 → UC1, and UC3 → UC4 → UC5', options: { bold: true, color: C.accent1 } },
  ] });
  card(s, { x: 8.84, y: 1.4, w: 3.89, h: 4.3, title: 'Quality scenarios (measured)', bodySize: 13, body: [
    { text: 'Freshness: new position to every viewer, p95 ≤ 1 s', options: { bullet: true, breakLine: true } },
    { text: 'GPS outage: "delayed" after 20 s, "lost" after 60 s, no estimate when lost', options: { bullet: true, breakLine: true } },
    { text: 'Network loss: positions queued and delivered in order (bounded: 10 min, newest 500)', options: { bullet: true, breakLine: true } },
    { text: 'Security: 26 endpoints × 4 caller types checked', options: { bullet: true, breakLine: true } },
    { text: 'Privacy: no student location collected', options: { bullet: true } },
  ] });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.95, w: W - 2 * M, h: 0.82, fill: { color: 'FFF7E6' }, line: { color: 'F59E0B' }, rectRadius: 0.1 });
  tb(s, [{ text: 'Hard quality attribute  ', options: { bold: true, color: C.text2 } }, { text: 'timely and honest shuttle information under unreliable GPS and mobile connectivity: fast when the data is good, and saying so — instead of guessing — when it is not.' }], { x: M + 0.3, y: 5.95, w: W - 2 * M - 0.6, h: 0.82, fontSize: 15, valign: 'middle' });
  s.addNotes([
    'Speaker: Zuhair (1:00).',
    'Stakeholders: the brief asks for at least three user groups; ours are students, drivers and the transport office. Name the other affected parties briefly.',
    'Use cases: five fully dressed descriptions are in Appendix A.2; the use case diagram is A.1. Two use cases run end to end in the demonstration.',
    'Quality scenarios: nine six-part scenarios in report §2.3. Every number is measured or tested; the 1-second target and the thresholds are reasoned, not elicited from stakeholders (§2.4, §9).',
  ].join('\n'));
}

// ---------- 3 · SDLC approach and timeline ----------
pres.addSection({ title: 'Process and architecture' });
{
  const s = content('Process and architecture');
  s.addText('Process: incremental, risk first, then reviewed iterations', { placeholder: 'title' });
  card(s, { x: M, y: 1.35, w: 5.1, h: 4.15, title: 'What we actually did (Module 02 terms)', bodySize: 13, body: [
    { text: 'Incremental', options: { bold: true, color: C.accent1 } }, { text: ' — new parts in each slice: skeleton → tracking → driver and student pages → demand → hardening (baseline); a 4th forecaster (#12); browser tests and CI (#13)', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 6 } },
    { text: 'Spiral idea', options: { bold: true, color: C.accent2 } }, { text: ' — four unknowns prototyped first: SSE fan-out (load test), GPS states, route snapping, ML feasibility', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 6 } },
    { text: 'Iterative', options: { bold: true, color: C.accent3 } }, { text: ' — the same parts improved in reviewed rounds: #14–#17 and this submission pass, each through a pull request with approval and a passing check', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 6 } },
    { text: 'V-model pairing for tests. Not used: Scrum sprints, waterfall sign-off.', options: { color: C.accent6 } },
  ] });
  // Timeline
  const items = [
    ['Wk 3', 'Team studio, topic proposal', 'course plan', false],
    ['Wk 4', 'Topic approval; proposal due', 'date not recorded', false],
    ['31 Oct', 'Baseline: 5 slices, load tests', 'repository', true],
    ['1–2 Nov', 'PRs #12–#16, reviews, protected main', 'GitHub', true],
    ['6–9 Nov', 'PR #17: review, 4 fixes, approval, merge', 'GitHub', true],
    ['10 Nov', 'Submission pass: SSD, UML print, video', 'this branch', true],
    ['Wk 14–15', 'Presentation and demo', 'slot not yet published', false],
  ];
  const x0 = 6.05;
  const y0 = 1.55;
  s.addShape(pres.ShapeType.line, { x: x0 + 0.22, y: y0 + 0.15, w: 0, h: 0.62 * (items.length - 1), line: { color: C.accent6, width: 2 } });
  items.forEach(([when, what, source, recorded], i) => {
    const y = y0 + i * 0.62;
    s.addShape(pres.ShapeType.ellipse, { x: x0 + 0.08, y: y + 0.01, w: 0.28, h: 0.28, fill: { color: recorded ? C.accent1 : C.background1 }, line: { color: C.accent1, width: 2 } });
    tb(s, when, { x: x0 + 0.5, y: y - 0.04, w: 1.05, h: 0.36, fontSize: 13, bold: true, color: C.text2 });
    tb(s, [{ text: what, options: { breakLine: true } }, { text: source, options: { fontSize: 10, color: C.accent6 } }], { x: x0 + 1.55, y: y - 0.05, w: 5.1, h: 0.6, fontSize: 13 });
  });
  tb(s, 'Filled dot: in the repository record · open dot: course schedule (indicative) — our own dates for these are not recorded', { x: x0, y: 5.95, w: 6.7, h: 0.4, fontSize: 11, color: C.accent6 });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 5.7, w: 5.1, h: 1.05, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, rectRadius: 0.1 });
  tb(s, [{ text: 'Lesson: ', options: { bold: true } }, { text: 'the recorded work is compressed into 31 Oct – 10 Nov. Starting the repository at the proposal would have left time for stakeholders and a field test (report §9).' }], { x: M + 0.2, y: 5.7, w: 4.7, h: 1.05, fontSize: 12, valign: 'middle' });
  s.addNotes([
    'Speaker: Abdullah (1:00).',
    'Incremental vs iterative (Module 02): incremental adds new parts in each slice; iterative improves the same part in each round. Our baseline was built as five slices on an architectural skeleton chosen first, because increment 1 must carry every later increment. After that, most work was iterative: reviewed pull requests improving existing parts (GPS resumption, the UML validator after Zuhair requested changes, records, the review findings on #17, and this submission pass). #12 and #13 added new parts, so they were increments.',
    'Spiral idea: we tested the four riskiest unknowns first with prototypes or a feasibility check (report §3.1 table). These were risk-driven steps inside the build, not separate spiral loops.',
    'Timeline honesty: the Week 3 studio, Week 4 approval and Week 9 checkpoint come from the course schedule; the dates of our own actions there are not in the project record, so the slide does not invent them. The repository record starts on 31 October.',
    'Be ready for: "Why not agile?" — two people, fixed course gates, quality attributes known early; we kept short review loops on a protected main branch but no sprints.',
  ].join('\n'));
}

// ---------- 4 · Alternatives and why ----------
{
  const s = content('Process and architecture');
  s.addText('Four architectures compared — the modular monolith wins', { placeholder: 'title' });
  s.addChart(pres.ChartType.bar, [{ name: 'Weighted score (max 70)', labels: ['A  Modular monolith + SSE', 'C  Monolith + client polling', 'D  Serverless backend-as-a-service', 'B  Microservices + broker'], values: [61, 52, 45, 44] }], {
    x: M, y: 1.45, w: 6.6, h: 4.6, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [THEME.colors.accent1],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 16, dataLabelColor: THEME.colors.dk1, dataLabelFontFace: '+mn-lt',
    catAxisLabelFontSize: 14, catAxisLabelColor: THEME.colors.dk1, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true, valAxisMaxVal: 70,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, showTitle: false, barGapWidthPct: 60,
  });
  bullets(s, [
    'Weighted against freshness, robustness, security & privacy, modifiability, team-of-two simplicity, growth',
    'A: best measured freshness, one trust boundary, one command to run',
    'C: equal to A except freshness — 1 s polling means 1,000–3,000 requests/s',
    'D: location data held by a third party; GPS timeouts need a scheduler',
    'B: independent scaling one campus does not need; ≥ 5 deployables',
  ], { x: 7.6, y: 1.55, w: 5.1, h: 3.9, fontSize: 15 });
  tb(s, 'Scores are a technical judgement (report §6.3); only A\'s freshness is measured.', { x: 7.6, y: 5.6, w: 5.1, h: 0.5, fontSize: 12, color: C.accent6 });
  s.addNotes([
    'Speaker: Abdullah (1:00).',
    'Key point: A and C differ only on freshness, so the push decision rests on the one-second requirement. If the office accepted data a few seconds old, polling would be a good choice.',
    'What would change our mind: several campuses or several server instances (a broker behind EventPublisher), or a relaxed freshness requirement (polling).',
    'If either of you changed a score in your own review (issues #2, #9), say which one and why. Otherwise say the scores are the technical assessment in docs/architecture/technical-assessment.md.',
  ].join('\n'));
}

// ---------- 5 · Architecture, components, deployment ----------
{
  const s = content('Process and architecture');
  s.addText('One process, eight components, enforced boundaries', { placeholder: 'title' });
  const clients = ['Student UI', 'Driver UI + GPS simulator', 'Office UI'];
  clients.forEach((t, i) => box(s, { x: 0.9 + i * 3.95, y: 1.35, w: 3.6, h: 0.55, text: t, fill: C.accent3 }));
  tb(s, 'Browsers: REST (JSON) + Server-Sent Events over HTTP', { x: 0.9, y: 1.95, w: 11.5, h: 0.3, fontSize: 12, color: C.accent6, align: 'center' });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 2.3, w: W - 2 * M, h: 3.55, fill: { color: C.background2 }, line: { color: C.background2 }, rectRadius: 0.12 });
  tb(s, 'Campus Shuttle server — one Node.js process in TypeScript (src/)', { x: 0.85, y: 2.38, w: 8, h: 0.33, fontSize: 13, bold: true, color: C.text2 });
  box(s, { x: 0.9, y: 2.78, w: 5.6, h: 0.6, text: 'Web API — auth, role checks, CSRF, CSP (web/)' });
  box(s, { x: 6.85, y: 2.78, w: 5.6, h: 0.6, text: 'Real-time Gateway — SSE, coalescing (realtime/)' });
  ['Identity & Access\n(identity/)', 'Network & routes\n(network/)', 'Tracking, ETA, GPS states\n(tracking/)', 'Demand & forecasting\n(demand/)'].forEach((t, i) =>
    box(s, { x: 0.9 + i * 2.92, y: 3.55, w: 2.7, h: 0.9, text: t, fill: C.background1, color: C.text1 }));
  box(s, { x: 0.9, y: 4.65, w: 5.6, h: 0.55, text: 'Event Bus — domain events, Observer (shared/)', fill: C.accent2 });
  box(s, { x: 6.85, y: 4.65, w: 5.6, h: 0.55, text: 'Persistence — SQLite repositories (persistence/)', fill: C.text2 });
  tb(s, 'test/architecture.test.ts fails if an import breaks these rules (imports only, not every UML detail)', { x: 0.9, y: 5.32, w: 11.5, h: 0.4, fontSize: 12, color: C.text1 });
  s.addShape(pres.ShapeType.roundRect, { x: M, y: 6.0, w: W - 2 * M, h: 0.8, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0' }, rectRadius: 0.1 });
  tb(s, [{ text: 'Deployment  ', options: { bold: true, color: C.text2 } }, { text: 'one server runs the Node.js process and one SQLite database file; phones and laptops use a browser. No broker, no cloud service. HTTPS behind a reverse proxy is the next production step (UML A.12).' }], { x: M + 0.3, y: 6.0, w: W - 2 * M - 0.6, h: 0.8, fontSize: 14, valign: 'middle' });
  s.addNotes([
    'Speaker: Abdullah (0:50).',
    'Each box is a folder in src/. Components talk through port interfaces and domain events; tracking and demand never import each other; only the composition root (src/container.ts) knows concrete classes and SQLite.',
    'Diagrams to point at: component diagram A.11 (provided and required interfaces), deployment diagram A.12 (one server node, browser nodes), design sequence A.5 (one upload).',
    'Trade-off: one process is simple to run, test and secure; the cost is that one server carries every viewer. Several campuses would need a broker behind EventPublisher.',
  ].join('\n'));
}

// ---------- 6 · Patterns tied to behaviour ----------
{
  const s = content('Process and architecture');
  s.addText('Five patterns, each tied to behaviour you will see', { placeholder: 'title' });
  const rows = [
    ['State', 'Live → Location delayed (20 s) → GPS lost (60 s) → Live; what passengers may be told', 'tracking/signal-state.ts — one class per state'],
    ['Adapter', 'The demo drives the same upload path as a real phone', 'public/js/gps.js — simulated and device GPS, one contract'],
    ['Observer', 'One upload reaches every browser and the waiting module', 'shared/event-bus.ts → SseHub, WaitingService'],
    ['Repository', 'Positions stored before memory changes; tests run without a database', 'persistence/sqlite-*.ts, in-memory doubles'],
    ['Strategy', 'Arrival-time and forecasting models swapped and compared', 'EtaStrategy, DemandPredictor (4 models)'],
  ];
  s.addTable([
    [{ text: 'Pattern', options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk2 } } }, { text: 'Behaviour in the prototype', options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk2 } } }, { text: 'Where in the code', options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk2 } } }],
    ...rows.map(([p, b, c]) => [{ text: p, options: { bold: true, color: THEME.colors.dk2, fontFace: THEME.headFontFace, fontSize: 16 } }, b, { text: c, options: { fontFace: 'Consolas', fontSize: 12, color: THEME.colors.accent6 } }]),
  ], { x: M, y: 1.45, w: W - 2 * M, colW: [1.9, 5.6, 4.63], fontSize: 14, color: THEME.colors.dk1, border: { type: 'solid', pt: 0.75, color: 'CBD5E1' }, fill: { color: 'FFFFFF' }, rowH: 0.72, valign: 'middle' });
  tb(s, 'Class diagrams of all five: UML set A.13–A.17. One composition root (src/container.ts) wires them; tests swap the clock, the database and the strategies.', { x: M, y: 6.0, w: W - 2 * M, h: 0.6, fontSize: 13, color: C.accent6 });
  s.addNotes([
    'Speaker: Zuhair (0:50).',
    'For each pattern say the problem first, then where it is: State is the GPS signal (the UML state machine A.6 maps one-to-one onto four classes); Adapter is why the simulator is honest: it uses exactly the same upload path; Observer is the event bus that feeds the SSE hub; Repository keeps business rules free of SQL; Strategy lets us compare four forecasting models and two ETA strategies.',
    'The State pattern is the one you will see working in the video: Live, Location delayed, GPS lost, Live again.',
  ].join('\n'));
}

// ---------- 7 · Demonstration ----------
pres.addSection({ title: 'Demonstration' });
{
  const s = content('Demonstration');
  s.addText('Demonstration: what happens when connectivity fails?', { placeholder: 'title' });
  const frame = { x: M, y: 1.4, w: 7.6, h: 4.275 };
  if (VIDEO) {
    const cover = `data:image/jpeg;base64,${fs.readFileSync(SHOT('demo-video-poster.jpg')).toString('base64')}`;
    s.addMedia({ type: 'video', path: VIDEO, cover, ...frame, objectName: 'Demonstration video' });
  } else {
    picture(s, SHOT('demo-video-poster.jpg'), frame, 'Frame from the demonstration video: network loss, trip not ended');
  }
  tb(s, VIDEO ? `Recorded demonstration, ${VIDEO_LENGTH} (embedded; also supplied as 06-Demo.mp4)` : `Recorded demonstration, ${VIDEO_LENGTH}: supplied separately as 06-Demo.mp4 with 06-Demo.srt`, { x: M, y: 5.75, w: 7.6, h: 0.3, fontSize: 12, color: C.accent6 });
  card(s, { x: 8.55, y: 1.4, w: 4.18, h: 4.65, title: 'In the video and live', bodySize: 13, body: [
    { text: 'Normal trip: driver starts, student sees Live, office sees the same trip', options: { bullet: true, breakLine: true } },
    { text: 'Network loss: positions queued; "Trip NOT ended"; 10 positions delivered in one batch', options: { bullet: true, breakLine: true } },
    { text: 'GPS outage: Live → Location delayed → GPS lost, no estimate → Live', options: { bullet: true, breakLine: true } },
    { text: 'Waiting request → office count → served at the stop', options: { bullet: true, breakLine: true } },
    { text: 'Forecast cell → how the number was calculated (synthetic history)', options: { bullet: true } },
  ] });
  tb(s, 'Real prototype, three browser windows, throw-away demo database. Simulated GPS; skipped waiting time is labelled TIME-LAPSE with the real elapsed time. Narration: synthetic voice.', { x: M, y: 6.15, w: W - 2 * M, h: 0.55, fontSize: 12, color: C.text1 });
  s.addNotes([
    'Speakers: Abdullah introduces (0:20); the live demonstration follows docs/demo-script.md (Abdullah drives use case 1, Zuhair use case 2).',
    'Provisional plan (official time limit not yet published): show the video excerpt 0:51–1:54 (network loss and GPS outage, 1:03), then run the live demonstration of the waiting request, the office view and the forecast explanation (2:30). If the live system fails, play the rest of the video instead; if the instructor allows the video to replace the live demonstration, play it in full (4:11).',
    'Say clearly: the video was recorded from the running prototype; GPS is simulated; waits were shortened only where the TIME-LAPSE box shows the real elapsed time; the voice is synthetic, not either of us.',
    VIDEO ? 'The video is embedded. If it does not play, open 06-Demo.mp4 from the same folder.' : 'In this repository copy the video is not embedded (it is not kept in Git). Use the submission copy of the deck, or open 06-Demo.mp4.',
  ].join('\n'));
}

// ---------- 8 · Verification, limitations, reflection ----------
pres.addSection({ title: 'Evidence and conclusion' });
{
  const s = content('Evidence and conclusion');
  s.addText('Verification, limitations and what we learned', { placeholder: 'title' });
  stat(s, { x: M, y: 1.3, w: 2.9, value: '144', label: '119 Node + 25 Chromium tests, all passing (incl. accessibility)' });
  stat(s, { x: 3.7, y: 1.3, w: 2.9, value: '26 × 4', label: 'endpoints × caller types checked for role access' });
  stat(s, { x: 6.8, y: 1.3, w: 2.9, value: '35–37 ms', label: 'p95 to 1,000 simulated viewers — local benchmark, one PC' });
  stat(s, { x: 9.9, y: 1.3, w: 2.9, value: '21', label: 'defects and corrections in the test plan, all resolved', color: C.accent2 });
  card(s, { x: M, y: 3.35, w: 5.9, h: 3.4, title: 'Limitations', bodySize: 13, body: [
    { text: 'GPS behaviour tested with the simulator only — no real phone or vehicle yet', options: { bullet: true, breakLine: true } },
    { text: 'A driver page in a background tab stops reporting; a native app may be needed', options: { bullet: true, breakLine: true } },
    { text: 'Forecasts shown on synthetic history: the method, not accuracy', options: { bullet: true, breakLine: true } },
    { text: 'No HTTPS, university single sign-on, Arabic or screen-reader session yet; the benchmark is not a deployment test', options: { bullet: true } },
  ] });
  card(s, { x: 6.8, y: 3.35, w: 5.93, h: 3.4, title: 'Reflection (report §9)', bodySize: 13, body: [
    { text: 'Spread the work: the record starts in Week 9', options: { bullet: true, breakLine: true } },
    { text: 'Talk to stakeholders before fixing numbers such as 1 s, 20 s and 60 s', options: { bullet: true, breakLine: true } },
    { text: 'Check content, not existence: an independent reviewer found what the author\'s own checks missed', options: { bullet: true, breakLine: true } },
    { text: 'Keep claims at the strength of the evidence', options: { bullet: true } },
  ], foot: 'Each member confirms or corrects this reflection in person.' });
  s.addNotes([
    'Speaker: Abdullah (1:10).',
    'Numbers from docs/test-plan.md §4 and docs/evidence. The 25 Chromium tests drive the real pages against a fresh server, including accessibility checks of all three role pages; GitHub Actions runs them on every pull request. V-model pairing: unit ↔ module design, architecture test ↔ architectural design, integration ↔ system design, demo ↔ requirements.',
    'Be precise about the benchmark: simulated viewers in the same process over loopback, one session, no browsers. It shows fan-out, not campus Wi-Fi.',
    'Reflection: the report §9 draft was prepared from the project record. Before the presentation, each of you replaces these lines with what you would personally do differently, in your own words.',
  ].join('\n'));
}

// ---------- 9 · Conclusion, contributions, questions ----------
{
  const s = pres.addSlide({ masterName: 'Closing dark', sectionTitle: 'Evidence and conclusion' });
  s.addText('Conclusion', { placeholder: 'title' });
  tb(s, [
    { text: 'A modular monolith with server push gives fresh positions in milliseconds locally — and, more importantly, says "delayed" and "lost" instead of guessing when GPS or the network fails.', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 8 } },
    { text: 'Next: a field test with real phones, HTTPS and single sign-on, then real demand data before any trained model.' },
  ], { x: M, y: 1.4, w: 6.6, h: 2.6, fontSize: 17, color: C.background1 });
  s.addShape(pres.ShapeType.roundRect, { x: 7.55, y: 1.4, w: 5.18, h: 3.2, fill: { color: C.accent1 }, line: { color: C.accent1 }, rectRadius: 0.12 });
  tb(s, 'Contributions (factual record, report §10)', { x: 7.8, y: 1.55, w: 4.7, h: 0.4, fontSize: 15, bold: true, color: C.background1 });
  tb(s, [
    { text: 'Abdullah: ', options: { bold: true } }, { text: 'repository and baseline import, pull requests #14–#17 and the submission pull request, merges and branch protection', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 6 } },
    { text: 'Zuhair Halawa: ', options: { bold: true } }, { text: 'pull requests #12 (median forecaster) and #13 (browser tests, accessibility, CI), reviews and approvals of #14–#17, first UML render', options: { breakLine: true } },
    { text: ' ', options: { breakLine: true, fontSize: 6 } },
    { text: 'AI tools and personal statements: report §10', options: { color: 'D1FAE5' } },
  ], { x: 7.8, y: 2.0, w: 4.75, h: 2.5, fontSize: 13, color: C.background1 });
  tb(s, 'Questions?', { x: M, y: 4.85, w: 12.1, h: 1.0, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace });
  tb(s, 'Backup slides follow: GPS states and network loss · synthetic backtest · one upload, measured', { x: M, y: 5.95, w: 12.1, h: 0.5, fontSize: 13, color: C.background2 });
  s.addNotes([
    'Speakers: Zuhair gives the conclusion (0:30); Abdullah opens the questions (0:20).',
    'Contributions: read only what the factual record shows (which account submitted, reviewed or merged what). Do not claim more. Each member\'s own statement and signature are in the private submission copy; tool use is declared in report §10.2.',
    'Keep this slide up during questions. For detailed questions use the backup slides and docs/presentation/viva-sheet.md.',
  ].join('\n'));
}

// ---------- Backup slides ----------
pres.addSection({ title: 'Backup' });
{
  const s = content('Backup');
  s.addText('Backup · When GPS fails, the system says so instead of guessing', { placeholder: 'title' });
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
  card(s, { x: M, y: 4.6, w: 12.1, h: 1.75, title: 'Network loss on the driver\'s phone', body: 'Positions are queued in the open driver page (newest 500 kept) and retried with backoff (1 → 15 s). On reconnection the server corrects the phone\'s clock using sentAt, sorts them, and rejects duplicates, positions over 10 min old and impossible jumps. Ending the trip fails honestly while offline. Closing the page loses the queue.' });
  s.addNotes('Backup for questions on the State pattern and QA-3/QA-4. The UML state machine A.6 maps one-to-one onto the four state classes in src/tracking/signal-state.ts.');
}
{
  const s = content('Backup');
  s.addText('Backup · Synthetic backtest: the method works, accuracy unproven', { placeholder: 'title' });
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
    'With one semester of real requests, the same backtest decides whether a trained model is worth adding (RBC Borealis lifecycle: feasibility first)',
  ], { x: 7.8, y: 2.15, w: 4.9, h: 4.2, fontSize: 15 });
  s.addNotes('Backup for questions on forecasting (report §6.7). 1,890 stop-hours, rolling origin, no look-ahead (tested). Reproduce with npm run evaluate. Do not present this as accuracy.');
}
{
  const s = content('Backup');
  s.addText('Backup · One GPS upload reaches every viewer in milliseconds', { placeholder: 'title' });
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
  s.addNotes('Backup for questions on QA-1/QA-2 and the design sequence diagram A.5. It does not prove that 3,000 real students on campus Wi-Fi get the same latency; a deployment test from separate machines is still needed.');
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
  console.log(`Wrote ${OUT}${VIDEO ? ` (video embedded: ${path.basename(VIDEO)})` : ''}`);
})();
