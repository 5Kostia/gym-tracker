const KEY = 'gym-tracker-theme';

export const THEMES = new Map([
  ['blue', { label: 'Синяя', color: '#0c1320' }],
  ['black', { label: 'Чёрная', color: '#070707' }],
  ['red', { label: 'Чёрно-красная', color: '#080708' }],
  ['green', { label: 'Зелёный неон', color: '#080a08' }],
  ['purple', { label: 'Пурпурный графит', color: '#100a15' }],
  ['blueberry', { label: 'Черничная ночь', color: '#0e0c1d' }],
]);

export function applyTheme(id) {
  const theme = THEMES.get(id);
  if (!theme) return;
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]').content = theme.color;
}

export function loadTheme() {
  try { applyTheme(localStorage.getItem(KEY)); } catch { /* Используется синяя тема. */ }
}

export function saveTheme(id) {
  if (!THEMES.has(id)) return;
  applyTheme(id);
  localStorage.setItem(KEY, id);
}
