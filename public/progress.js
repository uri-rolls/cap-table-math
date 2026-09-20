// Progress: storage, migration, XP and ranks, topic mastery, milestones, daily challenge.
import { TOPIC_IDS } from './math.js';

export const KEY = 'captable-progress-v2';
export const LEGACY_KEY = 'captable-progress-v1';
export const SESSION_KEY = 'captable-session-v2';
const WINDOW = 12;

export const RANKS = [
  { name: 'Pre-seed', xp: 0 },
  { name: 'Seed', xp: 1500 },
  { name: 'Series A', xp: 5000 },
  { name: 'Series B', xp: 12000 },
  { name: 'Series C', xp: 25000 },
  { name: 'Growth', xp: 45000 },
  { name: 'IPO', xp: 75000 },
];

export const MILESTONES = {
  first_round: { name: 'First round closed', how: 'Finish any round.' },
  clean_sheet: { name: 'Clean sheet', how: 'Get every question right in a 10-question round.' },
  sharp_sprint: { name: 'Sharp sprint', how: 'Score 1,200 or more in a Sprint.' },
  combo_8: { name: 'Eight in a row', how: 'Answer 8 questions correctly in a row in one round.' },
  typed_9: { name: 'No training wheels', how: 'Type your answers and get 9 of 10 right.' },
  daily_5: { name: 'Five dailies', how: 'Complete the daily challenge on 5 different days.' },
  deal_maker: { name: 'Deal maker', how: 'Get 10 of 10 in the Deal room.' },
  first_mastery: { name: 'First mastery', how: 'Master any topic.' },
  all_mastery: { name: 'Full stack', how: 'Master all eight topics.' },
  days_10: { name: 'Ten days', how: 'Train on 10 different days.' },
};

export const MASTERY_LEVELS = ['New', 'Learning', 'Working', 'Solid', 'Mastered'];

export const todayKey = (d = new Date()) => d.toLocaleDateString('en-CA');

const emptyTopic = () => ({ total: 0, correct: 0, window: [] });

export const empty = () => ({
  v: 2,
  xp: 0,
  total: 0,
  correct: 0,
  sessions: 0,
  days: [],
  recent: [],
  bests: { sprint: { choice: 0, typed: 0 }, deals: { choice: 0 }, daily: {} },
  topics: Object.fromEntries(TOPIC_IDS.map((k) => [k, emptyTopic()])),
  milestones: {},
  dailies: {},
  calibrated: false,
  lastMisses: [],
  settings: { sound: false, haptics: true, typed: false, focus: 'all' },
});

export function migrate(raw) {
  const d = empty();
  if (!raw || typeof raw !== 'object') return d;
  if (raw.v === 2) {
    const merged = { ...d, ...raw };
    merged.bests = { ...d.bests, ...(raw.bests || {}) };
    merged.bests.sprint = { ...d.bests.sprint, ...(merged.bests.sprint || {}) };
    merged.bests.deals = { ...d.bests.deals, ...(merged.bests.deals || {}) };
    merged.settings = { ...d.settings, ...(raw.settings || {}) };
    merged.topics = Object.fromEntries(TOPIC_IDS.map((k) => [k, { ...emptyTopic(), ...(raw.topics?.[k] || {}) }]));
    if (!Array.isArray(merged.days)) merged.days = [];
    if (!Array.isArray(merged.recent)) merged.recent = [];
    return merged;
  }
  // v1 → v2
  d.total = Number(raw.total) || 0;
  d.correct = Number(raw.correct) || 0;
  d.sessions = Number(raw.sessions) || 0;
  d.days = Array.isArray(raw.days) ? raw.days.slice(-365) : [];
  d.recent = Array.isArray(raw.recent) ? raw.recent.slice(0, 20) : [];
  d.bests.sprint.choice = Number(raw.best) || 0;
  d.xp = d.correct * 100;
  d.calibrated = d.total > 0;
  for (const k of TOPIC_IDS) {
    const t = raw.topics?.[k];
    if (!t) continue;
    d.topics[k].total = Number(t.total) || 0;
    d.topics[k].correct = Number(t.correct) || 0;
    // Seed the rolling window from lifetime accuracy so difficulty starts in the right place.
    const n = Math.min(d.topics[k].total, 6);
    const okCount = d.topics[k].total ? Math.round((n * d.topics[k].correct) / d.topics[k].total) : 0;
    d.topics[k].window = Array.from({ length: n }, (_, i) => ({ ok: i < okCount, t: 1, s: 12 }));
  }
  if (d.sessions) d.milestones.first_round = d.days[d.days.length - 1] || todayKey();
  return d;
}

export function createStore(storage) {
  let data = empty();
  let failed = false;
  const read = (k) => {
    try {
      const s = storage?.getItem(k);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  const v2 = read(KEY);
  if (v2) data = migrate(v2);
  else {
    const v1 = read(LEGACY_KEY);
    data = migrate(v1);
  }
  const save = () => {
    try {
      storage.setItem(KEY, JSON.stringify(data));
      failed = false;
    } catch {
      failed = true;
    }
  };
  if (!v2) save();
  return {
    get data() { return data; },
    save,
    get saveFailed() { return failed; },
    loadSession() { return read(SESSION_KEY); },
    saveSession(s) {
      try {
        if (s) storage.setItem(SESSION_KEY, JSON.stringify(s));
        else storage.removeItem(SESSION_KEY);
      } catch { /* storage unavailable: play continues without resume */ }
    },
  };
}

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i];
  const next = RANKS[i + 1] || null;
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { index: i, name: cur.name, next, toNext: next ? next.xp - xp : 0, progress: Math.max(0, Math.min(1, progress)) };
}

export function mastery(topic) {
  const w = (topic?.window || []).slice(-WINDOW);
  const n = w.length;
  const ok = w.filter((r) => r.ok).length;
  const hardOk = w.filter((r) => r.ok && r.t >= 2).length;
  const acc = n ? ok / n : 0;
  let level = 0;
  if (n >= 3) level = acc < 0.6 ? 1 : acc < 0.8 ? 2 : 3;
  if (n >= 10 && acc >= 0.9 && hardOk >= 3) level = 4;
  let next;
  if (level === 0) next = `${3 - n} more to rate`;
  else if (level < 3) next = 'Reach 80% on your last 12';
  else if (level === 3) {
    const needs = [];
    if (n < 10) needs.push(`${10 - n} more answers`);
    if (acc < 0.9) needs.push('90% on your last 12');
    if (hardOk < 3) needs.push(`${3 - hardOk} more harder ones right`);
    next = needs.join(', ');
  } else next = 'Keep it sharp';
  return { level, label: MASTERY_LEVELS[level], acc, n, hardOk, next };
}

// Scoring: base by tier, speed bonus in timed modes, combo bonus for streaks.
export function scoreAnswer({ ok, tier, seconds, limit, streak }) {
  if (!ok) return { base: 0, speed: 0, combo: 0, total: 0 };
  const base = { 1: 100, 2: 125, 3: 150 }[tier] || 100;
  let speed = 0;
  if (limit && Number.isFinite(seconds)) {
    // Full bonus within 2 seconds, nothing in the last second.
    speed = Math.round(40 * Math.max(0, Math.min(1, (limit - 1 - seconds) / (limit - 3))));
  }
  const combo = streak >= 3 ? 10 * Math.min(streak - 2, 5) : 0;
  return { base, speed, combo, total: base + speed + combo };
}

export function recordAnswer(data, { topic, tier, ok, seconds, points }) {
  data.total++;
  data.correct += ok ? 1 : 0;
  data.xp += points;
  const t = data.topics[topic] || (data.topics[topic] = emptyTopic());
  t.total++;
  t.correct += ok ? 1 : 0;
  t.window.push({ ok, t: tier, s: Math.round(Math.min(seconds || 0, 60) * 10) / 10 });
  if (t.window.length > WINDOW) t.window = t.window.slice(-WINDOW);
}

export function bestKey(session) {
  if (session.mode === 'sprint') return ['sprint', session.typed ? 'typed' : 'choice'];
  if (session.mode === 'deals') return ['deals', 'choice'];
  return null;
}

// Finalize a round. Returns a recap with newly earned milestones and personal-best status.
export function finishRound(data, session, dateKey = todayKey()) {
  const answers = session.answers;
  const n = answers.filter((a) => a.ok).length;
  const before = { rank: rankFor(data.xp - session.score).index, masteries: Object.fromEntries(TOPIC_IDS.map((k) => [k, mastery(data.topics[k]).level])) };
  data.sessions++;
  if (!data.days.includes(dateKey)) data.days.push(dateKey);
  data.days = data.days.slice(-365);
  data.recent.unshift({ score: session.score, correct: n, count: answers.length, date: dateKey, mode: session.mode, typed: !!session.typed });
  data.recent = data.recent.slice(0, 30);

  let personalBest = false;
  const bk = bestKey(session);
  if (bk && answers.length >= 10) {
    const prev = data.bests[bk[0]][bk[1]] || 0;
    if (session.score > prev) {
      personalBest = prev > 0;
      data.bests[bk[0]][bk[1]] = session.score;
    }
  }
  if (session.mode === 'daily') {
    const prev = data.bests.daily[dateKey] || 0;
    if (session.score > prev) {
      personalBest = prev > 0;
      data.bests.daily[dateKey] = session.score;
    }
    data.dailies[dateKey] = Math.max(data.dailies[dateKey] || 0, session.score);
  }
  if (session.mode === 'calibrate') data.calibrated = true;
  data.calibrated = data.calibrated || data.total >= 6;

  const misses = answers.filter((a) => !a.ok).map((a) => a.q.topic);
  data.lastMisses = [...new Set(misses)];

  const earned = [];
  const award = (id) => {
    if (!data.milestones[id]) {
      data.milestones[id] = dateKey;
      earned.push(id);
    }
  };
  award('first_round');
  if (answers.length >= 10 && n === answers.length) award('clean_sheet');
  if (session.mode === 'sprint' && session.score >= 1200) award('sharp_sprint');
  if (session.maxStreak >= 8) award('combo_8');
  if (session.typed && answers.length >= 10 && n >= 9) award('typed_9');
  if (Object.keys(data.dailies).length >= 5) award('daily_5');
  if (session.mode === 'deals' && answers.length >= 10 && n === 10) award('deal_maker');
  const levels = TOPIC_IDS.map((k) => mastery(data.topics[k]).level);
  if (levels.some((l) => l === 4)) award('first_mastery');
  if (levels.every((l) => l === 4)) award('all_mastery');
  if (data.days.length >= 10) award('days_10');

  const after = rankFor(data.xp);
  const masteryUps = TOPIC_IDS.filter((k) => mastery(data.topics[k]).level > before.masteries[k]);
  return { correct: n, count: answers.length, personalBest, earned, rankUp: after.index > before.rank ? after.name : null, masteryUps };
}

export function weekDots(days, now = new Date()) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const k = todayKey(d);
    out.push({ key: k, done: days.includes(k), today: i === 0 });
  }
  return out;
}
