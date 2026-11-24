// Прогресс: рекорды, графики силы, объём, динамика тела.
import { h, fmtNum, fmtDate, fmtShort, fmtVolume, todayStr, dateToStr, toast } from '../util.js';
import { S, exerciseHistory, personalRecords, workoutVolume, measurementsOfType, measureUnit,
  ONE_REP_MAX_FORMULAS, saveOneRepMaxFormula } from '../store.js';
import { lineChart, barChart } from '../charts.js';

const ui = { ex: null, metric: 'maxW', body: null };

const METRICS = [
  { key: 'maxW', label: 'Вес', unit: 'кг' },
  { key: 'e1rm', label: '1ПМ', unit: 'кг' },
  { key: 'volume', label: 'Объём', unit: 'кг' },
];

export function renderProgress(root, rerender) {
  root.append(h('h1', null, 'Прогресс'));
  if (!S.workouts.length && !S.measurements.length) {
    root.append(h('div', { class: 'empty' }, 'Здесь появятся рекорды и графики, когда вы запишете первые тренировки и замеры.'));
    return;
  }

  // ---- общий объём ----
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const weekStart = dateToStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - mondayOffset));
  const monthStart = todayStr().slice(0, 7);
  let vWeek = 0, vMonth = 0, vAll = 0;
  for (const w of S.workouts) {
    const v = workoutVolume(w);
    vAll += v;
    if (w.date >= weekStart) vWeek += v;
    if (w.date.startsWith(monthStart)) vMonth += v;
  }
  root.append(h('h2', null, 'Тренировочный объём'),
    h('p', { class: 'sub' }, 'Сумма «вес × повторы» по всем подходам.'),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, fmtVolume(vWeek)), h('span', null, 'за неделю')),
      h('div', { class: 'stat' }, h('b', null, fmtVolume(vMonth)), h('span', null, 'за месяц')),
      h('div', { class: 'stat' }, h('b', null, fmtVolume(vAll)), h('span', null, 'за всё время'))));
  const recent = S.workouts.filter((w) => workoutVolume(w) > 0).slice(0, 14).reverse();
  root.append(h('div', { class: 'card' }, h('div', { class: 'muted', style: 'font-size:13px;margin-bottom:6px' }, 'Объём последних тренировок, кг'),
    barChart(recent.map((w) => ({ x: w.date, y: workoutVolume(w) })), { unit: 'кг' })));

  // ---- упражнение ----
  const names = [...new Set(S.workouts.flatMap((w) => w.exercises.filter((e) => e.sets.length).map((e) => e.name)))].sort((a, b) => a.localeCompare(b, 'ru'));
  if (names.length) {
    if (!ui.ex || !names.includes(ui.ex)) ui.ex = names[0];
    const select = h('select', { 'aria-label': 'Упражнение', onchange: (e) => { ui.ex = e.target.value; draw(); } },
      names.map((n) => h('option', { value: n, selected: n === ui.ex }, n)));
    const metrics = METRICS.map((m) => h('button', { type: 'button',
      onclick: () => { ui.metric = m.key; draw(); } }, m.label));
    const summary = h('div', { class: 'pr-grid' });
    const graph = h('div');
    const formulaSelect = h('select', { onchange: async (e) => {
      formulaSelect.disabled = true;
      try {
        await saveOneRepMaxFormula(e.target.value);
        draw();
      } catch (error) {
        console.error(error);
        formulaSelect.value = S.oneRepMaxFormula;
        toast('Не удалось сохранить формулу 1ПМ');
      } finally {
        formulaSelect.disabled = false;
      }
    } }, Array.from(ONE_REP_MAX_FORMULAS, ([id, formula]) =>
      h('option', { value: id, selected: id === S.oneRepMaxFormula }, formula.label)));
    const formulaControls = h('div', { style: 'margin-top:12px' },
      h('label', { class: 'field' }, h('span', null, 'Формула 1ПМ'), formulaSelect),
      h('p', { class: 'sub' }, 'Расчёт по весу и повторам. На подходах с большим числом повторов оценка менее точна.'));
    function draw() {
      const hist = exerciseHistory(ui.ex);
      const maxW = Math.max(0, ...hist.map((x) => x.maxW));
      const best = hist.reduce((a, x) => (x.e1rm > a ? x.e1rm : a), 0);
      const maxReps = Math.max(0, ...hist.map((x) => x.maxReps));
      metrics.forEach((btn, i) => {
        const active = ui.metric === METRICS[i].key;
        btn.classList.toggle('on', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      const m = METRICS.find((x) => x.key === ui.metric);
      const pts = hist.filter((x) => x[m.key] > 0).map((x) => ({ x: x.date, y: m.key === 'maxW' || m.key === 'e1rm' ? Math.round(x[m.key] * 10) / 10 : x[m.key] }));
      summary.replaceChildren(
        h('div', { class: 'pr gold' }, h('b', null, maxW ? fmtNum(maxW) : '–'), h('span', null, 'макс. вес, кг')),
        h('div', { class: 'pr' }, h('b', null, best ? fmtNum(Math.round(best * 10) / 10) : '–'), h('span', null, 'расчётный 1ПМ')),
        h('div', { class: 'pr' }, h('b', null, maxReps || '–'), h('span', null, 'макс. повторов')));
      formulaControls.hidden = m.key !== 'e1rm';
      graph.replaceChildren(lineChart(pts, { unit: m.unit }));
    }
    root.append(h('h2', null, 'Сила по упражнению'),
      h('div', { class: 'card' }, h('label', { class: 'field' }, h('span', null, 'Упражнение'), select),
        summary, h('div', { class: 'seg' }, metrics), formulaControls, h('div', { style: 'height:8px' }), graph));
    draw();
  }

  // ---- рекорды ----
  const prs = personalRecords();
  if (prs.length) {
    root.append(h('h2', null, 'Личные рекорды'),
      h('div', { class: 'card' }, h('table', { class: 'pr-table' }, prs.map((p) => h('tr', null,
        h('td', null, h('div', null, p.name), h('div', { class: 'd' }, fmtDate(p.date))),
        h('td', null, h('b', { class: 'gold' }, `${fmtNum(p.weight)} кг`), p.reps ? h('div', { class: 'd' }, `× ${p.reps}`) : null))))));
  }

  // ---- тело ----
  const types = S.measureTypes.filter((t) => measurementsOfType(t.name).length);
  if (types.length) {
    if (!ui.body || !types.some((t) => t.name === ui.body)) ui.body = types[0].name;
    const holder = h('div');
    const sel = h('select', { 'aria-label': 'Измерение', onchange: (e) => { ui.body = e.target.value; drawBody(); } },
      types.map((t) => h('option', { value: t.name, selected: t.name === ui.body }, t.name)));
    function drawBody() {
      const arr = measurementsOfType(ui.body);
      const unit = measureUnit(ui.body);
      const first = arr[0], last = arr[arr.length - 1];
      const diff = Math.round((last.value - first.value) * 100) / 100;
      holder.replaceChildren(
        h('p', { class: 'sub', style: 'margin-top:8px' }, arr.length > 1
          ? `С ${fmtShort(first.date)}: ${diff > 0 ? '+' : ''}${fmtNum(diff)} ${unit} (сейчас ${fmtNum(last.value)} ${unit})`
          : `Один замер: ${fmtNum(last.value)} ${unit}`),
        lineChart(arr.map((m) => ({ x: m.date, y: m.value })), { unit }));
    }
    root.append(h('h2', null, 'Тело'), h('div', { class: 'card' }, h('label', { class: 'field' }, h('span', null, 'Измерение'), sel), holder));
    drawBody();
  }
}
