// Главная: кнопка старта, сводка, календарь посещений.
import { h, todayStr, dateToStr, fmtDate, fmtVolume } from '../util.js';
import { S, workoutsOn, workoutVolume } from '../store.js';
import { openEditor, workoutCard } from './workouts.js';

const ui = { y: null, m: null, sel: null, mode: 'month' };
const monthName = (date, month = 'long') => date.toLocaleDateString('ru-RU', { month });

function monthDays(year, month) {
  const start = new Date(year, month, 1);
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return { start, offset, dates: Array.from({ length: count }, (_, i) => dateToStr(new Date(year, month, i + 1))) };
}

function calendar(today, rerender) {
  const annual = ui.mode === 'year';
  const activeDays = new Set(S.workouts.map(w => w.date));
  const switchMode = mode => { ui.mode = mode; rerender(); };
  const modeBar = h('div', { class: 'seg two calendar-mode', role: 'group', 'aria-label': 'Вид календаря' },
    [['month', 'Месяц'], ['year', 'Год']].map(([mode, label]) => h('button', {
      type: 'button', class: ui.mode === mode ? 'on' : '', 'aria-pressed': String(ui.mode === mode),
      onclick: () => switchMode(mode),
    }, label)));
  const shift = n => {
    const date = annual ? new Date(ui.y + n, ui.m, 1) : new Date(ui.y, ui.m + n, 1);
    ui.y = date.getFullYear();
    ui.m = date.getMonth();
    rerender();
  };
  const { start, offset, dates } = monthDays(ui.y, ui.m);
  const title = annual ? String(ui.y) : start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const header = h('div', { class: 'cal-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': annual ? 'Предыдущий год' : 'Предыдущий месяц', onclick: () => shift(-1) }, '‹'),
    h('b', { 'aria-live': 'polite' }, title),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': annual ? 'Следующий год' : 'Следующий месяц', onclick: () => shift(1) }, '›'));
  const grid = annual ? h('div', { class: 'year-calendar' },
    Array.from({ length: 12 }, (_, month) => {
      const days = monthDays(ui.y, month);
      const count = days.dates.filter(date => activeDays.has(date)).length;
      return h('button', {
        type: 'button', class: 'year-month' + (month === ui.m ? ' is-selected' : ''),
        'aria-label': `${monthName(days.start)} ${ui.y}, дней с тренировками: ${count}`,
        onclick: () => {
          ui.m = month;
          if (!days.dates.includes(ui.sel)) ui.sel = days.dates.includes(today) ? today : days.dates.find(date => activeDays.has(date)) || days.dates[0];
          switchMode('month');
        },
      },
      h('span', { class: 'year-month-label', 'aria-hidden': 'true' }, monthName(days.start, 'short'), h('span', null, count || '')),
      h('span', { class: 'year-days', 'aria-hidden': 'true' },
        Array.from({ length: days.offset }, () => h('span', { class: 'year-blank' })),
        days.dates.map(date => h('span', { class: [
          activeDays.has(date) ? 'has' : '', date === today ? 'today' : '', date > today ? 'future' : '',
        ].join(' ') }))));
    })) : h('div', { class: 'cal' },
    ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => h('div', { class: 'dow' }, d)),
    Array.from({ length: offset }, () => h('span', { 'aria-hidden': 'true' })),
    dates.map((date, i) => h('button', {
      type: 'button', class: [activeDays.has(date) ? 'has' : '', date === today ? 'today' : '', date === ui.sel ? 'sel' : ''].join(' '),
      'aria-label': fmtDate(date) + (activeDays.has(date) ? ', была тренировка' : ''),
      onclick: () => { ui.sel = date; rerender(); },
    }, i + 1)));
  return h('div', { class: 'card' }, modeBar, header, grid,
    annual ? h('p', { class: 'sub year-legend' }, h('span', { 'aria-hidden': 'true' }), 'День с тренировкой') : null);
}

export function renderHome(root, rerender) {
  const today = todayStr();
  if (ui.y === null) { const d = new Date(); ui.y = d.getFullYear(); ui.m = d.getMonth(); }
  if (!ui.sel) ui.sel = today;

  root.append(h('h1', null, 'Gym Tracker'),
    h('p', { class: 'sub' }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })));

  root.append(h('button', { class: 'btn primary big block', type: 'button',
    onclick: () => openEditor({ date: ui.sel }, rerender) }, '＋ Добавить тренировку'));
  if (ui.sel !== today) root.append(h('p', { class: 'sub add-workout-date' }, `Дата новой тренировки — ${fmtDate(ui.sel)}`));

  // сводка
  const monthPrefix = today.slice(0, 7);
  const inMonth = S.workouts.filter((w) => w.date.startsWith(monthPrefix));
  const monthDays = new Set(inMonth.map((w) => w.date)).size;
  const vol = inMonth.reduce((a, w) => a + workoutVolume(w), 0);
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, monthDays), h('span', null, 'дней в этом месяце')),
    h('div', { class: 'stat' }, h('b', null, vol ? fmtVolume(vol) : '0'), h('span', null, 'объём за месяц')),
    h('div', { class: 'stat' }, h('b', null, S.workouts.length), h('span', null, 'всего тренировок'))));

  root.append(h('h2', null, 'Календарь'), calendar(today, rerender));

  // выбранный день
  const dayW = workoutsOn(ui.sel);
  root.append(h('h2', null, fmtDate(ui.sel)));
  if (dayW.length) {
    dayW.forEach((w) => root.append(workoutCard(w, (x) => openEditor({ id: x.id }, rerender))));
    root.append(h('button', { class: 'btn block', type: 'button',
      onclick: () => openEditor({ id: dayW[0].id }, rerender) }, 'Продолжить тренировку'));
  } else {
    root.append(h('div', { class: 'empty small' }, 'В этот день тренировок нет'));
  }
}
