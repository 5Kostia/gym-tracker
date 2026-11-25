import { initializeApp } from './vendor/firebase-app.js';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut } from './vendor/firebase-auth.js';

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
  function unpack(data) {
    return { group: data.group, key: data.key, rev: data.rev, value: JSON.parse(data.payload) };
  }
  async function reference(row) {
    const bytes = new TextEncoder().encode(JSON.stringify([row.group, row.key]));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return doc(records, Array.from(hash, n => n.toString(16).padStart(2, '0')).join(''));
  }
  return {
    watch(onData, onError) {
      return onSnapshot(records, { includeMetadataChanges: true }, snapshot => {
        // A cache-only event cannot establish that this account is allowed to sync.
        const changes = snapshot.docChanges({ includeMetadataChanges: true })
          .filter(c => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites).map(c => unpack(c.doc.data()));
        onData(changes, !snapshot.metadata.fromCache);
      }, onError);
    },
    async push(batch) {
      const refs = await Promise.all(batch.map(reference));
      return runTransaction(db, async tx => {
        const current = await Promise.all(refs.map(ref => tx.get(ref)));
        return batch.map((row, i) => {
          const other = current[i].data();
          if (other && other.rev >= row.rev) return unpack(other);
          const { group, key, rev, value } = row;
          tx.set(refs[i], { group, key, rev, payload: JSON.stringify(value) });
          return row;
        });
      });
    },
  };
}
