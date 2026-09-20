import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate, empty, rankFor, mastery, scoreAnswer, recordAnswer, finishRound, createStore, KEY, LEGACY_KEY, SESSION_KEY } from '../public/progress.js';

const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};

test('v1 progress migrates without losing history', () => {
  const v1 = { total: 40, correct: 30, best: 900, sessions: 4, days: ['2026-09-18', '2026-09-19'], recent: [{ score: 900, correct: 8, date: '2026-09-19', mode: 'sprint' }], topics: { valuation: { total: 10, correct: 9 }, safe: { total: 10, correct: 4 } } };
  const d = migrate(v1);
  assert.equal(d.v, 2);
  assert.equal(d.total, 40);
  assert.equal(d.correct, 30);
  assert.equal(d.sessions, 4);
  assert.equal(d.bests.sprint.choice, 900);
  assert.equal(d.xp, 3000);
  assert.equal(d.calibrated, true);
  assert.deepEqual(d.days, ['2026-09-18', '2026-09-19']);
  assert.equal(d.recent.length, 1);
  assert.equal(d.topics.valuation.total, 10);
  assert.equal(d.topics.safe.window.length, 6);
  assert.equal(d.topics.safe.window.filter((w) => w.ok).length, 2);
  assert.equal(d.topics.dilution.total, 0);
  assert.ok(d.milestones.first_round);
});

test('store prefers v2, falls back to v1, and tolerates broken storage', () => {
  const s1 = createStore(memoryStorage({ [LEGACY_KEY]: JSON.stringify({ total: 5, correct: 5, best: 300, sessions: 1, topics: {}, days: [], recent: [] }) }));
  assert.equal(s1.data.total, 5);
  assert.ok(s1.saveFailed === false);
  const s2 = createStore(memoryStorage({ [KEY]: JSON.stringify({ v: 2, xp: 700, total: 7, topics: { valuation: { total: 7, correct: 7, window: [] } } }) }));
  assert.equal(s2.data.xp, 700);
  assert.equal(s2.data.topics.safe.total, 0);
  assert.equal(s2.data.settings.haptics, true);
  const s3 = createStore(memoryStorage({ [KEY]: '{not json' }));
  assert.equal(s3.data.total, 0);
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
  const s4 = createStore(throwing);
  assert.equal(s4.data.total, 0);
  s4.save();
  assert.equal(s4.saveFailed, true);
  s4.saveSession({ mode: 'sprint' });
  assert.equal(s4.loadSession(), null);
  const st = memoryStorage();
  const s5 = createStore(st);
  s5.saveSession({ mode: 'sprint', answers: [] });
  assert.equal(s5.loadSession().mode, 'sprint');
  s5.saveSession(null);
  assert.equal(st.map.has(SESSION_KEY), false);
});

test('ranks and xp progress', () => {
  assert.equal(rankFor(0).name, 'Pre-seed');
  assert.equal(rankFor(1499).next.name, 'Seed');
  assert.equal(rankFor(1500).name, 'Seed');
  assert.equal(rankFor(80000).name, 'IPO');
  assert.equal(rankFor(80000).next, null);
  assert.equal(rankFor(3250).progress, 0.5);
});

test('scoring: accuracy first, speed bounded, combos from three in a row', () => {
  assert.deepEqual(scoreAnswer({ ok: false, tier: 3, seconds: 1, limit: 20, streak: 0 }), { base: 0, speed: 0, combo: 0, total: 0 });
  const fast = scoreAnswer({ ok: true, tier: 1, seconds: 1, limit: 20, streak: 1 });
  assert.deepEqual(fast, { base: 100, speed: 40, combo: 0, total: 140 });
  const slow = scoreAnswer({ ok: true, tier: 1, seconds: 19, limit: 20, streak: 1 });
  assert.equal(slow.speed, 0);
  const practice = scoreAnswer({ ok: true, tier: 2, seconds: 3, limit: 0, streak: 2 });
  assert.deepEqual(practice, { base: 125, speed: 0, combo: 0, total: 125 });
  assert.equal(scoreAnswer({ ok: true, tier: 1, seconds: 30, limit: 0, streak: 3 }).combo, 10);
  assert.equal(scoreAnswer({ ok: true, tier: 1, seconds: 30, limit: 0, streak: 7 }).combo, 50);
  assert.equal(scoreAnswer({ ok: true, tier: 1, seconds: 30, limit: 0, streak: 20 }).combo, 50);
  assert.ok(scoreAnswer({ ok: true, tier: 3, seconds: 0, limit: 20, streak: 9 }).total <= 240);
});

test('mastery needs volume, accuracy, and harder questions', () => {
  const t = { window: [] };
  assert.equal(mastery(t).label, 'New');
  t.window = Array.from({ length: 12 }, () => ({ ok: true, t: 1 }));
  assert.equal(mastery(t).label, 'Solid');
  assert.match(mastery(t).next, /harder/);
  t.window = Array.from({ length: 12 }, (_, i) => ({ ok: true, t: i < 3 ? 2 : 1 }));
  assert.equal(mastery(t).label, 'Mastered');
  t.window = Array.from({ length: 12 }, (_, i) => ({ ok: i % 2 === 0, t: 1 }));
  assert.equal(mastery(t).label, 'Learning');
});

test('finishRound records bests per mode and typed flag, milestones, and misses', () => {
  const data = empty();
  const q = (topic) => ({ topic, tier: 1, unit: '%', answer: 1 });
  const session = { mode: 'sprint', typed: false, count: 10, score: 1300, maxStreak: 10, answers: Array.from({ length: 10 }, (_, i) => ({ q: q(i < 8 ? 'valuation' : 'safe'), ok: i < 9, seconds: 3, points: 130 })) };
  for (const a of session.answers) recordAnswer(data, { topic: a.q.topic, tier: 1, ok: a.ok, seconds: a.seconds, points: a.points });
  assert.equal(data.total, 10);
  assert.equal(data.xp, 1300);
  const r = finishRound(data, session, '2026-09-20');
  assert.equal(r.correct, 9);
  assert.equal(r.personalBest, false, 'a first score is not announced as a beaten best');
  assert.equal(data.bests.sprint.choice, 1300);
  assert.equal(data.bests.sprint.typed, 0);
  assert.deepEqual(data.lastMisses, ['safe']);
  assert.ok(r.earned.includes('first_round'));
  assert.ok(r.earned.includes('sharp_sprint'));
  assert.ok(r.earned.includes('combo_8'));
  assert.ok(!r.earned.includes('clean_sheet'));
  assert.deepEqual(data.days, ['2026-09-20']);
  const again = finishRound(data, { ...session, score: 1400 }, '2026-09-20');
  assert.equal(again.personalBest, true);
  assert.equal(again.earned.length, 0, 'milestones are earned once');
  const typed = finishRound(data, { ...session, typed: true, score: 500 }, '2026-09-21');
  assert.equal(typed.personalBest, false);
  assert.equal(data.bests.sprint.typed, 500);
  assert.equal(data.bests.sprint.choice, 1400);
  assert.equal(data.days.length, 2);
  finishRound(data, { ...session, mode: 'daily', count: 8, answers: session.answers.slice(0, 8), score: 700 }, '2026-09-21');
  assert.equal(data.bests.daily['2026-09-21'], 700);
  assert.equal(data.dailies['2026-09-21'], 700);
});
