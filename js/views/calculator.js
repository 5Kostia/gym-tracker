import { h, choiceField, num, fmtNum } from '../util.js';
import { S, ONE_REP_MAX_FORMULAS, est1RM } from '../store.js';

const input = { weight: '', reps: '', formula: null };
const percentages = Array.from({ length: 11 }, (_, index) => 100 - index * 5);
const kilos = value => fmtNum(value) + ' кг';

export function renderCalculator(root) {
  root.append(h('h1', null, 'Калькулятор 1ПМ'));
  const weight = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '80', value: input.weight });
  const reps = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '2', value: input.reps });
  const formula = h('select', null, Array.from(ONE_REP_MAX_FORMULAS, ([id, item]) =>
    h('option', { value: id, selected: id === (input.formula || S.oneRepMaxFormula) }, item.label)));
  const result = h('output', { class: 'calc-value', 'aria-live': 'polite' });
  const message = h('p', { class: 'sub calc-message' });
  const tableBody = h('tbody');
  const table = h('table', { class: 'pr-table calc-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'От максимума'), h('th', { scope: 'col' }, 'Вес'))), tableBody);
  function calculate() {
    input.weight = weight.value;
    input.reps = reps.value;
    const weightText = input.weight.trim();
    const repsText = input.reps.trim();
    const kg = num(weightText);
    const count = Number(repsText);
    const validWeight = /^\d+(?:[.,]\d+)?$/.test(weightText) && kg > 0;
    const validReps = /^\d+$/.test(repsText) && count >= 1 && count <= 36;
    const maximum = validWeight && validReps ? est1RM(kg, count, formula.value) : 0;
    weight.setAttribute('aria-invalid', String(!!weightText && !validWeight));
    reps.setAttribute('aria-invalid', String(!!repsText && !validReps));
    result.textContent = maximum ? kilos(maximum) : '—';
    message.textContent = weightText && !validWeight ? 'Введи вес больше нуля.' :
      repsText && !validReps ? 'Введи целое число повторов от 1 до 36.' :
      maximum ? (count > 10 ? 'При большом числе повторов оценка менее точна.' : '') : 'Введи вес и количество повторов.';
    table.hidden = !maximum;
    tableBody.replaceChildren(...(maximum ? percentages.map(percent => h('tr', null,
      h('td', null, percent + '%'), h('td', null, kilos(maximum * percent / 100)))) : []));
  }
  weight.addEventListener('input', calculate);
  reps.addEventListener('input', calculate);
  formula.addEventListener('change', () => { input.formula = formula.value; calculate(); });
  root.append(h('div', { class: 'card calc-card' },
    choiceField('Формула 1ПМ', formula),
    h('div', { class: 'calc-fields' },
      h('label', { class: 'field' }, h('span', null, 'Вес, кг'), weight),
      h('label', { class: 'field' }, h('span', null, 'Повторы'), reps)),
    h('div', { class: 'calc-result' }, h('span', null, 'Расчётный максимум'), result), message, table));
  calculate();
}
