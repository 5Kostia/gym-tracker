// Тонкая обёртка над IndexedDB. Все данные живут только на этом устройстве.

const DB_NAME = 'gym-tracker';
const DB_VERSION = 2;
export const STORES = ['workouts', 'measurements', 'exercises', 'meta'];
let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB недоступна в этом браузере')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accountRecords')) {
        const rows = db.createObjectStore('accountRecords', { keyPath: ['uid', 'group', 'key'] });
        rows.createIndex('group', ['uid', 'group']);
        rows.createIndex('pending', ['uid', 'pending']);
      }
      if (!db.objectStoreNames.contains('workouts')) {
        db.createObjectStore('workouts', { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('measurements')) {
        const s = db.createObjectStore('measurements', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('База данных заблокирована другой вкладкой'));
  });
  return dbPromise;
}

// Выполняет fn(store) в одной транзакции и ждёт её полного завершения.
function run(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Транзакция отменена'));
  }));
}

export const guestDB = {
  all: (store) => run(store, 'readonly', (s) => s.getAll()),
  get: (store, key) => run(store, 'readonly', (s) => s.get(key)),
  put: (store, value) => run(store, 'readwrite', (s) => s.put(value)),
  del: (store, key) => run(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => run(store, 'readwrite', (s) => s.clear()),

  // Удалить сразу много записей одной транзакцией
  delMany: (store, keys) => run(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); }),

  // Записать/заменить сразу несколько хранилищ одной транзакцией.
  // data: { workouts: [...], measurements: [...], exercises: [...], meta: [...] }
  // Если replace = true, перед записью хранилища очищаются. Если что-то пошло не так, не меняется ничего.
  bulk: (data, replace) => open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      const s = t.objectStore(name);
      if (replace) s.clear();
      for (const item of data[name] || []) s.put(item);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Транзакция отменена'));
  })),

  wipe: () => open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    STORES.forEach((n) => t.objectStore(n).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Транзакция отменена'));
  })),
};

export let DB = guestDB;
export function useAccountDatabase(accountDB) { DB = accountDB; }