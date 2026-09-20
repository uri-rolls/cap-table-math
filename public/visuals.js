// Ownership bars: the visual explanation shown after every answer.
// A viz is { type: 'stake' | 'money', bars: [{ label, segs: [{ k, v, label }] }] }.
// Segment kinds: you, other, new, pool. Values are percentages of the bar.
import { fmt } from './math.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function stakeBar(bar, { animateFrom = null, showValues = true } = {}) {
  const segs = bar.segs.filter((s) => s.v > 0.05);
  const cells = segs
    .map((s, i) => {
      const from = animateFrom?.find((f) => f.k === s.k && f.label === s.label);
      const start = from ? from.v : s.v;
      const text = showValues && s.v >= 14 ? `${fmt(s.v)}%` : '';
      return `<span class="seg seg-${s.k}" style="--to:${s.v}%;--from:${start}%" data-i="${i}" title="${esc(s.label)} ${fmt(s.v)}%"><i>${text}</i></span>`;
    })
    .join('');
  const legend = segs.map((s) => `<span class="lg lg-${s.k}">${esc(s.label)}<b>${fmt(s.v)}%</b></span>`).join('');
  return `<figure class="bar"><figcaption>${esc(bar.label)}</figcaption><div class="track" role="img" aria-label="${esc(bar.label)}: ${segs.map((s) => `${s.label} ${fmt(s.v)}%`).join(', ')}">${cells}</div><div class="legend">${legend}</div></figure>`;
}

export function renderViz(viz) {
  if (!viz || !viz.bars?.length) return '';
  const [first, ...rest] = viz.bars;
  const html = [stakeBar(first, { showValues: viz.type === 'stake' })]
    .concat(rest.map((b) => stakeBar(b, { animateFrom: first.segs, showValues: viz.type === 'stake' })))
    .join('');
  return `<div class="viz viz-${viz.type}">${html}</div>`;
}

// Small ownership glyph used in the header/home: your slice of a ring.
export function ring(percent, size = 44, stroke = 5) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="butt" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
