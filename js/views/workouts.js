// Список тренировок и редактор тренировки.
import { h, sheet, dialog, confirmDialog, toast, todayStr, fmtDate, fmtDay, fmtNum, fmtVolume, parseDate, num } from '../util.js';
import {
  S, FEELS, newWorkout, saveWorkout, deleteWorkout, workoutVolume, countSets, allExerciseNames,
  recentExerciseNames, addCustomExercise, lastSetsFor, loadAll,
} from '../store.js';

// Карточка тренировки (используется в истории и на главной)
export function workoutCard(w, onOpen) {
  const exNames = w.exercises.map((e) => `${e.name} · ${e.sets.length}`);
  const vol = workoutVolume(w);
  return h('button', { class: 'card wcard', type: 'button', onclick: () => onOpen(w) },
    h('div', { class: 'top' },
      h('span', { class: 'date' }, fmtDay(w.date)),
      w.feel ? h('span', { class: 'badge ' + w.feel }, FEELS[w.feel]) : null),
    exNames.length
      ? exNames.slice(0, 4).map((t) => h('div', { class: 'ex' }, t))
      : h('div', { class: 'ex' }, 'Без упражнений'),
    exNames.length > 4 ? h('div', { class: 'ex' }, `… и ещё ${exNames.length - 4}`) : null,
    h('div', { class: 'meta num' }, `${countSets(w)} подходов` + (vol ? ` · объём ${fmtVolume(vol)}` : '')),
    w.notes ? h('div', { class: 'meta' }, '📝 ' + (w.notes.length > 80 ? w.notes.slice(0, 80) + '…' : w.notes)) : null);
}

export function renderWorkouts(root, rerender) {
  root.append(
    h('h1', null, 'Тренировки'),
    h('p', { class: 'sub' }, 'История всех тренировок. Нажмите на карточку, чтобы изменить или удалить.'),
    h('button', { class: 'btn primary big block', type: 'button', onclick: () => openEditor({ date: todayStr() }, rerender) }, '＋ Новая тренировка'));

  if (!S.workouts.length) {
    root.append(h('div', { class: 'empty' }, 'Пока нет ни одной тренировки. Нажмите «Новая тренировка» и добавьте первое упражнение.'));
    return;
  }
  let lastMonth = '';
  for (const w of S.workouts) {
    const key = w.date.slice(0, 7);
    if (key !== lastMonth) {
      lastMonth = key;
      root.append(h('div', { class: 'month-title' }, parseDate(w.date).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })));
    }
    root.append(workoutCard(w, (x) => openEditor({ id: x.id }, rerender)));
  }
}

// ---------- редактор ----------
// params: { id } — открыть существующую, { date } — создать новую на эту дату
export function openEditor(params, onDone) {
  const existing = params.id ? S.workouts.find((x) => x.id === params.id) : null;
  const w = existing ? JSON.parse(JSON.stringify(existing)) : newWorkout(params.date || todayStr());
  let stored = !!existing;      // есть ли уже в базе
  let deleted = false;
  let timer = null;
  let saving = Promise.resolve();

  function hasContent() {
    return w.exercises.length > 0 || w.notes.trim() || w.feel;
  }
  function persistNow() {
    clearTimeout(timer);
    if (deleted) return saving;
    if (!stored && !hasContent()) return saving;
    stored = true;
    saving = saving.then(() => saveWorkout(JSON.parse(JSON.stringify(w)))).catch((e) => {
      console.error(e);
      toast('Не удалось сохранить: ' + (e.message || e));
    });
    return saving;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(persistNow, 350);
  }

  const sh = sheet({
    title: 'Тренировка', full: true,
    onClose: async () => { await persistNow(); await loadAll(); onDone && onDone(); },
  });
  const done = h('button', { class: 'btn primary small', type: 'button', onclick: () => sh.close() }, 'Готово');
  sh.head.insertBefore(done, sh.head.lastChild);

  const volEl = h('div', { class: 'vol num' });
  const listEl = h('div');
  const dateInput = h('input', { type: 'date', value: w.date, 'aria-label': 'Дата тренировки',
    onchange: (e) => { if (e.target.value) { w.date = e.target.value; updateTitle(); schedule(); renderList(); } } });
  function updateTitle() { sh.setTitle(fmtDay(w.date)); }
  function updateVol() {
    const v = workoutVolume(w);
    volEl.textContent = `Подходов: ${countSets(w)} · Объём: ${v ? fmtVolume(v) : '0 кг'}`;
  }

  function setRow(ex, s, i) {
    const mk = (key, ph, mode, cls) => h('input', {
      class: cls || '', type: 'text', inputmode: mode, placeholder: ph, value: s[key] || '', 'aria-label': ph,
      enterkeyhint: 'next', autocomplete: 'off',
      oninput: (e) => { s[key] = e.target.value; updateVol(); schedule(); },
    });
    return [
      h('div', { class: 'n' }, i + 1),
      mk('w', 'кг', 'decimal'),
      mk('r', 'повт', 'numeric'),
      mk('rpe', 'RPE', 'decimal', 'sm'),
      mk('rir', 'RIR', 'numeric', 'sm'),
      h('button', { class: 'icon-btn del', type: 'button', 'aria-label': 'Удалить подход',
        onclick: () => { ex.sets.splice(i, 1); updateVol(); schedule(); renderList(); } }, '✕'),
    ];
  }

  function exerciseCard(ex) {
    const last = lastSetsFor(ex.name, w.date, w.id);
    const hint = last
      ? 'В прошлый раз (' + fmtDay(last.date) + '): ' + last.sets.map((s) => `${s.w || '0'}×${s.r || '?'}`).join(', ')
      : 'Раньше это упражнение не выполнялось';
    return h('div', { class: 'ex-card' },
      h('div', { class: 'ex-head' },
        h('h3', null, ex.name),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Убрать упражнение',
          onclick: async () => {
            if (ex.sets.length && !(await confirmDialog(`Убрать «${ex.name}» из тренировки?`, 'Убрать', true))) return;
            w.exercises.splice(w.exercises.indexOf(ex), 1); updateVol(); schedule(); renderList();
          } }, '✕')),
      h('div', { class: 'hint' }, hint),
      h('div', { class: 'set-grid' },
        h('div', { class: 'h' }, '№'), h('div', { class: 'h' }, 'Вес, кг'), h('div', { class: 'h' }, 'Повторы'),
        h('div', { class: 'h' }, 'RPE'), h('div', { class: 'h' }, 'RIR'), h('div', null),
        ex.sets.map((s, i) => setRow(ex, s, i))),
      h('div', { style: 'margin-top:10px' },
        h('button', { class: 'btn small block', type: 'button',
          onclick: () => {
            const p = ex.sets[ex.sets.length - 1];
            ex.sets.push(p ? { w: p.w, r: p.r, rpe: '', rir: '' } : { w: '', r: '', rpe: '', rir: '' });
            updateVol(); schedule(); renderList();
            const inputs = listEl.querySelectorAll('.ex-card');
            const card = [...inputs].find((c) => c.querySelector('h3').textContent === ex.name);
            if (card) { const all = card.querySelectorAll('.set-grid input'); const el = all[all.length - 4]; el && el.focus({ preventScroll: false }); }
          } }, '＋ Подход')));
  }

  function renderList() {
    listEl.replaceChildren(...w.exercises.map(exerciseCard));
    if (!w.exercises.length) listEl.append(h('div', { class: 'empty small' }, 'Добавьте первое упражнение'));
  }

  function pickExercise() {
    const p = sheet({ title: 'Упражнение' });
    const search = h('input', { type: 'search', placeholder: 'Найти или создать упражнение', autocomplete: 'off', 'aria-label': 'Название упражнения' });
    const list = h('div', { class: 'pick-list' });
    function add(name) {
      name = name.trim().replace(/\s+/g, ' ');
      if (!name) return;
      addCustomExercise(name).catch(console.error);
      w.exercises.push({ name, sets: [{ w: '', r: '', rpe: '', rir: '' }] });
      p.close(); updateVol(); schedule(); renderList();
      setTimeout(() => { const cards = listEl.querySelectorAll('.ex-card'); const c = cards[cards.length - 1]; if (c) { c.scrollIntoView({ block: 'center' }); const i = c.querySelector('.set-grid input'); i && i.focus(); } }, 60);
    }
    function draw() {
      const q = search.value.trim().toLowerCase();
      const names = allExerciseNames();
      const recent = recentExerciseNames();
      let items;
      list.replaceChildren();
      if (!q) {
        if (recent.length) { list.append(h('div', { class: 'pick-title' }, 'Недавние')); recent.forEach((n) => list.append(h('button', { type: 'button', onclick: () => add(n) }, n))); }
        list.append(h('div', { class: 'pick-title' }, 'Все упражнения'));
        items = names;
      } else {
        items = names.filter((n) => n.toLowerCase().includes(q));
        if (!names.some((n) => n.toLowerCase() === q)) list.append(h('button', { class: 'new', type: 'button', onclick: () => add(search.value) }, `＋ Создать «${search.value.trim()}»`));
      }
      items.forEach((n) => list.append(h('button', { type: 'button', onclick: () => add(n) }, n)));
    }
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && search.value.trim()) { e.preventDefault(); const q = search.value.trim().toLowerCase(); const m = allExerciseNames().find((n) => n.toLowerCase() === q); add(m || search.value); } });
    p.body.append(search, list);
    draw();
    setTimeout(() => search.focus(), 80);
  }

  const feelBtns = Object.entries(FEELS).map(([k, label]) => h('button', {
    type: 'button', class: w.feel === k ? 'on' : '',
    onclick: () => { w.feel = w.feel === k ? '' : k; feelBtns.forEach((b, i) => b.classList.toggle('on', Object.keys(FEELS)[i] === w.feel)); schedule(); },
  }, label));

  const notes = h('textarea', { placeholder: 'Как прошла тренировка, самочувствие, что улучшить', 'aria-label': 'Заметки', value: w.notes,
    oninput: (e) => { w.notes = e.target.value; schedule(); } });

  sh.body.append(
    h('label', { class: 'field' }, h('span', null, 'Дата'), dateInput),
    volEl,
    h('div', { style: 'height:10px' }),
    listEl,
    h('button', { class: 'btn primary block', type: 'button', onclick: pickExercise }, '＋ Упражнение'),
    h('h2', null, 'Оценка дня'),
    h('div', { class: 'seg' }, feelBtns),
    h('h2', null, 'Заметки'),
    notes,
    existing || stored ? h('div', { style: 'margin-top:20px' },
      h('button', { class: 'btn danger block', type: 'button',
        onclick: async () => {
          if (!(await confirmDialog('Удалить эту тренировку? Это нельзя отменить.', 'Удалить', true))) return;
          deleted = true;
          clearTimeout(timer);
          await saving;
          try { await deleteWorkout(w.id); } catch (e) { toast('Не удалось удалить'); return; }
          toast('Тренировка удалена');
          sh.close();
        } }, 'Удалить тренировку')) : null);
  updateTitle(); updateVol(); renderList();
  return sh;
}
