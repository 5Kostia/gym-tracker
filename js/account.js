import { auth, login, logout, cloudJournal } from './firebase.js';
import { guestDB, useAccountDatabase } from './db.js';
import { accountDatabase } from './account-db.js';
import { loadAll } from './store.js';
import { prepareJournalWrite } from './journal-record.js';

export { login, logout };
export const account = { user: null, message: '', ready: false, guestCount: 0 };
let local, remote, unsubscribe, timer, running = false, server = false, fault = '';
let incoming = Promise.resolve();
let channel;
let invalidRemote = 0;
const notify = () => window.dispatchEvent(new Event('gym-account'));
const refresh = async () => { await loadAll(); window.dispatchEvent(new Event('gym-refresh')); };
async function receive(records) {
  if (!await local.receive(records)) return;
  channel?.postMessage('received');
  await refresh();
}
const sameUser = () => account.user && auth.currentUser?.uid === account.user.uid;

export function errorMessage(error) {
  switch (error?.code) {
    case 'permission-denied': return 'Облако недоступно. Проверь адрес в allowedUsers и правила Firestore.';
    case 'auth/unauthorized-domain': return 'Добавь домен сайта в Authentication → Settings → Authorized domains.';
    case 'auth/popup-blocked': return 'Разреши всплывающее окно для входа через Google.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Вход отменён.';
    case 'auth/network-request-failed': return 'Для входа через Google нужен интернет.';
    default: return 'Не удалось связаться с облаком. Изменения сохранены на устройстве.';
  }
}
function status(text) {
  account.message = text;
  account.ready = server && navigator.onLine && !fault;
  notify();
}
function schedule(delay = 500) {
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}
async function flush() {
  if (running || !sameUser()) return;
  running = true;
  try {
    while (sameUser()) {
      if (!navigator.onLine) { status('Без интернета · изменения сохраняются на устройстве'); break; }
      if (fault || !server) { status(fault || 'Подключение к облаку…'); break; }
      const batch = [];
      let bytes = 0;
      let invalidLocal = 0;
      for (const row of await local.pending()) {
        const record = prepareJournalWrite(row);
        if (!record) { invalidLocal++; continue; }
        if (batch.length === 20 || bytes + record.bytes > 4_000_000) break;
        batch.push(record);
        bytes += record.bytes;
      }
      if (!batch.length) {
        const messages = [invalidLocal || invalidRemote ? 'Синхронизация завершена с ошибками' : 'Сохранено в облаке'];
        if (invalidRemote) messages.push('Пропущено повреждённых записей в облаке: ' + invalidRemote);
        if (invalidLocal) messages.push('Записей с ошибками, оставшихся на устройстве: ' + invalidLocal);
        status(messages.join(' · '));
        break;
      }
      status('Синхронизация…');
      const winners = await remote.push(batch);
      if (!sameUser()) break;
      await receive(winners);
    }
  } catch (error) {
    fault = errorMessage(error);
    status(fault);
    scheduleRetry(error);
  } finally { running = false; }
}
let retryTimer;
function scheduleRetry(error) {
  clearTimeout(retryTimer);
  if (navigator.onLine && error?.code !== 'permission-denied') retryTimer = setTimeout(reconnect, 15000);
}
let watchVersion = 0;
export async function reconnect() {
  if (!sameUser()) return;
  const version = ++watchVersion;
  clearTimeout(retryTimer);
  unsubscribe?.();
  server = false;
  fault = '';
  status(navigator.onLine ? 'Подключение к облаку…' : 'Без интернета · изменения сохраняются на устройстве');
  try {
    remote ||= await cloudJournal(account.user.uid);
    if (version !== watchVersion || !sameUser()) return;
    const fail = error => {
      if (version !== watchVersion) return;
      server = false;
      fault = errorMessage(error);
      status(fault);
      scheduleRetry(error);
    };
    unsubscribe = remote.watch((records, fromServer, invalidCount) => {
      incoming = incoming.then(async () => {
        if (version !== watchVersion || !sameUser()) return;
        await receive(records);
        server = fromServer;
        if (fromServer) invalidRemote = invalidCount;
        schedule(0);
      }).catch(fail);
    }, fail);
  } catch (error) {
    fault = errorMessage(error);
    status(fault);
    scheduleRetry(error);
  }
}
export async function migrateGuest() {
  if (!sameUser() || !account.ready) throw new Error('Для переноса дождись подключения к облаку.');
  await local.migrateGuest();
  account.guestCount = 0;
  await refresh();
  notify();
}
export async function prepareAccount() {
  await auth.authStateReady();
  const user = auth.currentUser;
  auth.onAuthStateChanged(next => {
    if ((next?.uid || null) !== (user?.uid || null)) location.reload();
  });
  if (!user) return;
  account.user = user;
  local = accountDatabase(user.uid);
  useAccountDatabase(local);
  const [w, m, e, meta] = await Promise.all(['workouts', 'measurements', 'exercises', 'meta'].map(k => guestDB.all(k)));
  account.guestCount = w.length + m.length + e.length + Number(meta.some(x =>
    x.key === 'oneRepMaxFormula' || (x.key === 'measureTypes' && x.value.some(t => !t.builtin))));
}
export function startSync() {
  if (!account.user) return;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('gym-tracker-' + account.user.uid);
    channel.onmessage = () => { refresh().catch(console.error); schedule(); };
  }
  window.addEventListener('gym-local-write', () => {
    status(fault || (navigator.onLine ? 'Ожидает синхронизации' : 'Без интернета · сохранено на устройстве'));
    channel?.postMessage('changed');
    schedule(900);
  });
  window.addEventListener('online', reconnect);
  window.addEventListener('offline', () => { server = false; status('Без интернета · изменения сохраняются на устройстве'); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !server && navigator.onLine) reconnect();
  });
  reconnect();
}
