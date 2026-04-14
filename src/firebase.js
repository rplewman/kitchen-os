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
const envConfig = import.meta.env.VITE_FIREBASE_CONFIG
  ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
  : null;

const firebaseConfig = envConfig || {
  apiKey:            import.meta.env.VITE_FB_API_KEY            || '',
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN        || '',
  databaseURL:       import.meta.env.VITE_FB_DATABASE_URL       || '',
  projectId:         import.meta.env.VITE_FB_PROJECT_ID         || '',
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET     || '',
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID|| '',
  appId:             import.meta.env.VITE_FB_APP_ID             || '',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.databaseURL);

let app, db;
if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db  = getDatabase(app);
}

export { db };
