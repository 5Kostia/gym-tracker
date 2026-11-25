import { initializeApp } from './vendor/firebase-app.js';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut } from './vendor/firebase-auth.js';
import { unpackJournalRecord } from './journal-record.js';

const app = initializeApp({
  apiKey: 'AIzaSyAc4Yn8XPjIk-oZtFCSe5Po8MeCRbZCvG0',
  authDomain: 'gym-tracker-3a20c.firebaseapp.com',
  projectId: 'gym-tracker-3a20c',
  appId: '1:478834401699:web:4b41af06a0557f31073a16',
});
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
auth.languageCode = 'ru';
export function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider, browserPopupRedirectResolver);
}
export const logout = () => signOut(auth);

export async function cloudJournal(uid) {
  const { getFirestore, collection, doc, onSnapshot, runTransaction } = await import('./vendor/firebase-firestore.js');
  const db = getFirestore(app);
  const records = collection(db, 'users', uid, 'records');
  async function recordId(row) {
    const bytes = new TextEncoder().encode(JSON.stringify([row.group, row.key]));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(hash, n => n.toString(16).padStart(2, '0')).join('');
  }
  return {
    watch(onData, onError) {
      const invalidIds = new Set();
      let processing = Promise.resolve();
      return onSnapshot(records, { includeMetadataChanges: true }, snapshot => {
        processing = processing.then(async () => {
          const changes = snapshot.docChanges({ includeMetadataChanges: true });
          const checked = await Promise.all(changes.map(async ({ type, doc: record }) => {
            if (type === 'removed' || record.metadata.hasPendingWrites) return null;
            const row = unpackJournalRecord(record.data());
            return row && await recordId(row) === record.id ? row : null;
          }));
          const rows = [];
          changes.forEach(({ type, doc: record }, i) => {
            if (type === 'removed') invalidIds.delete(record.id);
            else if (!record.metadata.hasPendingWrites) {
              if (checked[i]) {
                invalidIds.delete(record.id);
                rows.push(checked[i]);
              } else invalidIds.add(record.id);
            }
          });
          // A cache-only event cannot establish that this account is allowed to sync.
          onData(rows, !snapshot.metadata.fromCache, invalidIds.size);
        }).catch(onError);
      }, onError);
    },
    async push(batch) {
      const refs = await Promise.all(batch.map(async row => doc(records, await recordId(row))));
      return runTransaction(db, async tx => {
        const current = await Promise.all(refs.map(ref => tx.get(ref)));
        return batch.map((row, i) => {
          const other = unpackJournalRecord(current[i].data());
          if (other && other.group === row.group && other.key === row.key && other.rev >= row.rev) return other;
          const { group, key, rev, payload } = row;
          const record = { group, key, rev, payload };
          tx.set(refs[i], record);
          return unpackJournalRecord(record);
        });
      });
    },
  };
}
