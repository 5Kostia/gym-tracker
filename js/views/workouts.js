// Список тренировок и редактор тренировки.
import { h, sheet, confirmDialog, toast, todayStr, fmtDay, fmtVolume, parseDate } from '../util.js';
import {
  S, FEELS, newWorkout, saveWorkout, deleteWorkout, workoutVolume, countSets, allExerciseNames,
  recentExerciseNames, addCustomExercise, lastSetsFor,
} from '../store.js';

function formatCardioDuration(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return [minutes && `${minutes} мин`, seconds && `${seconds} с`].filter(Boolean).join(' ');
}

function celebrateWorkout() {
  toast('Тренировка успешно добавлена', { top: true });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['var(--accent)', 'var(--ok)', 'var(--gold)', 'var(--text)'];
  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = i * 2 * Math.PI / 18;
    const distance = 52 + (i % 5) * 16;
    const x = Math.round(Math.cos(angle) * distance);
    const y = Math.round(Math.sin(angle) * distance * .52) + 22;
    return h('span', { style: `--x:${x}px;--y:${y}px;--spin:${(i - 9) * 37}deg;--piece:${colors[i % colors.length]}` });
  });
  const confetti = h('div', { class: 'workout-confetti', 'aria-hidden': 'true' }, pieces);
  document.body.append(confetti);
  setTimeout(() => confetti.remove(), 650);
}

// Карточка тренировки (используется в истории и на главной)
export function workoutCard(w, onOpen) {
  const exNames = w.exercises.map((e) => `${e.name} · ${e.sets.length}`);
  const vol = workoutVolume(w);
  const cardio = w.cardioSeconds ? formatCardioDuration(w.cardioSeconds) : '';
  return h('button', { class: 'card wcard', type: 'button', onclick: () => onOpen(w) },
    h('div', { class: 'top' },
      h('span', { class: 'date' }, fmtDay(w.date)),
      w.feel ? h('span', { class: 'badge ' + w.feel }, FEELS[w.feel]) : null),
    exNames.length
      ? exNames.slice(0, 4).map((t) => h('div', { class: 'ex' }, t))
      : !cardio && h('div', { class: 'ex' }, 'Без упражнений'),
    exNames.length > 4 ? h('div', { class: 'ex' }, `… и ещё ${exNames.length - 4}`) : null,
    (exNames.length || !cardio) ? h('div', { class: 'meta num' }, `${countSets(w)} подходов` + (vol ? ` · объём ${fmtVolume(vol)}` : '')) : null,
    cardio ? h('div', { class: 'meta num' }, `Кардио · ${cardio}`) : null,
    w.notes ? h('div', { class: 'meta' }, '📝 ' + (w.notes.length > 80 ? w.notes.slice(0, 80) + '…' : w.notes)) : null);
}

export function renderWorkouts(root, rerender) {
  root.append(
    h('h1', null, 'Тренировки'),
    h('p', { class: 'sub' }, 'История всех тренировок. Нажмите на карточку, чтобы изменить или удалить.'),
    h('button', { class: 'btn primary big block', type: 'button', onclick: () => openEditor({ date: todayStr() }, rerender) }, '＋ Новая тренировка'));

  if (!S.workouts.length) {
    root.append(h('div', { class: 'empty' }, 'Пока нет ни одной тренировки. Нажмите «Новая тренировка», чтобы записать упражнения или кардио.'));
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
    return w.exercises.length > 0 || w.cardioSeconds > 0 || w.notes.trim() || w.feel;
  }
  function persistNow() {
    clearTimeout(timer);
    if (deleted) return saving;
    if (!stored && !hasContent()) return saving;
    const snapshot = JSON.parse(JSON.stringify(w));
    const pending = saving.then(async () => {
      await saveWorkout(snapshot);
      stored = true;
    });
    saving = pending.catch(() => {});
    return pending;
  }
  function reportSaveError(error) {
    console.error(error);
    toast('Не удалось сохранить тренировку');
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => persistNow().catch(reportSaveError), 350);
  }

  const sh = sheet({
    title: 'Тренировка', full: true,
    beforeClose: () => deleted || updateCardio(true),
    onClose: async () => {
      sh.box.inert = true;
      try { await persistNow(); } catch (error) {
        sh.box.inert = false;
        reportSaveError(error);
        return false;
      }
      onDone?.();
    },
  });
  const done = h('button', { class: 'btn primary big block', type: 'button', onclick: async () => {
    if (!updateCardio(true)) return;
    if (!existing && !hasContent()) {
      toast('Добавьте данные тренировки');
      return;
    }
    if (await sh.close() && !existing) celebrateWorkout();
  } }, existing ? 'Сохранить изменения' : 'ДОБАВИТЬ ТРЕНИРОВКУ');
  sh.box.append(h('div', { class: 'sheet-footer' }, done));

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
    const mk = (key, ph, mode, cls) => {
      let moveCaret = false;
      return h('input', {
        class: cls || '', type: 'text', inputmode: mode, placeholder: ph, value: s[key] || '', 'aria-label': ph,
        enterkeyhint: 'next', autocomplete: 'off',
        oninput: (e) => { s[key] = e.target.value; updateVol(); schedule(); },
        onpointerdown: (e) => { moveCaret = e.pointerType === 'touch' && document.activeElement !== e.currentTarget; },
        onpointercancel: () => { moveCaret = false; },
        onclick: ({ currentTarget: input }) => {
          if (!moveCaret) return;
          moveCaret = false;
          const end = input.value.length;
          input.setSelectionRange(end, end);
        },
      });
    };
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
            ex.sets.push({ w: '', r: '', rpe: '', rir: '' });
            updateVol(); schedule(); renderList();
            focusLatestSet(ex);
          } }, '＋ Подход')));
  }

  function renderList() {
    listEl.replaceChildren(...w.exercises.map(exerciseCard));
    if (!w.exercises.length) listEl.append(h('div', { class: 'empty small' }, 'Добавьте первое упражнение'));
  }

  function focusLatestSet(ex) {
    const card = listEl.children[w.exercises.indexOf(ex)];
    const inputs = card.querySelectorAll('.set-grid input');
    const input = inputs[inputs.length - 4];
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    input.focus({ preventScroll: true });
  }

  function pickExercise() {
    const p = sheet({ title: 'Упражнение' });
    const search = h('input', { type: 'search', placeholder: 'Найти или создать упражнение', autocomplete: 'off', 'aria-label': 'Название упражнения' });
    const list = h('div', { class: 'pick-list' });
    function add(name) {
      name = name.trim().replace(/\s+/g, ' ');
      if (!name) return;
      addCustomExercise(name).catch(console.error);
      const ex = { name, sets: [{ w: '', r: '', rpe: '', rir: '' }] };
      w.exercises.push(ex);
      p.close(); updateVol(); schedule(); renderList();
      focusLatestSet(ex);
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
    search.focus({ preventScroll: true });
  }

  const feelBtns = Object.entries(FEELS).map(([k, label]) => h('button', {
    type: 'button', class: w.feel === k ? 'on' : '',
    onclick: () => { w.feel = w.feel === k ? '' : k; feelBtns.forEach((b, i) => b.classList.toggle('on', Object.keys(FEELS)[i] === w.feel)); schedule(); },
  }, label));

  const notes = h('textarea', { placeholder: 'Как прошла тренировка, самочувствие, что улучшить', 'aria-label': 'Заметки', value: w.notes,
    oninput: (e) => { w.notes = e.target.value; schedule(); } });

  const initialCardio = w.cardioSeconds || 0;
  const cardioMinutes = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'next',
    'aria-label': 'Минуты кардио', placeholder: '0', value: Math.floor(initialCardio / 60) || '', oninput: onCardioInput });
  const cardioSeconds = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': 'Секунды кардио', placeholder: '0', value: initialCardio % 60 || '', oninput: onCardioInput });
  const cardioError = h('p', { class: 'cardio-error sub', role: 'status', hidden: true });

  function onCardioInput() {
    if (updateCardio()) schedule();
  }
  function updateCardio(focusInvalid = false) {
    const minutes = cardioMinutes.value.trim();
    const seconds = cardioSeconds.value.trim();
    const secondsValid = /^\d*$/.test(seconds) && Number(seconds) < 60;
    const duration = Number(minutes) * 60 + (secondsValid ? Number(seconds) : 0);
    const minutesValid = /^\d*$/.test(minutes) && Number.isSafeInteger(duration);
    cardioMinutes.setAttribute('aria-invalid', String(!minutesValid));
    cardioSeconds.setAttribute('aria-invalid', String(!secondsValid));
    const message = !minutesValid ? 'Введите целое число минут.' : !secondsValid ? 'Введите секунды от 0 до 59.' : '';
    cardioError.hidden = !message;
    cardioError.textContent = message;
    if (message) {
      if (focusInvalid) (minutesValid ? cardioSeconds : cardioMinutes).focus();
      return false;
    }
    w.cardioSeconds = duration;
    return true;
  }

  sh.body.append(
    h('label', { class: 'field' }, h('span', null, 'Дата'), dateInput),
    volEl,
    h('div', { style: 'height:10px' }),
    listEl,
    h('button', { class: 'btn primary block', type: 'button', onclick: pickExercise }, '＋ Упражнение'),
    h('h2', null, 'Кардио'),
    h('div', { class: 'row cardio-inputs', role: 'group', 'aria-label': 'Время пробежки' },
      h('label', { class: 'field grow' }, h('span', null, 'Минуты'), cardioMinutes),
      h('label', { class: 'field grow' }, h('span', null, 'Секунды'), cardioSeconds)),
    cardioError,
    h('h2', null, 'Оценка дня'),
    h('div', { class: 'seg' }, feelBtns),
    h('h2', null, 'Заметки'),
    notes,
    existing ? h('div', { style: 'margin-top:20px' },
      h('button', { class: 'btn danger block', type: 'button',
        onclick: async () => {
          if (!(await confirmDialog('Удалить эту тренировку? Это нельзя отменить.', 'Удалить', true))) return;
          deleted = true;
          clearTimeout(timer);
          await saving;
          try { await deleteWorkout(w.id); } catch (e) { deleted = false; toast('Не удалось удалить'); return; }
          toast('Тренировка удалена');
          sh.close();
        } }, 'Удалить тренировку')) : null);
  updateTitle(); updateVol(); renderList();
  return sh;
}
