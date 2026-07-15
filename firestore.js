// js/firestore.js
// All persistence lives here. The app stores one document per user at
// users/{uid} containing the full app state: { habits, xp, level, darkMode, goals }.
// Every mutation (toggle, create, update, delete) writes straight through to
// Firestore — there is no localStorage anywhere in this app.

import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { uid as generateId } from "./utils.js";

/**
 * The shape of a brand-new user's state. Every field the UI reads from
 * `state` must exist here so nothing renders as `undefined`.
 */
function defaultState() {
  return {
    habits: [],
    xp: 0,
    level: 1,
    darkMode: false,
    goals: []
  };
}

function userDocRef(userUid) {
  return doc(db, "users", userUid);
}

/**
 * Loads the signed-in user's state from Firestore.
 * If the document doesn't exist yet (first ever sign-in), creates a default
 * state document and returns it.
 */
export async function loadState(userUid) {
  const ref = userDocRef(userUid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // Merge with defaults in case older documents are missing newer fields.
    return { ...defaultState(), ...snap.data() };
  }

  const initial = defaultState();
  await setDoc(ref, initial);
  return initial;
}

/**
 * Persists the full state object to Firestore for the given user.
 * This is the single write path used after every mutation, so the app
 * stays in sync across devices/tabs.
 */
export async function saveState(userUid, state) {
  const ref = userDocRef(userUid);
  await setDoc(ref, state);
}

/**
 * Creates a new habit, adds it to state.habits, and saves.
 * Returns the updated state.
 */
export async function createHabit(userUid, state, habitInput) {
  const habit = {
    id: generateId(),
    name: habitInput.name,
    emoji: habitInput.emoji,
    color: habitInput.color,
    category: habitInput.category,
    difficulty: habitInput.difficulty,
    time: habitInput.time || "Anytime",
    frequency: habitInput.frequency,
    notes: habitInput.notes || "",
    streak: 0,
    longestStreak: 0,
    history: {}
  };

  state.habits.unshift(habit);
  await saveState(userUid, state);
  return state;
}

/**
 * Applies a partial update to an existing habit (e.g. streak, history,
 * name, color) and saves. `updates` is shallow-merged onto the habit.
 */
export async function updateHabit(userUid, state, habitId, updates) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) {
    throw new Error(`updateHabit: no habit found with id ${habitId}`);
  }
  Object.assign(habit, updates);
  await saveState(userUid, state);
  return state;
}

/**
 * Removes a habit from state.habits and saves.
 */
export async function deleteHabit(userUid, state, habitId) {
  state.habits = state.habits.filter(h => h.id !== habitId);
  await saveState(userUid, state);
  return state;
}
