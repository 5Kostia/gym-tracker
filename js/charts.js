// Простой линейный график на SVG, без внешних библиотек.
import { svg, h, fmtNum, fmtShort } from './util.js';

// points: [{ x: 'YYYY-MM-DD', y: число }] по возрастанию даты
export function lineChart(points, { unit = '', height = 190 } = {}) {
  if (!points.length) return h('div', { class: 'empty small' }, 'Пока нет данных для графика');
  const W = 340, H = height, L = 38, R = 12, T = 14, B = 26;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const padY = (max - min) * 0.12;
  min -= padY; max += padY;
  if (min < 0 && Math.min(...ys) >= 0) min = 0;
  const times = points.map((p) => new Date(p.x + 'T00:00:00').getTime());
  const t0 = times[0], t1 = times[times.length - 1];
  const px = (i) => (t1 === t0 ? (L + W - R) / 2 : L + ((times[i] - t0) / (t1 - t0)) * (W - L - R));
  const py = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);

  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'График' });
  // горизонтальные линии и подписи
  for (let i = 0; i < 4; i++) {
    const v = min + ((max - min) * i) / 3;
    const y = py(v);
    el.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }));
    el.append(svg('text', { x: L - 6, y: y + 4, class: 'lbl', 'text-anchor': 'end' }, fmtNum(Math.round(v * 10) / 10)));
  }
  el.append(svg('text', { x: L, y: H - 6, class: 'lbl', 'text-anchor': 'start' }, fmtShort(points[0].x)));
  if (points.length > 1) el.append(svg('text', { x: W - R, y: H - 6, class: 'lbl', 'text-anchor': 'end' }, fmtShort(points[points.length - 1].x)));

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  if (points.length > 1) {
    const area = `${d} L${px(points.length - 1).toFixed(1)} ${H - B} L${px(0).toFixed(1)} ${H - B} Z`;
    el.append(svg('path', { d: area, class: 'area' }));
    el.append(svg('path', { d, class: 'line' }));
  }
  points.forEach((p, i) => {
    el.append(svg('circle', { cx: px(i).toFixed(1), cy: py(p.y).toFixed(1), r: i === points.length - 1 ? 4.5 : 3, class: i === points.length - 1 ? 'dot last' : 'dot' },
      svg('title', null, `${fmtShort(p.x)}: ${fmtNum(p.y)} ${unit}`.trim())));
  });
  return el;
}

// Столбчатый график (например, объём по тренировкам)
export function barChart(points, { unit = '', height = 170 } = {}) {
  if (!points.length) return h('div', { class: 'empty small' }, 'Пока нет данных для графика');
  const W = 340, H = height, L = 38, R = 8, T = 14, B = 26;
  const max = Math.max(...points.map((p) => p.y)) || 1;
  const slot = (W - L - R) / points.length;
  const bw = Math.min(26, slot * 0.7);
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'График' });
  for (let i = 0; i < 3; i++) {
    const v = (max * i) / 2;
    const y = T + (1 - v / max) * (H - T - B);
    el.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }));
    el.append(svg('text', { x: L - 6, y: y + 4, class: 'lbl', 'text-anchor': 'end' }, fmtNum(Math.round(v))));
  }
  points.forEach((p, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    const bh = (p.y / max) * (H - T - B);
    el.append(svg('rect', { x: x.toFixed(1), y: (H - B - bh).toFixed(1), width: bw.toFixed(1), height: Math.max(bh, 1).toFixed(1), rx: 3, class: 'bar' },
      svg('title', null, `${fmtShort(p.x)}: ${fmtNum(Math.round(p.y))} ${unit}`.trim())));
  });
  el.append(svg('text', { x: L, y: H - 6, class: 'lbl', 'text-anchor': 'start' }, fmtShort(points[0].x)));
  if (points.length > 1) el.append(svg('text', { x: W - R, y: H - 6, class: 'lbl', 'text-anchor': 'end' }, fmtShort(points[points.length - 1].x)));
  return el;
}
