// Точка входа: вкладки, перерисовка, регистрация офлайн-режима.
import { h, svg } from './util.js';
import { loadAll } from './store.js';
import { loadTheme } from './theme.js';
import { renderHome } from './views/home.js';
import { renderWorkouts } from './views/workouts.js';
import { renderMeasures } from './views/measures.js';
import { renderProgress } from './views/progress.js';
import { renderData } from './views/data.js';
import { renderCalculator } from './views/calculator.js';
import { prepareAccount, startSync } from './account.js';

const TABS = [
  { id: 'home', label: 'Главная', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M10 21v-6h4v6', render: renderHome },
  { id: 'workouts', label: 'Тренировки', render: renderWorkouts },
  { id: 'measures', label: 'Замеры', icon: 'M3 16.5 16.5 3 21 7.5 7.5 21zM6.5 13l2 2m1-5 2.4 2.4M12.5 7l2 2', render: renderMeasures },
  { id: 'progress', label: 'Прогресс', icon: 'M6 19v-6M12 19V9M18 19V5', render: renderProgress },
  { id: 'calculator', label: 'Калькулятор', icon: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h8M9 12h.01m6 0h.01M9 16h.01m6 0h.01', render: renderCalculator },
  { id: 'data', label: 'Аккаунт', icon: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-1a8 5 0 0 1 16 0v1', render: renderData },
];

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
let current = (location.hash || '').replace('#', '');
if (!TABS.some((t) => t.id === current)) current = 'home';

function goTab(id) {
  const changed = current !== id;
  current = id;
  history.replaceState(null, '', '#' + id);
  render(changed);
  window.scrollTo(0, 0);
}

function renderTabs() {
  const inner = h('div', { class: 'inner' }, TABS.map((t) => {
    const icon = t.icon
      ? svg('svg', { viewBox: '0 0 24 24' }, svg('path', { d: t.icon }))
      : h('span', { class: 'dumbbell-icon' });
    return h('button', { class: 'tab tab-' + t.id + (t.id === current ? ' active' : ''), type: 'button',
      'aria-current': t.id === current ? 'page' : null, onclick: () => goTab(t.id) },
      h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, icon), t.label);
  }));
  tabsEl.replaceChildren(inner);
}

function render(animate = false) {
  const y = window.scrollY;
  const root = h('div', { class: animate ? 'view-enter' : null });
  const tab = TABS.find((t) => t.id === current);
  try {
    tab.render(root, render, goTab);
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('div', { class: 'empty' }, 'Что-то пошло не так при показе этого раздела: ' + e.message));
  }
  app.replaceChildren(root);
  renderTabs();
  window.scrollTo(0, y);
}

async function start() {
  try {
    await prepareAccount();
    await loadAll();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'empty' },
      'Не удалось открыть хранилище данных. Если вы в приватном режиме Safari, откройте приложение в обычном режиме. ' + (e.message || '')));
    return;
  }
  render();
  window.addEventListener('gym-refresh', () => render());
  startSync();
  // попросить браузер не удалять данные автоматически
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Офлайн-режим не включился:', e));
  });
}

if (matchMedia('(pointer: coarse)').matches) {
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  const viewport = window.visualViewport;
  if (viewport) {
    let previousHeight = viewport.height;
    const updateViewport = () => {
      const root = document.documentElement;
      root.style.setProperty('--visible-height', `${viewport.height}px`);
      root.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
      const field = document.activeElement;
      if (viewport.height < previousHeight && field?.matches('.sheet-body input, .sheet-body textarea')) {
        field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      previousHeight = viewport.height;
    };
    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
  }
}

loadTheme();
start();
