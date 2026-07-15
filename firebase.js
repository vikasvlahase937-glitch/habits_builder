// js/firebase.js
// Single source of truth for Firebase initialization.
// Every other module imports app/auth/db from here — nothing is attached to window.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAzsQ_ncFiTseV3SmooZBTSwiBSgO9u02A",
  authDomain: "habitflow-4c479.firebaseapp.com",
  projectId: "habitflow-4c479",
  storageBucket: "habitflow-4c479.firebasestorage.app",
  messagingSenderId: "280955825864",
  appId: "1:280955825864:web:b5b3ac3104836908e13ffd",
  measurementId: "G-T296RH7BC0"
};

export const app = initializeApp(firebaseConfig);

// Analytics can fail to initialize in some environments (e.g. blocked by an
// ad-blocker, or unsupported browser). It's non-critical, so we guard it.
export let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (err) {
  console.warn("Analytics not initialized:", err.message);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
