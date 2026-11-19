// Данные: экспорт, импорт, защита от потери, очистка.
import { h, toast, dialog, confirmDialog, todayStr, fmtDate } from '../util.js';
import { S, buildBackup, markBackupDone, parseBackup, applyBackup, wipeAll } from '../store.js';
import { daysSinceBackup } from './home.js';

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
  if (mode === 'replace' && !(await confirmDialog('Все текущие данные на этом устройстве будут удалены и заменены данными из файла. Продолжить?', 'Заменить', true))) return;
  try { await applyBackup(parsed, mode); toast('Данные загружены'); rerender(); } catch (e) { console.error(e); toast('Ошибка импорта: ничего не изменено'); }
}

export function renderData(root, rerender) {
  root.append(h('h1', null, 'Данные'));
  const d = daysSinceBackup();
  root.append(h('div', { class: 'banner' + (d !== null && d < 14 ? ' ok' : '') },
    h('p', null, d === null
      ? 'Резервная копия ещё не делалась. Все данные лежат только в памяти этого iPhone: если удалить приложение или сбросить данные Safari, они пропадут.'
      : `Последняя копия: ${fmtDate(S.lastBackup.slice(0, 10))}${d === 0 ? ' (сегодня)' : `, ${d} дн. назад`}. Делайте копию хотя бы раз в 2 недели.`)));

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

  const persistEl = h('p', { class: 'sub' }, '');
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { persistEl.textContent = p ? 'Защита хранилища от автоочистки: включена.' : 'Защита хранилища от автоочистки: не включена. Резервные копии особенно важны.'; });
  }
  root.append(h('h2', null, 'О приложении'),
    h('div', { class: 'card' },
      h('p', { style: 'margin-top:0' }, `Сейчас записей: тренировок — ${S.workouts.length}, замеров — ${S.measurements.length}.`),
      persistEl,
      h('p', { class: 'sub', style: 'margin-bottom:0' }, 'Синхронизации между устройствами нет: данные есть только на том устройстве, где вы их ввели. Приложение работает без интернета.')));

  root.append(h('h2', null, 'Опасная зона'),
    h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
      if (!(await confirmDialog('Удалить ВСЕ тренировки и замеры на этом устройстве? Это нельзя отменить. Сначала сохраните резервную копию.', 'Удалить всё', true))) return;
      if (!(await confirmDialog('Точно удалить все данные?', 'Да, удалить', true))) return;
      await wipeAll(); toast('Все данные удалены'); rerender();
    } }, 'Удалить все данные'));
}
