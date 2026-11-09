// Minimal, dependency-free SVG charts for the office dashboard.
// Single-series bars (title names the series), recessive axes, 4px rounded
// data ends anchored to the baseline, hover tooltips via data-tip.

import { enableTooltips, esc } from './ui.js';

const LIGHT_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
// '#2672cc' replaces '#2a78d6', on which neither ink reached the 4.5:1 contrast that small text needs.
const DARK_RAMP = ['#184f95', '#1c5cab', '#256abf', '#2672cc', '#3987e5', '#6da7ec', '#9ec5f4'];
const INKS = ['#0b1220', '#ffffff'];
const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * exp;
}

/** Sequential single-hue colour for a magnitude 0..max (blue ramp, light→dark). */
export function sequentialColor(value, max) {
  if (!value || max <= 0) return null;
  const ramp = dark() ? DARK_RAMP : LIGHT_RAMP;
  const t = Math.min(1, value / max);
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

/** Readable ink for text drawn on a sequential cell. */
export function inkFor(background) {
  if (!background) return '';
  // The ink with the higher WCAG contrast ratio against the cell (every ramp colour reaches 4.5:1 with one of them).
  return INKS.reduce((best, ink) => (contrast(ink, background) > contrast(best, background) ? ink : best));
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Vertical bar chart.
 * bars: [{ label, value, tip, cls }]; options: { height, tickEvery, unit }
 */
export function barChart(container, bars, options = {}) {
  const width = 900;
  const height = options.height ?? 220;
  const m = { top: 12, right: 8, bottom: 26, left: 40 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const band = innerW / Math.max(1, bars.length);
  const barW = Math.max(2, Math.min(28, band - 2)); // 2px surface gap between bars
  const y = (v) => m.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const tickEvery = options.tickEvery ?? Math.ceil(bars.length / 12);

  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label ?? 'Bar chart')}">`;
  for (const t of ticks) {
    svg += `<line class="gridline" x1="${m.left}" x2="${width - m.right}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<g class="axis"><text x="${m.left - 6}" y="${y(t) + 4}" text-anchor="end">${esc(formatTick(t))}</text></g>`;
  }
  bars.forEach((b, i) => {
    const x = m.left + i * band + (band - barW) / 2;
    const top = y(b.value);
    const h = Math.max(0, m.top + innerH - top);
    svg += `<g class="col" data-tip="${esc(b.tip ?? `${b.label}: ${b.value}`)}">`;
    svg += `<rect class="hit" x="${m.left + i * band}" y="${m.top}" width="${band}" height="${innerH}"/>`;
    if (h > 0) {
      const r = Math.min(4, barW / 2, h);
      // Rounded top corners only; the bar stays anchored flat on the baseline.
      const path = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
      svg += `<path class="bar ${esc(b.cls ?? '')}" d="${path}"/>`;
    }
    svg += '</g>';
    if (i % tickEvery === 0) {
      svg += `<g class="axis"><text x="${x + barW / 2}" y="${height - 8}" text-anchor="middle">${esc(b.label)}</text></g>`;
    }
  });
  svg += `<line class="gridline" x1="${m.left}" x2="${width - m.right}" y1="${y(0)}" y2="${y(0)}"/>`;
  svg += '</svg>';
  container.classList.add('chart');
  container.innerHTML = svg;
  if (!container.dataset.tips) {
    enableTooltips(container);
    container.dataset.tips = '1';
  }
}

function formatTick(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
