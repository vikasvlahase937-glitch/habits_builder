// js/auth.js
// Wraps Firebase Authentication: Google sign-in, sign-out, and session observation.
// No globals — callers pass in callback functions and receive a plain account object.

import { auth, googleProvider } from "./firebase.js";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

/**
 * Converts a Firebase User into the plain "account" shape the rest of the
 * app expects (name, email, initials, avatar color, uid).
 */
function toAccount(user) {
  const name = user.displayName || user.email.split("@")[0];
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return {
    uid: user.uid,
    name,
    email: user.email,
    initials,
    color: "#6366F1"
  };
}

/**
 * Triggers the Google sign-in popup.
 * Throws on failure — caller is responsible for surfacing the error to the UI.
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return toAccount(result.user);
  } catch (err) {
    console.error("Google sign-in failed:", err);
    throw err;
  }
}

/**
 * Signs the current user out.
 */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Subscribes to auth state changes.
 * Calls onSignedIn(account) when a user is present, onSignedOut() otherwise.
 * Returns the unsubscribe function so callers can clean up if needed.
 */
export function observeAuthState(onSignedIn, onSignedOut) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      onSignedIn(toAccount(user));
    } else if (onSignedOut) {
      onSignedOut();
    }
  });
}
