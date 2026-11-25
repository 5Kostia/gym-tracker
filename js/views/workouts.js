// Список тренировок и редактор тренировки.
import { h, choiceField, svg, sheet, confirmDialog, toast, todayStr, fmtDay, fmtVolume, parseDate } from '../util.js';
import {
  S, FEELS, EXERCISE_CATEGORIES, newWorkout, saveWorkout, deleteWorkout, workoutVolume, countSets,
  exerciseCatalog, exerciseNameKey, recentExerciseNames, addCustomExercise, lastSetsFor,
  updateCustomExercise, removeCustomExercise,
} from '../store.js';

function formatCardioDuration(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return [minutes && `${minutes} мин`, seconds && `${seconds} с`].filter(Boolean).join(' ');
}

function workoutDateField(initialDate, onChange) {
  const display = (date) => date.split('-').reverse().join('.');
  let savedDate = initialDate;
  const input = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 10,
    'aria-label': 'Дата тренировки', placeholder: 'ДД.ММ.ГГГГ', value: display(initialDate), onchange: () => validate() });
  const picker = h('input', { type: 'date', 'aria-label': 'Выбрать дату в календаре', value: initialDate,
    onclick: () => { if (picker.showPicker) { try { picker.showPicker(); } catch { /* Доступен системный календарь. */ } } },
    onchange: () => { if (picker.value) { input.value = display(picker.value); validate(); } } });
  const error = h('p', { class: 'field-error sub', role: 'status', hidden: true }, 'Введите дату в формате ДД.ММ.ГГГГ.');

  function validate(focusInvalid = false) {
    const text = input.value.trim().replace(/^(\d{2})(\d{2})(\d{4})$/, '$1.$2.$3');
    const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
    const value = parts && `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    picker.value = value || '';
    const valid = Boolean(value && picker.value === value);
    input.setAttribute('aria-invalid', String(!valid));
    error.hidden = valid;
    if (!valid) {
      picker.value = savedDate;
      if (focusInvalid) input.focus();
      return false;
    }

    input.value = display(value);
    if (value !== savedDate) {
      savedDate = value;
      onChange(value);
    }
    return true;
  }

  const icon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svg('path', { d: 'M5 5h14v15H5zM8 3v4m8-4v4M5 10h14' }));
  return {
    element: h('div', null,
      h('div', { class: 'row workout-date' },
        h('label', { class: 'field grow' }, h('span', null, 'Дата'), input),
        h('div', { class: 'workout-date-picker' }, icon, picker)),
      error),
    validate,
  };
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
  const exNames = w.exercises.filter((ex) => ex.kind !== 'cardio').map((ex) => `${ex.name} · ${ex.sets.length}`);
  const vol = workoutVolume(w);
  const cardio = w.exercises.filter((ex) => ex.kind === 'cardio');
  return h('button', { class: 'card wcard', type: 'button', onclick: () => onOpen(w) },
    h('div', { class: 'top' },
      h('span', { class: 'date' }, fmtDay(w.date)),
      w.feel ? h('span', { class: 'badge ' + w.feel }, FEELS[w.feel]) : null),
    exNames.length
      ? exNames.slice(0, 4).map((t) => h('div', { class: 'ex' }, t))
      : !cardio.length && h('div', { class: 'ex' }, 'Без упражнений'),
    exNames.length > 4 ? h('div', { class: 'ex' }, `… и ещё ${exNames.length - 4}`) : null,
    (exNames.length || !cardio.length) ? h('div', { class: 'meta num' }, `${countSets(w)} подходов` + (vol ? ` · объём ${fmtVolume(vol)}` : '')) : null,
    cardio.map((ex) => h('div', { class: 'meta num' }, ex.name + (ex.durationSeconds ? ` · ${formatCardioDuration(ex.durationSeconds)}` : ''))),
    w.notes ? h('div', { class: 'meta' }, '📝 ' + (w.notes.length > 80 ? w.notes.slice(0, 80) + '…' : w.notes)) : null);
}

function exerciseForm({ name = '', category = '', submitLabel, save, extra }) {
  const nameField = h('input', { type: 'text', value: name, autocomplete: 'off', required: true });
  const categoryField = h('select', { required: true },
    h('option', { value: '', disabled: true, selected: !category }, 'Выберите категорию'),
    EXERCISE_CATEGORIES.map(({ id, label }) => h('option', { value: id, selected: category === id }, label)));
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, submitLabel);
  return h('form', { class: 'custom-item-actions', onsubmit: async event => {
    event.preventDefault();
    if (!nameField.value.trim()) { nameField.focus(); return; }
    submit.disabled = true;
    try {
      await save(nameField.value, categoryField.value);
    } catch (error) {
      console.error(error);
      toast('Не удалось сохранить упражнение');
    } finally {
      submit.disabled = false;
    }
  } },
  h('label', { class: 'field' }, h('span', null, 'Название'), nameField),
  choiceField('Категория', categoryField),
  submit, extra);
}

function addExerciseFromList(rerender) {
  const p = sheet({ title: 'Своё упражнение' });
  p.body.append(exerciseForm({ submitLabel: 'Добавить упражнение', save: async (name, category) => {
    if (exerciseCatalog().some(entry => exerciseNameKey(entry.name) === exerciseNameKey(name))) {
      toast('Такое упражнение уже есть');
      return;
    }
    if (!await addCustomExercise(name, category)) return;
    await p.close();
    toast('Упражнение добавлено');
    rerender();
  } }));
}

function manageExercises(rerender) {
  const manager = sheet({ title: 'Свои упражнения', onClose: () => rerender() });
  function draw() {
    const exercises = [...S.customExercises].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    manager.body.replaceChildren(exercises.length ? h('div', { class: 'card' }, exercises.map(exercise =>
      h('button', { class: 'list-row', type: 'button', onclick: () => edit(exercise) },
        h('span', null, exercise.name), h('span', { class: 'muted' }, EXERCISE_CATEGORIES.find(item => item.id === exercise.category)?.label))))
      : h('div', { class: 'empty small' }, 'Своих упражнений пока нет'));
  }
  function edit(exercise) {
    const editor = sheet({ title: 'Своё упражнение' });
    const save = async (action, message) => {
      editor.box.inert = true;
      try {
        if (await action() === false) { toast('Такое упражнение уже есть или название пустое'); return; }
        toast(message);
        await editor.close();
        draw();
      } catch (error) {
        console.error(error);
        toast('Не удалось изменить упражнение');
      } finally { editor.box.inert = false; }
    };
    editor.body.append(exerciseForm({
      name: exercise.name,
      category: exercise.category,
      submitLabel: 'Сохранить изменения',
      save: (name, category) => save(() => updateCustomExercise(exercise.name, name, category), 'Упражнение обновлено'),
      extra: h('button', { class: 'btn danger block', type: 'button', onclick: async () => {
        if (await confirmDialog(`Убрать «${exercise.name}» из списка упражнений? Записанные тренировки сохранятся.`, 'Убрать', true)) {
          await save(() => removeCustomExercise(exercise.name), 'Упражнение убрано из списка');
        }
      } }, 'Удалить из списка'),
    }));
  }
  draw();
}

export function renderWorkouts(root, rerender) {
  root.append(
    h('h1', null, 'Тренировки'),
    h('p', { class: 'sub' }, 'История всех тренировок. Нажмите на карточку, чтобы изменить или удалить.'),
    h('button', { class: 'btn primary big block', type: 'button', onclick: () => openEditor({ date: todayStr() }, rerender) }, '＋ Новая тренировка'));
  root.append(h('div', { class: 'custom-item-actions' },
    h('button', { class: 'btn small block', type: 'button', onclick: () => addExerciseFromList(rerender) }, '＋ Своё упражнение'),
    h('button', { class: 'btn small block', type: 'button', onclick: () => manageExercises(rerender) }, 'Свои упражнения')));

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
  let savedContent = existing ? JSON.stringify(w) : null;
  const cardioFields = new Map();

  function hasContent() {
    return w.exercises.some((ex) => ex.kind !== 'cardio' || ex.durationSeconds > 0) || w.notes.trim() || w.feel;
  }
  function persistNow() {
    clearTimeout(timer);
    if (deleted) return saving;
    if (!stored && !hasContent()) return saving;
    const content = JSON.stringify(w);
    const pending = saving.then(async () => {
      if (content === savedContent) return;
      await saveWorkout(JSON.parse(content));
      savedContent = content;
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
    beforeClose: () => deleted || validateFields(),
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
    if (!validateFields()) return;
    if (!existing && !hasContent()) {
      toast('Добавьте данные тренировки');
      return;
    }
    if (await sh.close() && !existing) celebrateWorkout();
  } }, existing ? 'Сохранить изменения' : 'ДОБАВИТЬ ТРЕНИРОВКУ');
  sh.box.append(h('div', { class: 'sheet-footer' }, done));

  const volEl = h('div', { class: 'vol num' });
  const listEl = h('div');
  const dateField = workoutDateField(w.date, (date) => { w.date = date; updateTitle(); schedule(); renderList(); });
  function validateFields() {
    return dateField.validate(true) && [...cardioFields.values()].every(({ validate }) => validate(true));
  }
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

  function exerciseHeader(ex) {
    return h('div', { class: 'ex-head' },
      h('h3', null, ex.name),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Убрать ${ex.name}`, onclick: async () => {
        if ((ex.sets.length || ex.durationSeconds) && !(await confirmDialog(`Убрать «${ex.name}» из тренировки?`, 'Убрать', true))) return;
        w.exercises.splice(w.exercises.indexOf(ex), 1);
        cardioFields.delete(ex);
        updateVol(); schedule(); renderList();
      } }, '✕'));
  }

  function cardioCard(ex) {
    const existingCard = cardioFields.get(ex);
    if (existingCard) return existingCard.card;

    const duration = ex.durationSeconds || 0;
    const minutesInput = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'next',
      placeholder: '0', value: Math.floor(duration / 60) || '', oninput: onInput });
    const secondsInput = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
      placeholder: '0', value: duration % 60 || '', oninput: onInput });
    const error = h('p', { class: 'field-error sub', role: 'status', hidden: true });
    const card = h('div', { class: 'ex-card cardio-card' }, exerciseHeader(ex),
      h('div', { class: 'row cardio-inputs', role: 'group', 'aria-label': `Длительность: ${ex.name}` },
        h('label', { class: 'field grow' }, h('span', null, 'Минуты'), minutesInput),
        h('label', { class: 'field grow' }, h('span', null, 'Секунды'), secondsInput)),
      error);
    function onInput() {
      if (validate()) schedule();
    }
    function validate(focusInvalid = false) {
      const minutes = minutesInput.value.trim();
      const seconds = secondsInput.value.trim();
      const secondsValid = /^\d*$/.test(seconds) && Number(seconds) < 60;
      const total = Number(minutes) * 60 + (secondsValid ? Number(seconds) : 0);
      const minutesValid = /^\d*$/.test(minutes) && Number.isSafeInteger(total);
      minutesInput.setAttribute('aria-invalid', String(!minutesValid));
      secondsInput.setAttribute('aria-invalid', String(!secondsValid));
      const message = !minutesValid ? 'Введите целое число минут.' : !secondsValid ? 'Введите секунды от 0 до 59.' : '';
      error.hidden = !message;
      error.textContent = message;
      if (message) {
        if (focusInvalid) (minutesValid ? secondsInput : minutesInput).focus();
        return false;
      }
      ex.durationSeconds = total;
      return true;
    }
    cardioFields.set(ex, { card, validate });
    return card;
  }

  function exerciseCard(ex) {
    const last = lastSetsFor(ex.name, w.date, w.id);
    const hint = last
      ? 'В прошлый раз (' + fmtDay(last.date) + '): ' + last.sets.map((s) => `${s.w || '0'}×${s.r || '?'}`).join(', ')
      : 'Раньше это упражнение не выполнялось';
    return h('div', { class: 'ex-card' },
      exerciseHeader(ex),
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
            focusExercise(ex);
          } }, '＋ Подход')));
  }

  function renderList() {
    listEl.replaceChildren(...w.exercises.map((ex) => ex.kind === 'cardio' ? cardioCard(ex) : exerciseCard(ex)));
    if (!w.exercises.length) listEl.append(h('div', { class: 'empty small' }, 'Добавьте первое упражнение'));
  }

  function focusExercise(ex) {
    const card = listEl.children[w.exercises.indexOf(ex)];
    const inputs = card.querySelectorAll('input');
    const input = inputs[ex.kind === 'cardio' ? 0 : inputs.length - 4];
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    input.focus({ preventScroll: true });
  }

  function pickExercise() {
    const p = sheet({ title: 'Упражнение' });
    const search = h('input', { type: 'search', placeholder: 'Найти или создать упражнение', autocomplete: 'off', 'aria-label': 'Название упражнения' });
    const list = h('div', { class: 'pick-list' });
    const catalog = exerciseCatalog();
    const byName = new Map(catalog.map((entry) => [exerciseNameKey(entry.name), entry]));

    function add({ name, category }) {
      const ex = category === 'cardio'
        ? { name, kind: 'cardio', durationSeconds: 0, sets: [] }
        : { name, sets: [{ w: '', r: '', rpe: '', rir: '' }] };
      w.exercises.push(ex);
      p.close(); updateVol(); schedule(); renderList();
      focusExercise(ex);
    }
    const exerciseButton = (entry) => h('button', { type: 'button', onclick: () => add(entry) }, entry.name);

    function createExercise(name) {
      const form = exerciseForm({
        name: name.trim(),
        submitLabel: 'Добавить упражнение',
        save: async (name, category) => {
          const entry = await addCustomExercise(name, category);
          if (entry && p.box.isConnected) add(entry);
        },
        extra: h('button', { class: 'btn ghost block', type: 'button', onclick: showPicker }, 'К списку упражнений'),
      });
      p.setTitle('Своё упражнение');
      p.body.replaceChildren(form);
      form.querySelector(name.trim() ? 'summary' : 'input').focus({ preventScroll: true });
    }

    function draw() {
      const q = exerciseNameKey(search.value);
      list.replaceChildren();
      if (!q) {
        const recent = [...new Set(recentExerciseNames().map((name) => byName.get(exerciseNameKey(name))))].filter(Boolean);
        if (recent.length) list.append(h('div', { class: 'pick-title' }, 'Недавние'), ...recent.map(exerciseButton));
      }
      for (const { id, label } of EXERCISE_CATEGORIES) {
        const entries = catalog.filter((entry) => entry.category === id && exerciseNameKey(entry.name).includes(q));
        if (entries.length) list.append(h('section', { class: 'pick-group', 'data-category': id },
          h('h3', { class: 'pick-title' }, label), h('div', { class: 'pick-group-items' }, entries.map(exerciseButton))));
      }
      if (!byName.has(q)) list.append(h('button', { class: 'new', type: 'button', onclick: () => createExercise(search.value) },
        q ? `＋ Создать «${search.value.trim()}»` : '＋ Своё упражнение'));
    }
    function showPicker() {
      p.setTitle('Упражнение');
      p.body.replaceChildren(search, list);
      draw();
      if (!matchMedia('(pointer: coarse)').matches) search.focus({ preventScroll: true });
    }
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !search.value.trim()) return;
      event.preventDefault();
      const entry = byName.get(exerciseNameKey(search.value));
      if (entry) add(entry);
      else createExercise(search.value);
    });
    showPicker();
  }

  const feelBtns = Object.entries(FEELS).map(([k, label]) => h('button', {
    type: 'button', class: w.feel === k ? 'on' : '',
    onclick: () => { w.feel = w.feel === k ? '' : k; feelBtns.forEach((b, i) => b.classList.toggle('on', Object.keys(FEELS)[i] === w.feel)); schedule(); },
  }, label));

  const notes = h('textarea', { placeholder: 'Как прошла тренировка, самочувствие, что улучшить', 'aria-label': 'Заметки', value: w.notes,
    oninput: (e) => { w.notes = e.target.value; schedule(); } });

  sh.body.append(
    dateField.element,
    volEl,
    h('div', { style: 'height:10px' }),
    listEl,
    h('button', { class: 'btn primary block', type: 'button', onclick: pickExercise }, '＋ Упражнение'),
    h('h2', null, 'Оценка дня'),
    h('div', { class: 'seg' }, feelBtns),
    h('h2', null, 'Заметки'),
    notes);
  if (existing) sh.body.append(h('div', { style: 'margin-top:20px' },
      h('button', { class: 'btn danger block', type: 'button',
        onclick: async () => {
          if (!(await confirmDialog('Удалить эту тренировку? Это нельзя отменить.', 'Удалить', true))) return;
          deleted = true;
          clearTimeout(timer);
          await saving;
          try { await deleteWorkout(w.id); } catch (e) { deleted = false; toast('Не удалось удалить'); return; }
          toast('Тренировка удалена');
          sh.close();
        } }, 'Удалить тренировку')));
  updateTitle(); updateVol(); renderList();
  return sh;
}
