// js/app.js
// Application entry point (loaded as the single <script type="module"> in index.html).
// Owns the two pieces of global state (account, state), observes auth, and
// wires ui.js's delegated events to real Firestore reads/writes.
// No `window.*` assignments anywhere — everything is module-scoped.

import { signInWithGoogle, signOutUser, observeAuthState } from "./auth.js";
import { loadState, saveState, createHabit, updateHabit, deleteHabit } from "./firestore.js";
import * as ui from "./ui.js";
import { isDoneToday, xpForDifficulty, levelForXp, todayStr } from "./utils.js";

/* ============ GLOBAL STATE (module-scoped, not window-scoped) ============ */
let account = null; // { uid, name, email, initials, color }
let state = null;    // { habits, xp, level, darkMode, goals }

/* ============ HANDLERS PASSED TO ui.js ============ */
const handlers = {
  onToggleHabit(habitId, checkboxEl, wasChecked) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const day = todayStr();
    const wasDone = !!habit.history[day];
    habit.history[day] = !wasDone;

    if (!wasDone) {
      habit.streak += 1;
      habit.longestStreak = Math.max(habit.longestStreak, habit.streak);
      state.xp += xpForDifficulty(habit.difficulty);
    } else {
      habit.streak = Math.max(0, habit.streak - 1);
      state.xp = Math.max(0, state.xp - xpForDifficulty(habit.difficulty));
    }
    state.level = levelForXp(state.xp);

    persist();

    if (!wasDone) {
      checkboxEl.classList.add('burst');
      setTimeout(() => checkboxEl.classList.remove('burst'), 500);
    }

    ui.render({ account, state });

    if (!wasDone && state.habits.every(isDoneToday)) {
      ui.fireConfetti();
      ui.toast('🎉 All habits complete for today!');
    } else if (!wasDone) {
      ui.toast(`${habit.emoji} ${habit.name} — nice work!`);
    }
  },

  onDeleteHabit(habitId) {
    // deleteHabit() mutates state.habits synchronously before its internal
    // await, so it's safe to render immediately and let the Firestore write
    // finish in the background.
    deleteHabit(account.uid, state, habitId).catch(err => handleFirestoreError(err));
    ui.render({ account, state });
    ui.toast('Habit removed');
  },

  onCreateHabit(habitInput) {
    // Same optimistic pattern: the new habit is unshifted onto state.habits
    // synchronously inside createHabit(), before the Firestore write starts.
    createHabit(account.uid, state, habitInput).catch(err => handleFirestoreError(err));
    ui.render({ account, state });
    ui.toast('Habit created ✨');
  },

  onToggleDark() {
    state.darkMode = !state.darkMode;
    ui.setDarkModeClass(state.darkMode);
    persist();
    ui.render({ account, state });
  },

  onSignOut() {
    signOutUser().catch(err => console.error('Sign-out failed:', err));
  }
};

/**
 * Fire-and-forget save to Firestore, with error surfaced as a toast rather
 * than a blocked UI. Every mutation calls this immediately so state stays
 * in sync across devices.
 */
function persist() {
  saveState(account.uid, state).catch(err => handleFirestoreError(err));
}

function handleFirestoreError(err) {
  console.error('Firestore write failed:', err);
  ui.toast('Could not save — check your connection');
}

/* ============ STARTUP ============ */
async function onSignedIn(acc) {
  account = acc;
  try {
    state = await loadState(acc.uid);
  } catch (err) {
    console.error('Failed to load state:', err);
    ui.toast('Could not load your data — please refresh');
    return;
  }

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.add('active');

  ui.renderAccountHeader(account);
  ui.setDarkModeClass(state.darkMode);
  ui.setView('dashboard');
  ui.render({ account, state });
}

function onSignedOut() {
  account = null;
  state = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('auth-screen').style.display = 'flex';
}

function wireAuthButtons() {
  document.getElementById('google-btn').addEventListener('click', async () => {
    try {
      await signInWithGoogle();
      // onAuthStateChanged (observeAuthState) picks up the result and calls onSignedIn.
    } catch (err) {
      ui.toast('Sign-in failed — please try again');
    }
  });

  // Guest mode has no backing Firestore rules or anonymous-auth flow defined
  // for this project, so rather than silently doing nothing (the original
  // bug) or inventing an auth path you haven't configured, this tells the
  // person clearly that it isn't available yet.
  document.getElementById('guest-btn').addEventListener('click', () => {
    ui.toast('Guest mode isn\u2019t available yet — please sign in with Google');
  });
}

function init() {
  wireAuthButtons();
  ui.init(handlers);
  observeAuthState(onSignedIn, onSignedOut);
}

init();
