import { open, STORES } from './db.js';

const TABLE = 'accountRecords';
const keys = { workouts: 'id', measurements: 'id', exercises: 'name', meta: 'key' };
const read = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function transaction(mode, fn, tables = [TABLE]) {
  const db = await open();
  const tx = db.transaction(tables, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Запись отменена'));
  });
  try {
    const [result] = await Promise.all([fn(tx.objectStore(TABLE), tx), done]);
    return result;
  } catch (error) {
    try { tx.abort(); } catch { /* Already finished. */ }
    throw error;
  }
}

export function accountDatabase(uid) {
  const rows = (s, group) => read(s.index('group').getAll([uid, group]));
  const get = (s, group, key) => read(s.get([uid, group, key]));
  async function change(s, group, key, value) {
    const old = await get(s, group, key);
    const time = Math.max(Date.now(), Number(old?.rev.split('-')[0] || 0) + 1);
    const rev = String(time).padStart(15, '0') + '-' + crypto.randomUUID();
    await read(s.put({ uid, group, key, value, rev, pending: 1 }));
  }
  async function write(fn, tables) {
    const result = await transaction('readwrite', fn, tables);
    window.dispatchEvent(new Event('gym-local-write'));
    return result;
  }
  async function replaceGroup(s, group, values, replace) {
    const byKey = new Map(values.map(v => [v[keys[group]], v]));
    if (replace) {
      for (const row of await rows(s, group)) {
        if (row.value !== null && !byKey.has(row.key)) await change(s, group, row.key, null);
      }
    }
    for (const [key, value] of byKey) await change(s, group, key, value);
  }
  const bulk = (data, replace, deletes = {}) => write(async s => {
    for (const group of STORES) {
      for (const key of deletes[group] || []) await change(s, group, key, null);
      await replaceGroup(s, group, data[group] || [], replace);
    }
  });
  return {
    all: group => transaction('readonly', async s => (await rows(s, group)).filter(r => r.value !== null).map(r => r.value)),
    get: (group, key) => transaction('readonly', async s => (await get(s, group, key))?.value),
    put: (group, value) => write(s => change(s, group, value[keys[group]], value)),
    del: (group, key) => write(s => change(s, group, key, null)),
    delMany: (group, ids) => write(async s => { for (const id of ids) await change(s, group, id, null); }),
    clear: group => write(s => replaceGroup(s, group, [], true)),
    bulk, wipe: () => bulk({}, true),
    pending: () => transaction('readonly', s => read(s.index('pending').getAll([uid, 1]))),
    // A server revision acknowledges only that exact edit. A later local edit stays queued.
    receive: records => transaction('readwrite', async s => {
      let changed = false;
      for (const { group, key, value, rev } of records) {
        if (!STORES.includes(group) || typeof key !== 'string' || typeof rev !== 'string' ||
            (value !== null && value?.[keys[group]] !== key)) continue;
        const old = await get(s, group, key);
        if (old && (old.rev > rev || (old.rev === rev && !old.pending))) continue;
        changed ||= old?.rev !== rev;
        await read(s.put({ uid, group, key, value, rev, pending: 0 }));
      }
      return changed;
    }),
    // Moving records and clearing the guest journal commit together in this device's DB.
    migrateGuest: () => write(async (s, tx) => {
      for (const group of STORES) {
        const guest = tx.objectStore(group);
        for (const entry of await read(guest.getAll())) {
          const key = entry[keys[group]];
          const existing = await get(s, group, key);
          if (!existing) await change(s, group, key, entry);
          else if (group === 'meta' && key === 'measureTypes' && existing.value) {
            const merged = [...existing.value.value];
            for (const type of entry.value) if (!merged.some(t => t.name === type.name)) merged.push(type);
            await change(s, group, key, { key, value: merged });
          } else if (group === 'workouts' && existing.value && (entry.updatedAt || 0) > (existing.value.updatedAt || 0)) {
            await change(s, group, key, entry);
          }
        }
        await read(guest.clear());
      }
    }, [TABLE, ...STORES]),
  };
}
