import { isDateStr } from './util.js';

const keyFields = { workouts: 'id', measurements: 'id', exercises: 'name', meta: 'key' };
const metaKeys = ['measureTypes', 'lastBackup', 'oneRepMaxFormula'];
const revisionPattern = /^[0-9]{15}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string';
const isSet = set => isObject(set) && ['w', 'r', 'rpe', 'rir'].every(key =>
  set[key] == null || isText(set[key]) || Number.isFinite(set[key]));
const isExercise = ex => isObject(ex) && isText(ex.name) && Array.isArray(ex.sets) && ex.sets.every(isSet) &&
  (ex.kind !== 'cardio' || (Number.isSafeInteger(ex.durationSeconds) && ex.durationSeconds >= 0));

function validKey(group, key) {
  return Object.hasOwn(keyFields, group) && isText(key) && (group !== 'meta' || metaKeys.includes(key));
}

export function validJournalValue(group, key, value) {
  if (!validKey(group, key)) return false;
  if (value === null) return true;
  if (!isObject(value) || value[keyFields[group]] !== key) return false;
  switch (group) {
    case 'workouts':
      return isDateStr(value.date) && isText(value.notes) && Array.isArray(value.exercises) && value.exercises.every(isExercise);
    case 'measurements':
      return isDateStr(value.date) && isText(value.type) && Number.isFinite(value.value);
    case 'exercises':
      return value.category == null || isText(value.category);
    case 'meta':
      return key !== 'measureTypes' ? isText(value.value) :
        Array.isArray(value.value) && value.value.every(type => isObject(type) && isText(type.name) && isText(type.unit));
  }
}

export function unpackJournalRecord(data) {
  if (!isObject(data) || Object.keys(data).length !== 4) return null;
  const { group, key, rev, payload } = data;
  if (!isText(rev) || !revisionPattern.test(rev) || !isText(payload)) return null;
  try {
    const value = JSON.parse(payload);
    return validJournalValue(group, key, value) ? { group, key, rev, value } : null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();
export function prepareJournalWrite({ group, key, rev, value }) {
  if (!isText(rev) || !revisionPattern.test(rev) || !validJournalValue(group, key, value)) return null;
  let payload;
  try { payload = JSON.stringify(value); } catch { return null; }
  // Leave room for the Firestore document name and field overhead.
  const bytes = encoder.encode(key).length + encoder.encode(payload).length + 512;
  if (bytes > 1_048_576) return null;
  return { group, key, rev, payload, bytes };
}
