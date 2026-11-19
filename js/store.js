// Данные приложения в памяти + операции над ними. Источник правды — IndexedDB.
import { DB } from './db.js';
import { uid, isDateStr, num } from './util.js';

export const DEFAULT_EXERCISES = [
  'Жим лёжа', 'Жим лёжа на наклонной скамье', 'Присед со штангой', 'Становая тяга', 'Румынская тяга',
  'Жим стоя', 'Тяга штанги в наклоне', 'Подтягивания', 'Отжимания на брусьях', 'Тяга верхнего блока',
  'Тяга нижнего блока', 'Жим ногами', 'Сгибание рук со штангой', 'Подъём гантелей на бицепс',
  'Французский жим', 'Разводка гантелей', 'Махи гантелей в стороны', 'Подъём на носки',
];

export const DEFAULT_MEASURES = [
  { name: 'Вес тела', unit: 'кг', builtin: true },
  { name: 'Бицепс', unit: 'см', builtin: true },
  { name: 'Предплечья', unit: 'см', builtin: true },
  { name: 'Грудь', unit: 'см', builtin: true },
  { name: 'Плечи', unit: 'см', builtin: true },
  { name: 'Талия', unit: 'см', builtin: true },
  { name: 'Бёдра', unit: 'см', builtin: true },
  { name: 'Икры', unit: 'см', builtin: true },
];

export const FEELS = { easy: 'Лёгкий', medium: 'Средний', hard: 'Тяжёлый' };

export const S = {
  workouts: [],          // новые сверху
  measurements: [],
  customExercises: [],
  measureTypes: [],
  lastBackup: null,      // ISO-строка или null
};

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0));

export async function loadAll() {
  const [w, m, e, mt, lb] = await Promise.all([
    DB.all('workouts'), DB.all('measurements'), DB.all('exercises'),
    DB.get('meta', 'measureTypes'), DB.get('meta', 'lastBackup'),
  ]);
  S.workouts = w.sort(byDateDesc);
  S.measurements = m;
  S.customExercises = e.map((x) => x.name);
  S.lastBackup = lb ? lb.value : null;
  if (mt && Array.isArray(mt.value) && mt.value.length) {
    S.measureTypes = mt.value;
  } else {
    S.measureTypes = DEFAULT_MEASURES.map((x) => ({ ...x }));
    await DB.put('meta', { key: 'measureTypes', value: S.measureTypes });
  }
}

// ---------- тренировки ----------
export function newWorkout(date) {
  return { id: uid(), date, feel: '', notes: '', exercises: [], createdAt: Date.now() };
}
export async function saveWorkout(w) {
  w.updatedAt = Date.now();
  await DB.put('workouts', w);
  const i = S.workouts.findIndex((x) => x.id === w.id);
  if (i >= 0) S.workouts[i] = w; else S.workouts.push(w);
  S.workouts.sort(byDateDesc);
}
export async function deleteWorkout(id) {
  await DB.del('workouts', id);
  S.workouts = S.workouts.filter((x) => x.id !== id);
}

export function workoutsOn(date) {
  return S.workouts.filter((w) => w.date === date);
}

export function setVolume(s) {
  const w = num(s.w), r = num(s.r);
  return w !== null && r !== null && w > 0 && r > 0 ? w * r : 0;
}
export function workoutVolume(w) {
  let v = 0;
  for (const ex of w.exercises) for (const s of ex.sets) v += setVolume(s);
  return v;
}
export function countSets(w) {
  let n = 0;
  for (const ex of w.exercises) n += ex.sets.length;
  return n;
}

// ---------- упражнения ----------
export function allExerciseNames() {
  const set = new Set([...DEFAULT_EXERCISES, ...S.customExercises]);
  for (const w of S.workouts) for (const ex of w.exercises) set.add(ex.name);
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}
export function recentExerciseNames(limit = 8) {
  const out = [];
  for (const w of S.workouts) {
    for (const ex of w.exercises) if (!out.includes(ex.name)) out.push(ex.name);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
export async function addCustomExercise(name) {
  name = name.trim();
  if (!name) return;
  if (!DEFAULT_EXERCISES.includes(name) && !S.customExercises.includes(name)) {
    await DB.put('exercises', { name });
    S.customExercises.push(name);
  }
}

// Подходы этого упражнения из последней прошлой тренировки (для подсказки «в прошлый раз»)
export function lastSetsFor(name, date, excludeId) {
  for (const w of S.workouts) {
    if (w.id === excludeId || w.date > date) continue;
    const ex = w.exercises.find((e) => e.name === name && e.sets.length);
    if (ex) return { date: w.date, sets: ex.sets };
  }
  return null;
}

// Расчётный 1ПМ по формуле Эпли
export function est1RM(w, r) {
  if (!(w > 0) || !(r > 0)) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

// Статистика упражнения по тренировкам (по возрастанию даты)
export function exerciseHistory(name) {
  const byDate = new Map();
  for (const w of S.workouts) {
    for (const ex of w.exercises) {
      if (ex.name !== name) continue;
      const rec = byDate.get(w.date) || { date: w.date, maxW: 0, maxReps: 0, volume: 0, e1rm: 0 };
      for (const s of ex.sets) {
        const wt = num(s.w), rp = num(s.r);
        if (wt !== null && wt > rec.maxW) rec.maxW = wt;
        if (rp !== null && rp > rec.maxReps) rec.maxReps = rp;
        rec.volume += setVolume(s);
        if (wt !== null && rp !== null) rec.e1rm = Math.max(rec.e1rm, est1RM(wt, rp));
      }
      byDate.set(w.date, rec);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Личные рекорды по всем упражнениям: максимальный вес и когда он взят
export function personalRecords() {
  const map = new Map();
  for (const w of S.workouts) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const wt = num(s.w), rp = num(s.r);
        if (wt === null || !(wt > 0)) continue;
        const cur = map.get(ex.name);
        const better = !cur || wt > cur.weight || (wt === cur.weight && rp !== null && rp > (cur.reps || 0));
        const e = rp !== null ? est1RM(wt, rp) : 0;
        if (better) map.set(ex.name, { name: ex.name, weight: wt, reps: rp, date: w.date, e1rm: cur ? Math.max(cur.e1rm, e) : e });
        else if (e > cur.e1rm) cur.e1rm = e;
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// ---------- замеры ----------
export function measureUnit(type) {
  const t = S.measureTypes.find((x) => x.name === type);
  return t ? t.unit : '';
}
export async function saveMeasurement(m) {
  await DB.put('measurements', m);
  const i = S.measurements.findIndex((x) => x.id === m.id);
  if (i >= 0) S.measurements[i] = m; else S.measurements.push(m);
}
export async function deleteMeasurement(id) {
  await DB.del('measurements', id);
  S.measurements = S.measurements.filter((x) => x.id !== id);
}
export function measurementsOfType(type) {
  return S.measurements.filter((m) => m.type === type).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
}
export async function addMeasureType(name, unit) {
  name = name.trim(); unit = (unit || '').trim();
  if (!name) return false;
  if (S.measureTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) return false;
  S.measureTypes.push({ name, unit: unit || 'см' });
  await DB.put('meta', { key: 'measureTypes', value: S.measureTypes });
  return true;
}
export async function removeMeasureType(name) {
  S.measureTypes = S.measureTypes.filter((t) => t.name !== name);
  const ids = S.measurements.filter((m) => m.type === name).map((m) => m.id);
  await DB.put('meta', { key: 'measureTypes', value: S.measureTypes });
  await DB.delMany('measurements', ids);
  S.measurements = S.measurements.filter((m) => m.type !== name);
}

// ---------- резервная копия ----------
export function buildBackup() {
  return {
    app: 'gym-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: S.workouts,
    measurements: S.measurements,
    exercises: S.customExercises,
    measureTypes: S.measureTypes,
  };
}
export async function markBackupDone() {
  S.lastBackup = new Date().toISOString();
  await DB.put('meta', { key: 'lastBackup', value: S.lastBackup });
}

// Проверка и очистка данных из файла. Бросает Error с понятным текстом, если файл не подходит.
export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('Файл не похож на резервную копию (это не JSON).'); }
  if (!d || d.app !== 'gym-tracker' || !Array.isArray(d.workouts) || !Array.isArray(d.measurements)) {
    throw new Error('Это не резервная копия Gym Tracker.');
  }
  const workouts = [];
  for (const w of d.workouts) {
    if (!w || typeof w.id !== 'string' || !isDateStr(w.date) || !Array.isArray(w.exercises)) continue;
    workouts.push({
      id: w.id, date: w.date,
      feel: ['easy', 'medium', 'hard'].includes(w.feel) ? w.feel : '',
      notes: typeof w.notes === 'string' ? w.notes : '',
      createdAt: Number(w.createdAt) || Date.now(),
      updatedAt: Number(w.updatedAt) || undefined,
      exercises: w.exercises.filter((e) => e && typeof e.name === 'string' && Array.isArray(e.sets)).map((e) => ({
        name: e.name,
        sets: e.sets.filter((s) => s && typeof s === 'object').map((s) => ({
          w: s.w === undefined || s.w === null ? '' : String(s.w),
          r: s.r === undefined || s.r === null ? '' : String(s.r),
          rpe: s.rpe === undefined || s.rpe === null ? '' : String(s.rpe),
          rir: s.rir === undefined || s.rir === null ? '' : String(s.rir),
        })),
      })),
    });
  }
  const measurements = [];
  for (const m of d.measurements) {
    if (!m || typeof m.id !== 'string' || !isDateStr(m.date) || typeof m.type !== 'string' || !Number.isFinite(Number(m.value))) continue;
    measurements.push({ id: m.id, date: m.date, type: m.type, value: Number(m.value), createdAt: Number(m.createdAt) || Date.now() });
  }
  const exercises = Array.isArray(d.exercises) ? d.exercises.filter((x) => typeof x === 'string' && x.trim()) : [];
  const measureTypes = Array.isArray(d.measureTypes)
    ? d.measureTypes.filter((t) => t && typeof t.name === 'string' && t.name.trim()).map((t) => ({ name: t.name, unit: typeof t.unit === 'string' ? t.unit : '', builtin: !!t.builtin }))
    : [];
  return { workouts, measurements, exercises, measureTypes };
}

// mode: 'replace' — заменить всё, 'merge' — добавить к существующему (записи с тем же id перезаписываются)
export async function applyBackup(parsed, mode) {
  const meta = [];
  let types = parsed.measureTypes;
  if (mode === 'merge') {
    types = [...S.measureTypes];
    for (const t of parsed.measureTypes) if (!types.some((x) => x.name === t.name)) types.push(t);
  }
  // типы, которые используются в замерах, но не описаны
  for (const m of parsed.measurements) if (!types.some((t) => t.name === m.type)) types.push({ name: m.type, unit: '' });
  if (!types.length) types = DEFAULT_MEASURES.map((x) => ({ ...x }));
  meta.push({ key: 'measureTypes', value: types });
  if (mode === 'replace' && S.lastBackup) meta.push({ key: 'lastBackup', value: S.lastBackup });
  await DB.bulk({
    workouts: parsed.workouts,
    measurements: parsed.measurements,
    exercises: parsed.exercises.map((name) => ({ name })),
    meta,
  }, mode === 'replace');
  await loadAll();
}

export async function wipeAll() {
  await DB.wipe();
  await loadAll();
}
