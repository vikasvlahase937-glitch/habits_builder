// js/ui.js
// Everything that touches the DOM lives here: rendering every view, drawing
// charts, building the calendar heatmap, running the create-habit modal, and
// wiring up ALL interactivity through delegated event listeners (data-action
// attributes) instead of inline onclick="" strings. This is what lets the
// rest of the app avoid attaching anything to `window`.
//
// ui.js never talks to Firestore directly. When the user does something that
// should change state (toggle a habit, delete one, create one, sign out,
// flip dark mode…), it calls back into the handler functions passed to
// init(handlers) — app.js owns what actually happens to state/Firestore.

import {
  ICONS,
  COLORS,
  CATEGORY_COLORS,
  isDoneToday,
  todaysCompletionPct,
  currentGlobalStreak,
  longestStreakOverall,
  weeklyScore,
  avgConsistency,
  productivityScore,
  heatColor,
  achievementsList,
  daysAgo,
  todayStr
} from "./utils.js";

/* ============ MODULE STATE (pure UI state, not persisted) ============ */
let ctxRef = null;       // { account, state } — latest snapshot to render
let handlers = null;      // callbacks supplied by app.js
let currentView = 'dashboard';
let todayFilter = 'All';
let modalFreq = 'Daily', modalDiff = 'Easy', modalEmoji = ICONS[0], modalColor = COLORS[0];
let chartInstances = {};

/* ============ PUBLIC: INIT (call once at startup) ============ */
export function init(handlerCallbacks) {
  handlers = handlerCallbacks;

  wireGlobalRipple();
  wireSidebarNav();
  wireDarkToggle();
  wireProfileMenu();
  wireSearch();
  wireModalStatic();
  wireContentDelegation();

  document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

/* ============ PUBLIC: RENDER ============ */
export function render(ctx) {
  ctxRef = ctx;
  const { account, state } = ctx;

  destroyCharts();

  const content = document.getElementById('content');
  let html = '';
  if (currentView === 'dashboard') html = renderDashboard(account, state);
  else if (currentView === 'today') html = renderToday(state);
  else if (currentView === 'statistics') html = renderStatistics(state);
  else if (currentView === 'calendar') html = renderCalendar();
  else if (currentView === 'achievements') html = renderAchievements(state);
  else if (currentView === 'goals') html = renderGoals(state);
  else if (currentView === 'settings') html = renderSettings(account, state);
  content.innerHTML = html;

  document.getElementById('today-badge').textContent = state.habits.filter(h => !isDoneToday(h)).length;
  document.getElementById('topbar-streak').textContent = currentGlobalStreak(state);
  document.getElementById('side-level').textContent = state.level;
  document.getElementById('side-xp').textContent = state.xp;

  content.querySelectorAll('[data-countup]').forEach(el => {
    countUp(el, parseInt(el.dataset.countup, 10), el.dataset.suffix || '');
  });
  content.querySelectorAll('.habit-item').forEach((el, i) => {
    el.style.animationDelay = (i * 0.04) + 's';
  });

  if (currentView === 'statistics') requestAnimationFrame(() => drawStatCharts(state));
  if (currentView === 'calendar') requestAnimationFrame(() => buildCalendarGrid(state));
}

export function renderAccountHeader(account) {
  document.getElementById('profile-name').textContent = account.name.split(' ')[0];
  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.style.background = account.color;
  avatarEl.textContent = account.initials;
}

export function setDarkModeClass(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  document.getElementById('dark-switch').classList.toggle('on', isDark);
}

export function setView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(el =>
    el.classList.toggle('active', el.dataset.view === view)
  );
  document.getElementById('sidebar').classList.remove('open');
  if (ctxRef) render(ctxRef);
}

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

export function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#6366F1', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];
  let particles = Array.from({ length: 130 }, () => ({
    x: innerWidth / 2, y: innerHeight / 2,
    vx: (Math.random() - 0.5) * 17, vy: (Math.random() - 1.4) * 17,
    size: Math.random() * 7 + 3, color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360, vrot: (Math.random() - 0.5) * 20, life: 100
  }));
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.rot += p.vrot; p.life--;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(p.life / 100, 0);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });
    particles = particles.filter(p => p.life > 0);
    if (particles.length) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  frame();
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('f-name').value = '';
  document.getElementById('f-notes').value = '';
  modalFreq = 'Daily'; modalDiff = 'Easy'; modalEmoji = ICONS[0]; modalColor = COLORS[0];
  buildModalPickers();
  document.querySelectorAll('[data-freq]').forEach(b => b.classList.toggle('active', b.dataset.freq === modalFreq));
  document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b.dataset.diff === modalDiff));
}

/* ============ COUNT UP ANIMATION ============ */
function countUp(el, to, suffix) {
  suffix = suffix || '';
  const dur = 700;
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============ RIPPLE (global delight, purely visual) ============ */
function wireGlobalRipple() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-primary,.btn-submit,.google-btn,.chip-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    r.className = 'ripple';
    r.style.width = r.style.height = size + 'px';
    r.style.left = (e.clientX - rect.left - size / 2) + 'px';
    r.style.top = (e.clientY - rect.top - size / 2) + 'px';
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(r);
    setTimeout(() => r.remove(), 600);
  });
}

/* ============ STATIC WIRING (elements that live in index.html, not re-rendered) ============ */
function wireSidebarNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.view));
  });
}

function wireDarkToggle() {
  document.getElementById('dark-switch').addEventListener('click', () => handlers.onToggleDark());
}

function wireProfileMenu() {
  document.getElementById('profile-row').addEventListener('click', e => {
    if (e.target.closest('#signout-btn')) {
      handlers.onSignOut();
      return;
    }
    document.getElementById('profile-menu').classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#profile-row')) {
      document.getElementById('profile-menu').classList.remove('open');
    }
  });
}

function wireSearch() {
  document.getElementById('search-input').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    if (currentView !== 'today' && q) {
      setView('today');
    } else if (ctxRef) {
      render(ctxRef);
    }
    if (q) {
      document.querySelectorAll('.habit-item').forEach(item => {
        const nameEl = item.querySelector('.habit-name');
        if (!nameEl) return;
        const name = nameEl.textContent.toLowerCase();
        item.style.display = name.includes(q) ? 'flex' : 'none';
      });
    }
  });
}

function wireModalStatic() {
  document.getElementById('quick-add-btn').addEventListener('click', openModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  document.querySelectorAll('[data-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      modalFreq = btn.dataset.freq;
      document.querySelectorAll('[data-freq]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
  document.querySelectorAll('[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      modalDiff = btn.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('modal-save').addEventListener('click', () => {
    const name = document.getElementById('f-name').value.trim();
    if (!name) { toast('Give your habit a name first'); return; }
    const category = document.getElementById('f-category').value;
    const notes = document.getElementById('f-notes').value.trim();
    handlers.onCreateHabit({
      name, category, notes,
      emoji: modalEmoji, color: modalColor,
      frequency: modalFreq, difficulty: modalDiff
    });
    closeModal();
    setView('today');
  });

  buildModalPickers();
}

function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
}

function buildModalPickers() {
  document.getElementById('emoji-grid').innerHTML = ICONS.map(e =>
    `<div class="emoji-opt ${e === modalEmoji ? 'sel' : ''}" data-emoji="${e}">${e}</div>`
  ).join('');
  document.getElementById('color-row').innerHTML = COLORS.map(c =>
    `<div class="color-opt ${c === modalColor ? 'sel' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  document.querySelectorAll('.emoji-opt').forEach(el => {
    el.onclick = () => { modalEmoji = el.dataset.emoji; buildModalPickers(); };
  });
  document.querySelectorAll('.color-opt').forEach(el => {
    el.onclick = () => { modalColor = el.dataset.color; buildModalPickers(); };
  });
}

/* ============ DELEGATED CONTENT EVENTS (rendered views change constantly) ============ */
function wireContentDelegation() {
  document.getElementById('content').addEventListener('click', e => {
    const toggleEl = e.target.closest('[data-action="toggle-habit"]');
    if (toggleEl) {
      const id = toggleEl.dataset.id;
      const wasChecked = toggleEl.classList.contains('checked');
      handlers.onToggleHabit(id, toggleEl, wasChecked);
      return;
    }

    const delEl = e.target.closest('[data-action="delete-habit"]');
    if (delEl) {
      handlers.onDeleteHabit(delEl.dataset.id);
      return;
    }

    const filterEl = e.target.closest('[data-action="today-filter"]');
    if (filterEl) {
      todayFilter = filterEl.dataset.category;
      if (ctxRef) render(ctxRef);
      return;
    }

    const viewAllEl = e.target.closest('[data-action="set-view"]');
    if (viewAllEl) {
      setView(viewAllEl.dataset.view);
      return;
    }

    const addFirstEl = e.target.closest('[data-action="open-modal"]');
    if (addFirstEl) {
      openModal();
      return;
    }

    const settingsDarkEl = e.target.closest('[data-action="toggle-dark-settings"]');
    if (settingsDarkEl) {
      handlers.onToggleDark();
      return;
    }
  });
}

/* ============ RENDER: DASHBOARD ============ */
function renderDashboard(account, state) {
  const pct = todaysCompletionPct(state);
  const streak = currentGlobalStreak(state);
  const longest = longestStreakOverall(state);
  const done = state.habits.filter(isDoneToday).length;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (pct / 100) * circumference;

  if (!state.habits.length) {
    return `
    <div class="view">
      <h1 class="page-title">Good day, ${account.name.split(' ')[0]} 👋</h1>
      <p class="page-sub">Your dashboard is a clean slate. Let's add your first habit.</p>
      <div class="welcome-card">
        <div>
          <div class="welcome-greeting">0 of 0 habits done today</div>
          <div class="welcome-quote">"Small daily improvements are the key to staggering long-term results." Start with one habit — momentum builds from there.</div>
        </div>
        <div class="ring-wrap">
          <svg viewBox="0 0 100 100" width="112" height="112">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"/>
          </svg>
          <div class="ring-pct"><div class="num">0%</div><div class="lbl">Today</div></div>
        </div>
      </div>
      <div class="card" style="margin-top:20px;">
        ${emptyState('No habits yet', 'Every streak starts with a single day.', true)}
      </div>
    </div>`;
  }

  return `
  <div class="view">
    <h1 class="page-title">Good day, ${account.name.split(' ')[0]} 👋</h1>
    <p class="page-sub">Here's how your day is shaping up.</p>

    <div class="welcome-card">
      <div>
        <div class="welcome-greeting">${done} of ${state.habits.length} habits done today</div>
        <div class="welcome-quote">"Small daily improvements are the key to staggering long-term results." Keep the streak alive — you're doing better than you think.</div>
      </div>
      <div class="ring-wrap">
        <svg viewBox="0 0 100 100" width="112" height="112">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"/>
          <circle cx="50" cy="50" r="42" fill="none" stroke="#818CF8" stroke-width="8" stroke-linecap="round"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 50 50)"
            style="transition:stroke-dashoffset .8s var(--ease-out)"/>
        </svg>
        <div class="ring-pct"><div class="num">${pct}%</div><div class="lbl">Today</div></div>
      </div>
    </div>

    <div class="grid stats-row">
      ${statCard('🔥', 'Current streak', streak, ' days', 'var(--warning-light)', 'Keep it going', true)}
      ${statCard('🏆', 'Longest streak', longest, ' days', 'var(--success-light)', 'Personal best', true)}
      ${statCard('⭐', 'XP points', state.xp, '', 'var(--accent-light)', 'Level ' + state.level, true)}
      ${statCard('📈', 'Weekly score', weeklyScore(state), '%', 'var(--danger-light)', 'vs last week', true)}
    </div>

    <div class="grid two-col">
      <div class="card">
        <div class="section-head">
          <h3>Today's habits</h3>
          <button class="link-btn" data-action="set-view" data-view="today">View all →</button>
        </div>
        ${state.habits.slice(0, 5).map(habitRow).join('')}
      </div>
      <div class="card">
        <div class="section-head"><h3>Level progress</h3></div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:52px;height:52px;border-radius:14px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:var(--accent);">L${state.level}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${state.xp % 250}/250 XP to level ${state.level + 1}</div>
            <div class="progress-track"><div class="progress-fill" style="width:${((state.xp % 250) / 250) * 100}%"></div></div>
          </div>
        </div>
        <div class="section-head" style="margin-top:20px;"><h3>Quick stats</h3></div>
        <div class="quick-item"><span style="color:var(--text-secondary);font-size:12.5px;">Total habits</span><span style="margin-left:auto;font-weight:700;font-size:13px;">${state.habits.length}</span></div>
        <div class="quick-item"><span style="color:var(--text-secondary);font-size:12.5px;">Completed today</span><span style="margin-left:auto;font-weight:700;font-size:13px;">${done}</span></div>
        <div class="quick-item"><span style="color:var(--text-secondary);font-size:12.5px;">Avg. consistency</span><span style="margin-left:auto;font-weight:700;font-size:13px;">${avgConsistency(state)}%</span></div>
      </div>
    </div>
  </div>`;
}

function statCard(emoji, label, val, suffix, bg, delta, up) {
  return `<div class="card stat-card">
    <div class="stat-icon" style="background:${bg};font-size:18px;">${emoji}</div>
    <div>
      <div class="stat-val" data-countup="${val}" data-suffix="${suffix}">0${suffix}</div>
      <div class="stat-lbl">${label}</div>
    </div>
    <div class="stat-delta" style="color:${up ? 'var(--success)' : 'var(--danger)'}">${up ? '↑' : '↓'} ${delta}</div>
  </div>`;
}

function habitRow(h) {
  const done = isDoneToday(h);
  return `<div class="habit-item ${done ? 'done' : ''}">
    <div class="checkbox ${done ? 'checked' : ''}" data-action="toggle-habit" data-id="${h.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
    <div class="habit-emoji" style="background:${h.color}22;">${h.emoji}</div>
    <div class="habit-info">
      <p class="habit-name ${done ? 'strike' : ''}">${h.name}</p>
      <div class="habit-meta">
        <span class="tag" style="background:${h.color}1a;color:${h.color};">${h.category}</span>
        <span>${h.time}</span>
      </div>
    </div>
    <div class="streak-mini">🔥 ${h.streak}</div>
    <button class="del-btn" data-action="delete-habit" data-id="${h.id}" aria-label="Delete habit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
    </button>
  </div>`;
}

function emptyState(title, sub, showBtn) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>
    <div style="font-weight:600;font-size:13.5px;color:var(--text-secondary);">${title}</div>
    <div style="font-size:12px;margin-top:4px;">${sub}</div>
    ${showBtn ? `<button class="btn-primary empty-cta" data-action="open-modal" style="margin:16px auto 0;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
      Add your first habit</button>` : ''}
  </div>`;
}

/* ============ RENDER: TODAY ============ */
function renderToday(state) {
  if (!state.habits.length) {
    return `<div class="view">
      <h1 class="page-title">Today's habits</h1>
      <p class="page-sub">Nothing scheduled yet.</p>
      <div class="card">${emptyState('No habits to show', 'Add a habit and it will appear here every day.', true)}</div>
    </div>`;
  }
  const cats = ['All', ...new Set(state.habits.map(h => h.category))];
  const filtered = todayFilter === 'All' ? state.habits : state.habits.filter(h => h.category === todayFilter);
  const done = state.habits.filter(isDoneToday).length;
  return `
  <div class="view">
    <h1 class="page-title">Today's habits</h1>
    <p class="page-sub">${done} of ${state.habits.length} complete · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      ${cats.map(c => `<button class="chip-btn ${todayFilter === c ? 'active' : ''}" data-action="today-filter" data-category="${c}">${c}</button>`).join('')}
    </div>
    <div class="card">
      ${filtered.map(habitRow).join('') || emptyState('No habits in this category', 'Try another filter or add a new habit.', false)}
    </div>
  </div>`;
}

/* ============ RENDER: STATISTICS ============ */
function renderStatistics(state) {
  if (!state.habits.length) {
    return `<div class="view">
      <h1 class="page-title">Statistics</h1>
      <p class="page-sub">No data yet — your charts will fill in as you complete habits.</p>
      <div class="card">${emptyState('Nothing to analyze yet', 'Add and complete a few habits to see trends here.', true)}</div>
    </div>`;
  }
  return `
  <div class="view">
    <h1 class="page-title">Statistics</h1>
    <p class="page-sub">Your consistency and progress at a glance.</p>
    <div class="grid stats-row">
      ${statCard('✅', 'Completion rate', weeklyScore(state), '%', 'var(--success-light)', 'This week', true)}
      ${statCard('📊', 'Consistency', avgConsistency(state), '%', 'var(--accent-light)', 'Last 30 days', true)}
      ${statCard('🔥', 'Longest streak', longestStreakOverall(state), ' days', 'var(--warning-light)', 'All time', true)}
      ${statCard('🎯', 'Productivity', productivityScore(state), '/100', 'var(--danger-light)', 'Score', true)}
    </div>
    <div class="grid two-col" style="grid-template-columns:1fr 1fr;">
      <div class="card chart-card">
        <div class="section-head"><h3>Weekly completions</h3></div>
        <div class="chart-wrap"><canvas id="chart-week" role="img" aria-label="Bar chart of habit completions over the last 7 days"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="section-head"><h3>Habits by category</h3></div>
        <div class="chart-wrap"><canvas id="chart-cat" role="img" aria-label="Pie chart of habits grouped by category"></canvas></div>
      </div>
    </div>
    <div class="grid two-col" style="grid-template-columns:1fr 1fr;margin-top:20px;">
      <div class="card chart-card">
        <div class="section-head"><h3>30 day trend</h3></div>
        <div class="chart-wrap"><canvas id="chart-trend" role="img" aria-label="Line chart of daily completion percentage over 30 days"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="section-head"><h3>Consistency by habit</h3></div>
        <div class="chart-wrap"><canvas id="chart-radar" role="img" aria-label="Radar chart of consistency per habit"></canvas></div>
      </div>
    </div>
  </div>`;
}

function destroyCharts() {
  Object.values(chartInstances).forEach(c => c && c.destroy());
  chartInstances = {};
}

function chartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return { text: dark ? '#9CA3AF' : '#6B7280', grid: dark ? '#1F222C' : '#ECEEF3' };
}

function drawStatCharts(state) {
  if (!state.habits.length) return;
  const cc = chartColors();

  const labels = []; const data = [];
  for (let i = 6; i >= 0; i--) {
    const day = daysAgo(i);
    labels.push(new Date(day).toLocaleDateString('en-US', { weekday: 'short' }));
    data.push(state.habits.filter(h => h.history[day]).length);
  }
  chartInstances.week = new Chart(document.getElementById('chart-week'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Completed', data, backgroundColor: '#6366F1', borderRadius: 6, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: cc.text, stepSize: 1 }, grid: { color: cc.grid } },
        x: { ticks: { color: cc.text }, grid: { display: false } }
      }
    }
  });

  const catCounts = {};
  state.habits.forEach(h => { catCounts[h.category] = (catCounts[h.category] || 0) + 1; });
  chartInstances.cat = new Chart(document.getElementById('chart-cat'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(catCounts),
      datasets: [{ data: Object.values(catCounts), backgroundColor: Object.keys(catCounts).map(c => CATEGORY_COLORS[c] || '#6366F1'), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%', animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { position: 'bottom', labels: { color: cc.text, boxWidth: 10, font: { size: 11 } } } }
    }
  });

  const tLabels = []; const tData = [];
  for (let i = 29; i >= 0; i--) {
    const day = daysAgo(i);
    tLabels.push(new Date(day).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }));
    const doneCount = state.habits.filter(h => h.history[day]).length;
    tData.push(state.habits.length ? Math.round((doneCount / state.habits.length) * 100) : 0);
  }
  chartInstances.trend = new Chart(document.getElementById('chart-trend'), {
    type: 'line',
    data: { labels: tLabels, datasets: [{ label: 'Completion %', data: tData, borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 1000, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { color: cc.text, callback: v => v + '%' }, grid: { color: cc.grid } },
        x: { ticks: { color: cc.text, maxTicksLimit: 6 }, grid: { display: false } }
      }
    }
  });

  chartInstances.radar = new Chart(document.getElementById('chart-radar'), {
    type: 'radar',
    data: {
      labels: state.habits.map(h => h.name.length > 14 ? h.name.slice(0, 14) + '…' : h.name),
      datasets: [{
        label: 'Consistency',
        data: state.habits.map(h => {
          let done = 0;
          for (let i = 0; i < 30; i++) { if (h.history[daysAgo(i)]) done++; }
          return Math.round((done / 30) * 100);
        }),
        backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366F1', pointBackgroundColor: '#6366F1'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: { legend: { display: false } },
      scales: { r: { ticks: { display: false }, grid: { color: cc.grid }, angleLines: { color: cc.grid }, pointLabels: { color: cc.text, font: { size: 10.5 } } } }
    }
  });
}

/* ============ RENDER: CALENDAR ============ */
function renderCalendar() {
  return `
  <div class="view">
    <h1 class="page-title">Calendar</h1>
    <p class="page-sub">A year of consistency, at a glance.</p>
    <div class="card">
      <div class="section-head"><h3>Activity heatmap</h3></div>
      <div class="cal-grid" id="cal-grid"></div>
      <div class="heat-legend">
        <span>Less</span>
        <div class="heat-box" style="background:${heatColor(0)}"></div>
        <div class="heat-box" style="background:${heatColor(0.3)}"></div>
        <div class="heat-box" style="background:${heatColor(0.6)}"></div>
        <div class="heat-box" style="background:${heatColor(1)}"></div>
        <span>More</span>
      </div>
    </div>
  </div>`;
}

function buildCalendarGrid(state) {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;
  const isDark = document.documentElement.classList.contains('dark');
  let html = '';
  for (let i = 370; i >= 0; i--) {
    const day = daysAgo(i);
    const doneCount = state.habits.filter(h => h.history[day]).length;
    const intensity = state.habits.length ? doneCount / state.habits.length : 0;
    html += `<div class="cal-cell" style="background:${heatColor(intensity, isDark)}" data-day="${day}" data-count="${doneCount}"></div>`;
  }
  grid.innerHTML = html;

  const tip = document.getElementById('cal-tooltip');
  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const d = new Date(cell.dataset.day);
      tip.textContent = `${cell.dataset.count} habit(s) — ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      tip.style.opacity = 1;
    });
    cell.addEventListener('mousemove', e => {
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY + 12) + 'px';
    });
    cell.addEventListener('mouseleave', () => tip.style.opacity = 0);
  });
}

/* ============ RENDER: ACHIEVEMENTS ============ */
function renderAchievements(state) {
  const list = achievementsList(state);
  const unlocked = list.filter(a => a.unlocked).length;
  return `
  <div class="view">
    <h1 class="page-title">Achievements</h1>
    <p class="page-sub">${unlocked} of ${list.length} unlocked · Keep going!</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));">
      ${list.map(a => `
        <div class="card badge-card ${a.unlocked ? '' : 'locked'}">
          <div class="badge-icon" style="background:${a.unlocked ? 'var(--accent-light)' : 'var(--border)'};">${a.icon}</div>
          <div class="badge-title">${a.title}</div>
          <div class="badge-desc">${a.desc}</div>
          <div class="badge-xp">${a.unlocked ? '✓ Unlocked' : '+' + a.xp + ' XP'}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ============ RENDER: GOALS ============ */
function renderGoals(state) {
  if (!state.goals.length) {
    return `<div class="view">
      <h1 class="page-title">Goals</h1>
      <p class="page-sub">Set a target and watch your progress build.</p>
      <div class="card">${emptyState('No goals set yet', 'Add habits first — goals track your progress across them.', false)}</div>
    </div>`;
  }
  return `
  <div class="view">
    <h1 class="page-title">Goals</h1>
    <p class="page-sub">Track your bigger picture across days, weeks, months, and years.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">
      ${state.goals.map(g => {
        const pct = Math.min(100, Math.round((g.current / g.target) * 100));
        return `<div class="card goal-card">
          <div class="goal-top"><span class="goal-name">${g.name}</span><span class="goal-pct">${pct}%</span></div>
          <div class="goal-track"><div class="goal-fill" style="width:${pct}%;background:${g.color}"></div></div>
          <div class="goal-meta">${g.period} · ${g.current}/${g.target}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ============ RENDER: SETTINGS ============ */
function renderSettings(account, state) {
  return `
  <div class="view">
    <h1 class="page-title">Settings</h1>
    <p class="page-sub">Manage your profile and preferences.</p>
    <div class="card" style="max-width:480px;">
      <div class="section-head"><h3>Profile</h3></div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
        <div class="avatar" style="width:52px;height:52px;font-size:18px;background:${account.color}">${account.initials}</div>
        <div><div style="font-weight:700;font-size:15px;">${account.name}</div><div style="font-size:12.5px;color:var(--text-secondary);">${account.email}</div></div>
      </div>
      <div class="section-head"><h3>Appearance</h3></div>
      <div class="dark-toggle" style="margin-bottom:4px;">
        <span>Dark mode</span>
        <div class="switch ${state.darkMode ? 'on' : ''}" data-action="toggle-dark-settings"></div>
      </div>
    </div>
  </div>`;
}
