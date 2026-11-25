// Общие мелкие функции: создание элементов, даты, числа, окна, уведомления.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Keep form validation and change events on the select, with an in-page picker.
export function choiceField(label, select, { className = '' } = {}) {
  select.hidden = true;
  const value = h('span');
  const summary = h('summary', { class: 'choice-option' }, value, h('span', { class: 'choice-arrow', 'aria-hidden': 'true' }));
  const buttons = Array.from(select.options, option => option.disabled ? null : h('button', {
    class: 'choice-option', type: 'button', onclick: () => {
      select.value = option.value;
      details.open = false;
      summary.focus({ preventScroll: true });
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
  }, option.textContent));
  const details = h('details', { class: 'choice', name: 'gym-tracker-choice' }, summary,
    h('div', { class: 'choice-options', role: 'group', 'aria-label': label }, buttons));
  function refresh() {
    value.textContent = select.selectedOptions[0]?.textContent || 'Выберите вариант';
    summary.setAttribute('aria-label', label + ': ' + value.textContent);
    buttons.forEach((button, index) => button?.setAttribute('aria-pressed', String(index === select.selectedIndex)));
  }
  select.addEventListener('change', refresh);
  select.addEventListener('choice-refresh', refresh);
  select.addEventListener('invalid', event => {
    event.preventDefault();
    details.open = true;
    summary.focus();
  });
  details.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !details.open) return;
    event.stopPropagation();
    details.open = false;
    summary.focus();
  });
  refresh();
  return h('div', { class: ('choice-field ' + className).trim() }, h('span', null, label), select, details);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const pad = (n) => String(n).padStart(2, '0');

export function dateToStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayStr() {
  return dateToStr(new Date());
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(s) {
  return parseDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtDay(s) {
  return parseDate(s).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function fmtShort(s) {
  return parseDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDate(s).getTime());
}

export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// "82,5" и "82.5" -> 82.5; пусто или мусор -> null
export function num(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
export function fmtNum(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}
export function fmtVolume(kg) {
  if (kg >= 10000) return fmtNum(Math.round(kg / 100) / 10) + ' т';
  return fmtNum(Math.round(kg)) + ' кг';
}

// ---------- уведомление ----------
let toastTimer;
export function toast(msg, { top = false } = {}) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('toast-top', top);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- окна ----------
let openSheets = 0;
export function sheet({ title, full = false, beforeClose, onClose }) {
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть' }, '✕');
  const head = h('div', { class: 'sheet-head' }, h('h2', null, title || ''), closeBtn);
  const box = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true' }, head, body);
  const bg = h('div', { class: 'sheet-bg' }, box);
  let closed = false;
  const api = {
    body, head, box,
    setTitle(t) { head.querySelector('h2').textContent = t; },
    async close() {
      if (closed || beforeClose?.() === false) return false;
      closed = true;
      try {
        if (onClose && (await onClose()) === false) {
          closed = false;
          return false;
        }
      } catch (e) { console.error(e); }
      bg.remove();
      openSheets--;
      if (openSheets <= 0) { openSheets = 0; document.body.classList.remove('noscroll'); }
      return true;
    },
  };
  closeBtn.addEventListener('click', () => api.close());
  bg.addEventListener('click', (e) => { if (e.target === bg && !full) api.close(); });
  document.body.append(bg);
  openSheets++;
  document.body.classList.add('noscroll');
  return api;
}

// Диалог с вопросом и кнопками. buttons: [{label, value, kind}], возвращает value выбранной кнопки (или null).
export function dialog(message, buttons, title) {
  return new Promise((resolve) => {
    const bg = h('div', { class: 'sheet-bg center' });
    const box = h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      title ? h('h3', null, title) : null,
      h('p', null, message),
      h('div', { class: 'dialog-btns' },
        buttons.map((b) => h('button', {
          type: 'button', class: 'btn ' + (b.kind || ''),
          onclick: () => { bg.remove(); resolve(b.value); },
        }, b.label))));
    bg.append(box);
    document.body.append(bg);
  });
}
export function confirmDialog(message, okLabel = 'Да', danger = false, title) {
  return dialog(message, [
    { label: 'Отмена', value: false, kind: 'ghost' },
    { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
  ], title);
}
