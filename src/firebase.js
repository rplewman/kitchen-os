/**
 * firebase.js
 * Firebase config + Realtime Database instance.
 *
 * HOW TO FILL THIS IN:
 *  1. Go to https://console.firebase.google.com
 *  2. Create a project (any name, e.g. "kitchen-os")
 *  3. Click "Add app" → Web (</> icon)
 *  4. Register the app → copy the firebaseConfig object values below
 *  5. In Firebase console: Build → Realtime Database → Create database
 *     → Start in TEST mode (you can lock it down later)
 *
 * The FIREBASE_CONFIG env var (set in Render) overrides the hardcoded values below.
 * Format: a JSON string of the firebaseConfig object.
 */

import { initializeApp } from 'firebase/app';
import { getDatabase }   from 'firebase/database';

// Vite exposes env vars via import.meta.env.VITE_*
let envConfig = null;
try {
  if (import.meta.env.VITE_FIREBASE_CONFIG)
    envConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
} catch (e) {
  console.warn('VITE_FIREBASE_CONFIG is not valid JSON — Firebase disabled.', e.message);
}

const firebaseConfig = envConfig || {
  apiKey:            "AIzaSyAy4mC9w9yZloH-ed_Vrqfhw-VLXZfPIG0",
  authDomain:        "kitchen-os-21787.firebaseapp.com",
  databaseURL:       "https://kitchen-os-21787-default-rtdb.firebaseio.com",
  projectId:         "kitchen-os-21787",
  storageBucket:     "kitchen-os-21787.firebasestorage.app",
  messagingSenderId: "667792079928",
  appId:             "1:667792079928:web:3266aa1daa1af2f20efacd",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL);

let app, db;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db  = getDatabase(app);
}

export { db };
