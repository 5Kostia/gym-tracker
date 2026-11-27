// Главная: кнопка старта, сводка, календарь посещений.
import { h, todayStr, dateToStr, fmtDate, fmtVolume, setSwitchIndex, slidingContent } from '../util.js';
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

function calendar(today, updateSelectedDay) {
  const activeDays = new Set(S.workouts.map(w => w.date));
  const switchMode = mode => {
    if (ui.mode === mode) return;
    ui.mode = mode;
    update(mode === 'year' ? 1 : -1);
  };
  const modeBar = h('div', { class: 'seg two sliding-switch calendar-mode', role: 'group', 'aria-label': 'Вид календаря' },
    [['month', 'Месяц'], ['year', 'Год']].map(([mode, label]) => h('button', {
      type: 'button', onclick: () => switchMode(mode),
    }, label)));
  const shift = n => {
    const date = ui.mode === 'year' ? new Date(ui.y + n, ui.m, 1) : new Date(ui.y, ui.m + n, 1);
    ui.y = date.getFullYear();
    ui.m = date.getMonth();
    update(n);
  };
  const label = h('b', { 'aria-live': 'polite' });
  const prev = h('button', { class: 'icon-btn', type: 'button', onclick: () => shift(-1) }, '‹');
  const next = h('button', { class: 'icon-btn', type: 'button', onclick: () => shift(1) }, '›');
  const header = h('div', { class: 'cal-head' }, prev, label, next);
  const panel = h('div');
  let resize;

  function update(direction) {
    const animate = direction && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const height = animate ? panel.getBoundingClientRect().height : 0;
    resize?.cancel();
    panel.classList.remove('calendar-resizing');
    const annual = ui.mode === 'year';
    setSwitchIndex(modeBar, Number(annual));
    const { start, offset, dates } = monthDays(ui.y, ui.m);
    label.textContent = annual ? String(ui.y) : start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    prev.setAttribute('aria-label', annual ? 'Предыдущий год' : 'Предыдущий месяц');
    next.setAttribute('aria-label', annual ? 'Следующий год' : 'Следующий месяц');
    const content = annual ? yearGrid() : monthGrid(offset, dates);
    panel.replaceChildren(slidingContent(content, direction));
    if (animate) {
      const nextHeight = panel.getBoundingClientRect().height;
      if (nextHeight === height) return;
      panel.classList.add('calendar-resizing');
      resize = panel.animate([{ height: `${height}px` }, { height: `${nextHeight}px` }], {
        duration: 240, easing: 'cubic-bezier(.2, .75, .25, 1)',
      });
      resize.onfinish = () => panel.classList.remove('calendar-resizing');
    }
  }

  function yearGrid() {
    const grid = h('div', { class: 'year-calendar' },
      Array.from({ length: 12 }, (_, month) => {
        const days = monthDays(ui.y, month);
        const count = days.dates.filter(date => activeDays.has(date)).length;
        return h('button', {
          type: 'button', class: 'year-month' + (month === ui.m ? ' is-selected' : ''),
          'aria-label': `${monthName(days.start)} ${ui.y}, дней с тренировками: ${count}`,
          onclick: event => {
            const restoreFocus = event.currentTarget.matches(':focus-visible');
            ui.m = month;
            if (!days.dates.includes(ui.sel)) ui.sel = days.dates.includes(today) ? today : days.dates.find(date => activeDays.has(date)) || days.dates[0];
            updateSelectedDay();
            switchMode('month');
            if (restoreFocus) modeBar.firstElementChild.focus({ preventScroll: true });
          },
        },
        h('span', { class: 'year-month-label', 'aria-hidden': 'true' }, monthName(days.start, 'short'), h('span', null, count || '')),
        h('span', { class: 'year-days', 'aria-hidden': 'true' },
          Array.from({ length: days.offset }, () => h('span', { class: 'year-blank' })),
          days.dates.map(date => h('span', { class: [
            activeDays.has(date) ? 'has' : '', date === today ? 'today' : '', date > today ? 'future' : '',
          ].join(' ') }))));
      }));
    return [grid, h('p', { class: 'sub year-legend' }, h('span', { 'aria-hidden': 'true' }), 'День с тренировкой')];
  }

  function monthGrid(offset, dates) {
    return h('div', { class: 'cal' },
      ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => h('div', { class: 'dow' }, d)),
      Array.from({ length: offset }, () => h('span', { 'aria-hidden': 'true' })),
      dates.map((date, i) => h('button', {
        type: 'button', class: [activeDays.has(date) ? 'has' : '', date === today ? 'today' : '', date === ui.sel ? 'sel' : ''].join(' '),
        'aria-label': fmtDate(date) + (activeDays.has(date) ? ', была тренировка' : ''),
        onclick: event => {
          if (ui.sel === date) return;
          panel.querySelector('.sel')?.classList.remove('sel');
          event.currentTarget.classList.add('sel');
          ui.sel = date;
          updateSelectedDay();
        },
      }, i + 1)));
  }

  update();
  return h('div', { class: 'card' }, modeBar, header, panel);
}

export function renderHome(root, rerender) {
  const today = todayStr();
  if (ui.y === null) { const d = new Date(); ui.y = d.getFullYear(); ui.m = d.getMonth(); }
  if (!ui.sel) ui.sel = today;

  root.append(h('h1', { class: 'home-title' }, 'Gym Tracker'),
    h('p', { class: 'sub' }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })));

  root.append(h('button', { class: 'btn primary big block', type: 'button',
    onclick: () => openEditor({ date: ui.sel }, rerender) }, '＋ Добавить тренировку'));
  const selectedDate = h('p', { class: 'sub add-workout-date' });
  root.append(selectedDate);

  // сводка
  const monthPrefix = today.slice(0, 7);
  const inMonth = S.workouts.filter((w) => w.date.startsWith(monthPrefix));
  const monthDays = new Set(inMonth.map((w) => w.date)).size;
  const vol = inMonth.reduce((a, w) => a + workoutVolume(w), 0);
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, monthDays), h('span', null, 'дней в этом месяце')),
    h('div', { class: 'stat' }, h('b', null, vol ? fmtVolume(vol) : '0'), h('span', null, 'объём за месяц')),
    h('div', { class: 'stat' }, h('b', null, S.workouts.length), h('span', null, 'всего тренировок'))));

  const selectedDay = h('div');
  root.append(h('h2', null, 'Календарь'), calendar(today, updateSelectedDay), selectedDay);
  updateSelectedDay();

  function updateSelectedDay() {
    const date = fmtDate(ui.sel);
    selectedDate.hidden = ui.sel === today;
    selectedDate.textContent = `Дата новой тренировки — ${date}`;
    const dayW = workoutsOn(ui.sel);
    selectedDay.replaceChildren(h('h2', null, date));
    if (dayW.length) {
      dayW.forEach((w) => selectedDay.append(workoutCard(w, (x) => openEditor({ id: x.id }, rerender))));
      selectedDay.append(h('button', { class: 'btn block', type: 'button',
        onclick: () => openEditor({ id: dayW[0].id }, rerender) }, 'Продолжить тренировку'));
    } else {
      selectedDay.append(h('div', { class: 'empty small' }, 'В этот день тренировок нет'));
    }
  }
}
