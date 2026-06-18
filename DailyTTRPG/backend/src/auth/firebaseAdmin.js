import admin from 'firebase-admin';
import { env } from '../config/env.js';

let firebaseApp = null;

function hasExplicitServiceAccount() {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
}

function initializeFirebaseAdmin() {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (admin.apps.length > 0) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  if (hasExplicitServiceAccount()) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
      projectId: env.FIREBASE_PROJECT_ID,
    });
    return firebaseApp;
  }

  if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_PROJECT_ID) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: env.FIREBASE_PROJECT_ID ?? undefined,
    });
    return firebaseApp;
  }

  return null;
}

export function getFirebaseAuth() {
  const app = initializeFirebaseAdmin();
  return app ? admin.auth(app) : null;
}

