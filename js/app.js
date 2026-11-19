// Точка входа: вкладки, перерисовка, регистрация офлайн-режима.
import { h, svg, toast } from './util.js';
import { loadAll } from './store.js';
import { renderHome } from './views/home.js';
import { renderWorkouts } from './views/workouts.js';
import { renderMeasures } from './views/measures.js';
import { renderProgress } from './views/progress.js';
import { renderData } from './views/data.js';

const TABS = [
  { id: 'home', label: 'Главная', icon: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', render: renderHome },
  { id: 'workouts', label: 'Тренировки', icon: 'M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12', render: renderWorkouts },
  { id: 'measures', label: 'Замеры', icon: 'M3 17l4-4 3 3 5-6 6 7M3 21h18', render: renderMeasures },
  { id: 'progress', label: 'Прогресс', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', render: renderProgress },
  { id: 'data', label: 'Данные', icon: 'M12 4v11M7 10l5 5 5-5M4 20h16', render: renderData },
];

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
let current = (location.hash || '').replace('#', '');
if (!TABS.some((t) => t.id === current)) current = 'home';

function goTab(id) {
  current = id;
  history.replaceState(null, '', '#' + id);
  render();
  window.scrollTo(0, 0);
}

function renderTabs() {
  const inner = h('div', { class: 'inner' }, TABS.map((t) => {
    const icon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, svg('path', { d: t.icon }));
    return h('button', { class: 'tab' + (t.id === current ? ' active' : ''), type: 'button', 'aria-current': t.id === current ? 'page' : null,
      onclick: () => goTab(t.id) }, icon, t.label);
  }));
  tabsEl.replaceChildren(inner);
}

function render() {
  const y = window.scrollY;
  const root = h('div');
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
    await loadAll();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'empty' },
      'Не удалось открыть хранилище данных. Если вы в приватном режиме Safari, откройте приложение в обычном режиме. ' + (e.message || '')));
    return;
  }
  render();
  // попросить браузер не удалять данные автоматически
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Офлайн-режим не включился:', e));
  });
}

start();
