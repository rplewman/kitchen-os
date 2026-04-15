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
import { ref, set, onValue, off, get } from 'firebase/database';

const ROOT = 'kitchen_os';
const STORAGE_KEYS = [
  'kitchen_os_recipes',
  'kitchen_os_meal_plan',
  'kitchen_os_grocery',
  'kitchen_os_meals',
  'kitchen_os_rankings',
  'kitchen_os_api_key',
  'kitchen_os_settings',
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

function localHasData() {
  return STORAGE_KEYS.some(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const v = JSON.parse(raw);
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object' && v !== null) return Object.keys(v).length > 0;
      return Boolean(v);
    } catch { return false; }
  });
}

export function initSync(onRemoteChange) {
  if (!isFirebaseConfigured) return;

  listenerRef = ref(db, ROOT);

  onValue(listenerRef, (snapshot) => {
    if (ignoreNextRemote) { ignoreNextRemote = false; return; }
    const remote = snapshot.val();

    if (!remote) {
      // Firebase is empty — seed it with whatever we have locally
      if (localHasData()) pushToFirebase();
      return;
    }

    applyRemoteSnapshot(remote);
    onRemoteChange(); // tell React to re-render
  }, (err) => {
    console.warn('Firebase listener error:', err);
  });
}

export function teardownSync() {
  if (listenerRef) off(listenerRef);
}

/** One-shot forced read from Firebase — use when app comes back to foreground. */
export function forceSyncFromFirebase(onRemoteChange) {
  if (!isFirebaseConfigured) return;
  get(ref(db, ROOT)).then(snapshot => {
    const remote = snapshot.val();
    if (remote) {
      applyRemoteSnapshot(remote);
      onRemoteChange();
    }
  }).catch(err => console.warn('Force sync error:', err));
}

export { isFirebaseConfigured };
