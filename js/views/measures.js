// Замеры тела: ввод нескольких значений сразу, история по каждому типу.
import { h, sheet, confirmDialog, toast, todayStr, fmtDate, fmtShort, fmtNum, num, uid } from '../util.js';
import { S, saveMeasurement, deleteMeasurement, measurementsOfType, addMeasureType, removeMeasureType, updateMeasureType } from '../store.js';
import { lineChart } from '../charts.js';

export function renderMeasures(root, rerender) {
  root.append(h('h1', null, 'Замеры'), h('p', { class: 'sub' }, 'Вес и обхваты тела. Заполните только то, что измеряли сегодня.'));

  const dateInput = h('input', { type: 'date', value: todayStr(), 'aria-label': 'Дата замера' });
  const inputs = new Map();
  const rows = S.measureTypes.map((t) => {
    const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: t.unit || '—', autocomplete: 'off', 'aria-label': t.name });
    inputs.set(t.name, inp);
    const last = measurementsOfType(t.name).slice(-1)[0];
    return h('div', { class: 'm-row' },
      h('div', null, h('div', null, t.name), last ? h('div', { class: 'unit' }, `сейчас ${fmtNum(last.value)} ${t.unit}`) : null),
      inp);
  });

  root.append(h('div', { class: 'card' },
    h('label', { class: 'field' }, h('span', null, 'Дата'), dateInput),
    rows,
    h('div', { style: 'margin-top:10px' },
      h('button', { class: 'btn primary block', type: 'button', onclick: async () => {
        const date = dateInput.value;
        if (!date) { toast('Выберите дату'); return; }
        let n = 0, bad = false;
        for (const [type, inp] of inputs) {
          if (!inp.value.trim()) continue;
          const v = num(inp.value);
          if (v === null || v <= 0) { bad = true; inp.style.borderColor = 'var(--danger)'; continue; }
          await saveMeasurement({ id: uid(), date, type, value: v, createdAt: Date.now() });
          n++;
        }
        if (bad) { toast('Проверьте поля, выделенные красным'); if (!n) return; }
        if (!n) { toast('Введите хотя бы одно значение'); return; }
        toast(n === 1 ? 'Замер сохранён' : `Сохранено замеров: ${n}`);
        rerender();
      } }, 'Сохранить замеры')),
    h('div', { class: 'custom-item-actions' },
      h('button', { class: 'btn small block', type: 'button', onclick: () => addTypeDialog(rerender) }, '＋ Своё измерение'),
      h('button', { class: 'btn small block', type: 'button', onclick: () => openCustomMeasurements(rerender) }, 'Мои измерения'))));

  root.append(h('h2', null, 'История'));
  const list = h('div', { class: 'card' });
  for (const t of S.measureTypes) {
    const arr = measurementsOfType(t.name);
    const last = arr[arr.length - 1], prev = arr[arr.length - 2];
    let delta = null;
    if (last && prev) {
      const d = Math.round((last.value - prev.value) * 100) / 100;
      delta = h('span', { class: 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') }, (d > 0 ? '+' : '') + fmtNum(d));
    }
    list.append(h('button', { class: 'list-row', type: 'button', onclick: () => openType(t, rerender) },
      h('div', { class: 'grow' }, h('div', null, t.name), h('div', { class: 'muted num', style: 'font-size:13px' }, last ? fmtShort(last.date) : 'нет данных')),
      h('div', { style: 'text-align:right' }, h('div', { class: 'num', style: 'font-weight:700' }, last ? `${fmtNum(last.value)} ${t.unit}` : '–'), delta)));
  }
  root.append(list);
}

function openCustomMeasurements(rerender) {
  const p = sheet({ title: 'Мои измерения' });
  const refresh = () => { rerender(); draw(); };
  function draw() {
    const types = S.measureTypes.filter(t => !t.builtin);
    p.body.replaceChildren(types.length
      ? h('div', { class: 'card' }, types.map(t =>
        h('button', { class: 'list-row', type: 'button', onclick: () => openType(t, refresh) },
          h('span', null, t.name), h('span', { class: 'muted' }, t.unit))))
      : h('div', { class: 'empty small' }, 'Своих измерений пока нет'));
  }
  draw();
}

function addTypeDialog(rerender, existing) {
  const p = sheet({ title: existing ? 'Изменить измерение' : 'Новое измерение' });
  const name = h('input', { type: 'text', placeholder: 'Например, Шея', value: existing?.name || '', autocomplete: 'off', maxlength: '40' });
  const unit = h('input', { type: 'text', placeholder: 'см', value: existing ? existing.unit || '' : 'см', maxlength: '10' });
  const controls = h('div', { class: 'custom-item-actions' },
    h('label', { class: 'field' }, h('span', null, 'Название'), name),
    h('label', { class: 'field' }, h('span', null, 'Единица измерения'), unit),
    existing && measurementsOfType(existing.name).length ? h('p', { class: 'sub' }, 'Новая единица применяется и к истории. Числа сохраняются как введены.') : null,
    h('button', { class: 'btn primary block', type: 'button', onclick: async ({ currentTarget }) => {
      currentTarget.disabled = true;
      try {
        const ok = existing ? await updateMeasureType(existing.name, name.value, unit.value) : await addMeasureType(name.value, unit.value);
        if (!ok) { toast(name.value.trim() ? 'Такое измерение уже есть' : 'Введите название'); return; }
        toast(existing ? 'Измерение обновлено' : 'Измерение добавлено');
        await p.close();
        await rerender();
      } catch (error) {
        console.error(error);
        toast('Не удалось сохранить измерение');
      } finally { currentTarget.disabled = false; }
    } }, existing ? 'Сохранить изменения' : 'Добавить'));
  p.body.append(controls);
  setTimeout(() => name.focus(), 80);
}

function openType(t, rerender) {
  const p = sheet({ title: t.name, onClose: () => rerender() });
  const draw = () => {
    p.body.replaceChildren();
    const arr = measurementsOfType(t.name);
    if (!t.builtin) {
      p.body.append(h('div', { class: 'custom-item-actions' },
        h('button', { class: 'btn block', type: 'button', onclick: () => addTypeDialog(p.close, t) }, 'Изменить измерение'),
        h('button', { class: 'btn danger block', type: 'button', onclick: async ({ currentTarget }) => {
          if (!(await confirmDialog(`Удалить измерение «${t.name}» вместе со всеми его записями?`, 'Удалить', true))) return;
          currentTarget.disabled = true;
          try {
            await removeMeasureType(t.name);
            toast('Измерение удалено');
            await p.close();
          } catch (error) {
            console.error(error);
            toast('Не удалось удалить измерение');
          } finally { currentTarget.disabled = false; }
        } }, 'Удалить измерение')));
    }
    if (!arr.length) {
      p.body.append(h('div', { class: 'empty small' }, 'Замеров пока нет'));
      return;
    }
    p.body.append(lineChart(arr.map(m => ({ x: m.date, y: m.value })), { unit: t.unit }),
      h('div', { class: 'card' }, [...arr].reverse().map(m =>
        h('button', { class: 'list-row', type: 'button', onclick: () => editEntry(m, t, draw) },
          h('span', null, fmtDate(m.date)), h('b', { class: 'num' }, `${fmtNum(m.value)} ${t.unit}`)))));
  };
  draw();
}

function editEntry(m, t, redraw) {
  const p = sheet({ title: 'Запись' });
  const val = h('input', { type: 'text', inputmode: 'decimal', value: String(m.value).replace('.', ',') });
  const date = h('input', { type: 'date', value: m.date });
  p.body.append(
    h('label', { class: 'field' }, h('span', null, `Значение, ${t.unit}`), val),
    h('label', { class: 'field' }, h('span', null, 'Дата'), date),
    h('div', { class: 'row' },
      h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog('Удалить эту запись?', 'Удалить', true))) return;
        await deleteMeasurement(m.id); p.close(); redraw();
      } }, 'Удалить'),
      h('button', { class: 'btn primary grow', type: 'button', onclick: async () => {
        const v = num(val.value);
        if (v === null || v <= 0 || !date.value) { toast('Проверьте значение и дату'); return; }
        await saveMeasurement({ ...m, value: v, date: date.value });
        p.close(); redraw();
      } }, 'Сохранить')));
}
