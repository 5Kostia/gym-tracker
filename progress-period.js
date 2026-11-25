import { h, dateToStr, todayStr } from '../util.js';

const currentMonth = () => todayStr().slice(0, 7);
const firstMonth = '1900-01';
const monthLabel = key => new Date(key + '-01T12:00:00').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

export function shiftMonth(key, offset) {
  const [year, month] = key.split('-').map(Number);
  return dateToStr(new Date(year, month - 1 + offset, 1)).slice(0, 7);
}

export function withinPeriod(date, from, to) {
  const month = date.slice(0, 7);
  return month >= from && month <= to;
}

export function periodChart(title, state, draw) {
  const latest = currentMonth();
  state.month ||= latest;
  state.from ||= state.month;
  state.to ||= state.month;
  const graph = h('div', { class: 'period-graph' });
  const label = h('b', { 'aria-live': 'polite' });
  const step = offset => {
    state.month = shiftMonth(state.month, offset);
    update();
  };
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий месяц', onclick: () => step(-1) }, '‹');
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий месяц', onclick: () => step(1) }, '›');
  const nav = h('div', { class: 'period-nav' }, prev, label, next);
  const chartHeader = h('div', { class: 'period-head' }, title ? h('span', { class: 'muted' }, title) : null, nav);

  const monthInput = value => h('input', {
    type: 'month', required: true, min: firstMonth, max: latest, value,
    placeholder: 'ГГГГ-ММ', pattern: '[0-9]{4}-(0[1-9]|1[0-2])',
  });
  const from = monthInput(state.from);
  const to = monthInput(state.to);
  const error = h('p', { class: 'field-error sub', role: 'status' });
  const form = h('form', { class: 'period-form', onsubmit: event => {
    event.preventDefault();
    if (from.value < firstMonth || to.value > latest || from.value > to.value) {
      error.textContent = 'Укажи месяцы по порядку, до текущего включительно.';
      return;
    }
    state.from = from.value;
    state.to = to.value;
    error.textContent = '';
    update();
  } },
  h('label', { class: 'field' }, h('span', null, 'С месяца'), from),
  h('label', { class: 'field' }, h('span', null, 'По месяц'), to),
  h('button', { class: 'btn small', type: 'submit' }, 'Показать'), error);

  const modes = Object.entries({ month: 'Месяц', range: 'Диапазон' }).map(([mode, text]) =>
    h('button', { type: 'button', onclick: () => { state.mode = mode; update(); } }, text));
  function update() {
    const useRange = state.mode === 'range';
    nav.hidden = useRange;
    form.hidden = !useRange;
    label.textContent = monthLabel(state.month);
    prev.disabled = state.month <= firstMonth;
    next.disabled = state.month >= latest;
    modes.forEach((button, index) => {
      const active = index === Number(useRange);
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    graph.replaceChildren(draw(useRange ? state.from : state.month, useRange ? state.to : state.month));
  }
  update();
  return h('div', { class: 'period-chart' }, chartHeader,
    h('div', { class: 'seg two period-mode', role: 'group', 'aria-label': 'Период графика' }, modes), form, graph);
}
