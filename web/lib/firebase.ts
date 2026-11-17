'use client';
import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore,
} from 'firebase/firestore';

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = !!(config.apiKey && config.projectId);
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === '1';

const isNew = !getApps().length;
export const app = isNew ? initializeApp(config.apiKey ? config : { apiKey: 'demo-key', projectId: 'demo-tarmak', authDomain: 'localhost' }) : getApp();

export const auth = getAuth(app);

// Офлайн-кэш Firestore (IndexedDB): PWA открывает ленту без сети, а записи уходят при появлении связи
export const db: Firestore = (() => {
  if (!isNew) return getFirestore(app);
  try {
    return initializeFirestore(app, typeof window === 'undefined' ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
})();

if (isNew && useEmulators && typeof window !== 'undefined') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
