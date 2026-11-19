// Главная: кнопка старта, сводка, календарь посещений.
import { h, todayStr, dateToStr, parseDate, fmtDate, fmtVolume, fmtNum } from '../util.js';
import { S, workoutsOn, workoutVolume } from '../store.js';
import { openEditor, workoutCard } from './workouts.js';

const ui = { y: null, m: null, sel: null };

export function daysSinceBackup() {
  if (!S.lastBackup) return null;
  return Math.floor((Date.now() - new Date(S.lastBackup).getTime()) / 86400000);
}

export function renderHome(root, rerender, goTab) {
  const today = todayStr();
  if (ui.y === null) { const d = new Date(); ui.y = d.getFullYear(); ui.m = d.getMonth(); }
  if (!ui.sel) ui.sel = today;

  root.append(h('h1', null, 'Gym Tracker'),
    h('p', { class: 'sub' }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })));

  // напоминание о резервной копии
  if (S.workouts.length || S.measurements.length) {
    const d = daysSinceBackup();
    if (d === null || d >= 14) {
      root.append(h('div', { class: 'banner' },
        h('p', null, d === null
          ? 'Данные хранятся только на этом iPhone. Сделайте резервную копию, чтобы не потерять их.'
          : `Последняя резервная копия была ${d} дн. назад. Пора сохранить новую.`),
        h('button', { class: 'btn small', type: 'button', onclick: () => goTab('data') }, 'Открыть «Данные»')));
    }
  }

  const todays = workoutsOn(today);
  root.append(h('button', { class: 'btn primary big block', type: 'button',
    onclick: () => openEditor(todays.length ? { id: todays[0].id } : { date: today }, rerender) },
    todays.length ? 'Продолжить тренировку' : '＋ Начать тренировку'));

  // сводка
  const monthPrefix = today.slice(0, 7);
  const inMonth = S.workouts.filter((w) => w.date.startsWith(monthPrefix));
  const monthDays = new Set(inMonth.map((w) => w.date)).size;
  const vol = inMonth.reduce((a, w) => a + workoutVolume(w), 0);
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, monthDays), h('span', null, 'дней в этом месяце')),
    h('div', { class: 'stat' }, h('b', null, vol ? fmtVolume(vol) : '0'), h('span', null, 'объём за месяц')),
    h('div', { class: 'stat' }, h('b', null, S.workouts.length), h('span', null, 'всего тренировок'))));

  // календарь
  const first = new Date(ui.y, ui.m, 1);
  const daysInMonth = new Date(ui.y, ui.m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // понедельник — первый
  const has = new Set(S.workouts.map((w) => w.date));
  const grid = h('div', { class: 'cal' }, ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => h('div', { class: 'dow' }, d)));
  for (let i = 0; i < offset; i++) grid.append(h('button', { class: 'blank', type: 'button', tabindex: '-1', 'aria-hidden': 'true' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateToStr(new Date(ui.y, ui.m, d));
    const cls = [has.has(ds) ? 'has' : '', ds === today ? 'today' : '', ds === ui.sel ? 'sel' : ''].join(' ');
    grid.append(h('button', { type: 'button', class: cls, 'aria-label': fmtDate(ds) + (has.has(ds) ? ', была тренировка' : ''),
      onclick: () => { ui.sel = ds; rerender(); } }, d));
  }
  const shift = (n) => { const d = new Date(ui.y, ui.m + n, 1); ui.y = d.getFullYear(); ui.m = d.getMonth(); rerender(); };
  root.append(h('h2', null, 'Календарь'),
    h('div', { class: 'card' },
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий месяц', onclick: () => shift(-1) }, '‹'),
        h('b', null, first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий месяц', onclick: () => shift(1) }, '›')),
      grid));

  // выбранный день
  const dayW = workoutsOn(ui.sel);
  root.append(h('h2', null, fmtDate(ui.sel)));
  if (dayW.length) dayW.forEach((w) => root.append(workoutCard(w, (x) => openEditor({ id: x.id }, rerender))));
  else root.append(h('div', { class: 'empty small' }, 'В этот день тренировок нет'));
  root.append(h('button', { class: 'btn block', type: 'button', onclick: () => openEditor({ date: ui.sel }, rerender) },
    dayW.length ? '＋ Ещё одна тренировка на эту дату' : '＋ Добавить тренировку на эту дату'));
}
