/**
 * sync.js
 * Two-way sync between localStorage (fast local reads) and Firebase Realtime Database.
 *
 * Strategy:
 *  - On initSync(): attach Firebase .on('value') listener for the whole data tree.
 *    When Firebase changes (from another device), overwrite localStorage and
 *    fire a 'kitchen-sync' CustomEvent so React re-renders.
 *  - Every write in storage.js calls pushToFirebase() to upload the latest snapshot.
 *  - Writes are debounced 600ms so rapid sequential writes don't hammer Firebase.
 */

import { db, isFirebaseConfigured } from './firebase.js';
import { ref, set, onValue, off }   from 'firebase/database';

const ROOT = 'kitchen_os';
const STORAGE_KEYS = [
  'kitchen_os_recipes',
  'kitchen_os_meal_plan',
  'kitchen_os_grocery',
  'kitchen_os_meals',
  'kitchen_os_rankings',
  'kitchen_os_api_key',
];

// Collect all localStorage data as one object
function getLocalSnapshot() {
  const snap = {};
  STORAGE_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) snap[key] = JSON.parse(raw);
  });
  return snap;
}

// Write Firebase snapshot back to localStorage
function applyRemoteSnapshot(snap) {
  if (!snap) return;
  STORAGE_KEYS.forEach(key => {
    if (snap[key] !== undefined) {
      localStorage.setItem(key, JSON.stringify(snap[key]));
    }
  });
}

let pushTimer = null;

export function pushToFirebase() {
  if (!isFirebaseConfigured) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const snap = getLocalSnapshot();
    set(ref(db, ROOT), snap).catch(err => console.warn('Firebase write error:', err));
  }, 600);
}

let listenerRef = null;
let ignoreNextRemote = false; // avoid echo: don't apply our own push back

export function initSync(onRemoteChange) {
  if (!isFirebaseConfigured) return;

  listenerRef = ref(db, ROOT);

  onValue(listenerRef, (snapshot) => {
    if (ignoreNextRemote) { ignoreNextRemote = false; return; }
    const remote = snapshot.val();
    if (!remote) return; // empty DB — don't wipe local data
    applyRemoteSnapshot(remote);
    onRemoteChange(); // tell React to re-render
  }, (err) => {
    console.warn('Firebase listener error:', err);
  });
}

export function teardownSync() {
  if (listenerRef) off(listenerRef);
}

export { isFirebaseConfigured };
