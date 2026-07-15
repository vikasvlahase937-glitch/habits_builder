// js/utils.js
// Pure helper functions: id generation, date math, and stat calculations.
// Nothing in this file touches the DOM or Firestore — it only reads the
// `state` object passed in, so it's easy to test and reuse.

/* ============ CONSTANTS ============ */
export const ICONS = ['💧','📚','🧘','🏃','🍎','😴','✍️','🎯','💪','🎸','🧠','🌱','☀️','🚴','🥗','💊'];
export const COLORS = ['#6366F1','#22C55E','#F59E0B','#EF4444','#3B82F6','#EC4899','#14B8A6','#8B5CF6'];
export const CATEGORY_COLORS = {
  Health: '#22C55E',
  Fitness: '#EF4444',
  Mindfulness: '#8B5CF6',
  Productivity: '#3B82F6',
  Learning: '#F59E0B',
  Social: '#EC4899'
};

/* ============ ID / DATE HELPERS ============ */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ============ HABIT / STATE CALCULATIONS ============ */
export function isDoneToday(habit) {
  return !!habit.history[todayStr()];
}

export function todaysCompletionPct(state) {
  if (!state.habits.length) return 0;
  const done = state.habits.filter(isDoneToday).length;
  return Math.round((done / state.habits.length) * 100);
}

export function currentGlobalStreak(state) {
  if (!state.habits.length) return 0;
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = daysAgo(i);
    const any = state.habits.some(h => h.history[day]);
    if (any) streak++;
    else break;
  }
  return streak;
}

export function longestStreakOverall(state) {
  if (!state.habits.length) return 0;
  return Math.max(0, ...state.habits.map(h => h.longestStreak));
}

export function weeklyScore(state) {
  if (!state.habits.length) return 0;
  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const day = daysAgo(i);
    state.habits.forEach(h => {
      total++;
      if (h.history[day]) done++;
    });
  }
  return total ? Math.round((done / total) * 100) : 0;
}

export function avgConsistency(state) {
  if (!state.habits.length) return 0;
  const vals = state.habits.map(h => {
    let done = 0;
    for (let i = 0; i < 30; i++) {
      if (h.history[daysAgo(i)]) done++;
    }
    return done / 30;
  });
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
}

export function productivityScore(state) {
  return Math.min(
    100,
    Math.round(
      weeklyScore(state) * 0.5 +
      avgConsistency(state) * 0.3 +
      Math.min(longestStreakOverall(state), 20) * 1
    )
  );
}

/**
 * XP cost/reward for completing a habit of a given difficulty.
 */
export function xpForDifficulty(difficulty) {
  if (difficulty === 'Hard') return 30;
  if (difficulty === 'Medium') return 20;
  return 10;
}

/**
 * Level is derived from XP: every 250 XP is one level, starting at level 1.
 */
export function levelForXp(xp) {
  return 1 + Math.floor(xp / 250);
}

/* ============ FORMATTING / HEATMAP ============ */
export function heatColor(intensity, isDark) {
  if (intensity <= 0) return isDark ? '#181A22' : '#ECEEF3';
  const stops = ['#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4338CA'];
  const idx = Math.min(stops.length - 1, Math.floor(intensity * stops.length));
  return stops[idx];
}

/**
 * Achievement definitions, evaluated against the current state.
 * Returns an array of { icon, title, desc, xp, unlocked }.
 */
export function achievementsList(state) {
  const longest = longestStreakOverall(state);
  const totalDone = state.habits.reduce(
    (sum, h) => sum + Object.values(h.history).filter(Boolean).length,
    0
  );

  return [
    { icon: '🔥', title: 'First flame', desc: 'Complete a habit 3 days in a row', xp: 20, unlocked: longest >= 3 },
    { icon: '⚡', title: 'Week warrior', desc: 'Hit a 7 day streak', xp: 50, unlocked: longest >= 7 },
    { icon: '🏔️', title: 'Consistency king', desc: 'Reach a 21 day streak', xp: 100, unlocked: longest >= 21 },
    { icon: '💎', title: 'Unbreakable', desc: 'Reach a 30 day streak', xp: 150, unlocked: longest >= 30 },
    { icon: '🎯', title: 'Perfect day', desc: 'Complete every habit in one day', xp: 30, unlocked: state.habits.length > 0 && state.habits.every(isDoneToday) },
    { icon: '📚', title: 'Century club', desc: 'Log 100 total completions', xp: 80, unlocked: totalDone >= 100 },
    { icon: '🌱', title: 'First step', desc: 'Create your first habit', xp: 10, unlocked: state.habits.length >= 1 },
    { icon: '🧠', title: 'Level 5', desc: 'Reach level 5', xp: 0, unlocked: state.level >= 5 },
    { icon: '👑', title: 'Habit master', desc: 'Track 6 or more habits', xp: 60, unlocked: state.habits.length >= 6 }
  ];
}
