/**
 * Fallback web app config for the MHG corporate Firebase project.
 *
 * Normally unused: the page fetches this project's config from Firebase
 * Hosting at /__/firebase/init.json, so the deployed site can't be pointed at
 * the wrong project. This file is what it falls back to when the page runs
 * somewhere other than Firebase Hosting.
 *
 * These values are NOT secrets. A Firebase web config identifies a project; it
 * grants nothing on its own. Access is decided by Auth plus the mhgAdmin claim
 * the callables check, and this project's Firestore is closed to clients
 * entirely. Committing this file is fine.
 *
 * Regenerate with:
 *   firebase apps:sdkconfig web --project mhg-icgenerator
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAsXp7CsJLAnJZbpra5MPXgj69TrMb7W6c',
  authDomain: 'mhg-icgenerator.firebaseapp.com',
  projectId: 'mhg-icgenerator',
  storageBucket: 'mhg-icgenerator.firebasestorage.app',
  messagingSenderId: '1025576393021',
  appId: '1:1025576393021:web:81c12d172e4d95706c0d54',
};

/** Must match setGlobalOptions in functions/src/index.ts. */
export const functionsRegion = 'us-central1';
