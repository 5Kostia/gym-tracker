// Данные: экспорт, импорт, защита от потери, очистка.
import { h, choiceField, toast, dialog, confirmDialog, todayStr } from '../util.js';
import { S, buildBackup, markBackupDone, parseBackup, applyBackup } from '../store.js';
import { THEMES, saveTheme } from '../theme.js';
import { account, login, logout, migrateGuest, reconnect, errorMessage } from '../account.js';

let updateAccountPanel;
window.addEventListener('gym-account', () => updateAccountPanel?.());

function accountPanel() {
  const card = h('section', { class: 'card account-card', 'aria-label': 'Облачное сохранение' });
  const title = h('strong', null, account.user?.email || 'Вход через Google');
  const state = h('p', { class: 'sub', role: 'status' });
  const action = (label, fn, primary = false) => h('button', {
    class: 'btn block' + (primary ? ' primary' : ''), type: 'button',
    onclick: async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await fn(); } catch (error) { toast(error.code ? errorMessage(error) : error.message); }
      finally { button.disabled = false; }
    },
  }, label);
  card.append(title, state);
  if (!account.user) {
    state.textContent = 'Войди, чтобы сохранять тренировки и замеры в облаке.';
    card.append(action('Войти через Google', login, true));
    return card;
  }
  const transfer = action('Перенести записи с устройства', async () => {
    if (await confirmDialog('Перенести записи гостевого дневника в ' + account.user.email +
      '? После переноса они будут доступны в этом аккаунте.', 'Перенести')) await migrateGuest();
  }, true);
  const retry = action('Подключиться снова', reconnect);
  const signout = action('Выйти из аккаунта', async () => {
    if (await confirmDialog('Выйти из ' + account.user.email +
      '? Если есть неотправленные изменения, они дождутся следующего входа в этот аккаунт на этом устройстве.', 'Выйти')) await logout();
  });
  card.append(transfer, retry, signout);
  function update() {
    state.textContent = account.message || 'Подключение к облаку…';
    transfer.hidden = !account.guestCount;
    transfer.disabled = !account.ready;
    retry.hidden = account.ready || !navigator.onLine;
  }
  update();
  // Only the current panel receives updates, so a status change never resets a form.
  updateAccountPanel = () => { if (card.isConnected) update(); };
  return card;
}

function makeFile() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const name = `gym-tracker-${todayStr()}.json`;
  return { json, name, file: new File([json], name, { type: 'application/json' }) };
}

async function shareBackup(rerender) {
  const { file, name } = makeFile();
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      await markBackupDone();
      toast('Копия сохранена');
      rerender();
    } catch (e) {
      if (e && e.name === 'AbortError') return; // пользователь закрыл меню
      console.error(e);
      toast('Не удалось открыть меню «Поделиться». Попробуйте «Скачать файл».');
    }
  } else {
    downloadBackup(rerender);
  }
}

function downloadBackup(rerender) {
  const { json, name } = makeFile();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  markBackupDone().then(() => { toast('Файл скачан'); rerender(); });
}

async function importFile(file, rerender) {
  let parsed;
  try { parsed = parseBackup(await file.text()); } catch (e) { toast(e.message || 'Не удалось прочитать файл'); return; }
  const info = `В файле: тренировок — ${parsed.workouts.length}, замеров — ${parsed.measurements.length}.`;
  const mode = await dialog(info + ' Как загрузить?', [
    { label: 'Добавить к текущим данным', value: 'merge', kind: 'primary' },
    { label: 'Заменить все данные', value: 'replace', kind: 'danger' },
    { label: 'Отмена', value: null, kind: 'ghost' },
  ], 'Импорт копии');
  if (!mode) return;
  if (mode === 'replace' && account.user && !account.ready) { toast('Для замены данных аккаунта дождись соединения с облаком'); return; }
  const target = account.user ? 'в аккаунте ' + account.user.email : 'на этом устройстве';
  if (mode === 'replace' && !(await confirmDialog('Заменить текущие данные ' + target + ' данными из файла?', 'Заменить', true))) return;
  try { await applyBackup(parsed, mode); toast('Данные загружены'); rerender(); } catch (e) { console.error(e); toast('Ошибка импорта: ничего не изменено'); }
}

export function renderData(root, rerender) {
  root.append(h('h1', null, 'Аккаунт'));
  root.append(accountPanel());
  const themeSelect = h('select', { onchange: (event) => {
    try { saveTheme(event.target.value); } catch { toast('Не удалось запомнить выбранную тему'); }
  } }, Array.from(THEMES, ([id, theme]) =>
    h('option', { value: id, selected: id === document.documentElement.dataset.theme }, theme.label)));
  root.append(h('h2', null, 'Оформление'),
    h('div', { class: 'card' }, choiceField('Тема', themeSelect, { className: 'theme-field' })));
  root.append(h('h2', null, 'Сохранить копию'),
    h('p', { class: 'sub' }, 'Создаётся файл JSON. Лучше всего сохранить его в «Файлы» (iCloud Drive) или отправить себе.'),
    h('button', { class: 'btn primary big block', type: 'button', onclick: () => shareBackup(rerender) }, 'Сохранить копию'),
    h('div', { style: 'height:8px' }),
    h('button', { class: 'btn block', type: 'button', onclick: () => downloadBackup(rerender) }, 'Скачать файл'));

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none',
    onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f, rerender); } });
  root.append(h('h2', null, 'Загрузить копию'),
    h('p', { class: 'sub' }, 'Выберите ранее сохранённый файл JSON. Перед загрузкой вы выберете: добавить или заменить.'),
    fileInput,
    h('button', { class: 'btn block', type: 'button', onclick: () => fileInput.click() }, 'Выбрать файл…'));

  root.append(h('h2', null, 'О приложении'),
    h('div', { class: 'card' },
      h('p', { style: 'margin:0' }, `Сейчас записей: тренировок — ${S.workouts.length}, замеров — ${S.measurements.length}.`)));
}
