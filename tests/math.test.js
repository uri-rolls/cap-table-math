import test from 'node:test';
import assert from 'node:assert/strict';
import { formulas as f, topics, TOPIC_IDS, generate, correct, chooseTopic, chooseTier, dailySet, seededRng, round } from '../public/math.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('known financing cases', () => {
  assert.equal(f.ownership(8, 2), 20);
  near(f.preMoneyFor(2, 20), 8);
  near(f.retain(50, 16, 4), 40);
  assert.equal(f.dilute(f.dilute(80, 20), 25), 48);
  near(f.undilute(f.undilute(48, 25), 20), 80);
  assert.equal(f.safe(0.5, 10), 5);
  assert.equal(f.pool(80, 20, 15), 52);
  near(f.effectivePre(10, 2, 15), 8.2);
  assert.equal(f.prorata(10, 5), 0.5);
  near(f.checkFor(10, 15, 20, 5), 1.75);
  assert.equal(f.price(20, 5), 4);
  assert.equal(f.newShares(4, 20, 5), 1);
  assert.equal(f.exit(5, 2, 20), 2);
  assert.equal(f.exit(20, 2, 20), 4);
  assert.equal(f.exit(1, 2, 20), 1);
  near(f.commonProceeds(6, 2, 20, 40), 2);
  near(f.commonProceeds(20, 2, 20, 40), 8);
  assert.equal(f.breakeven(2, 20), 10);
});

test('every topic and tier yields valid, uniquely correct choices', () => {
  for (const topic of TOPIC_IDS) {
    for (const tier of [1, 2, 3]) {
      for (let i = 0; i < 400; i++) {
        const q = generate(topic, { tier });
        assert.equal(q.topic, topic);
        assert.equal(q.tier, tier);
        assert.equal(q.choices.filter((v) => correct(q, v)).length, 1, `${topic} t${tier} ${q.choices}`);
        assert.equal(new Set(q.choices).size, q.choices.length);
        if (q.unit !== 'choice') assert.equal(q.choices.length, 4);
        assert.ok(q.explain && q.trap && q.prompt && q.facts.length >= 2);
        if (typeof q.answer === 'number') {
          assert.ok(Number.isFinite(q.answer) && q.answer > 0);
          assert.equal(q.answer, round(q.answer));
          if (q.unit === '%') assert.ok(q.answer < 100);
          for (const c of q.choices) assert.ok(c > 0 && (q.unit !== '%' || c < 100), `choice ${c}`);
        }
        if (q.viz?.type === 'stake') {
          for (const bar of q.viz.bars) {
            near(bar.segs.reduce((s, x) => s + x.v, 0), 100, 0.11);
            for (const s of bar.segs) assert.ok(s.v >= 0, `negative segment ${topic} t${tier}`);
          }
        }
      }
    }
  }
});

test('the wrong choices reflect real mistakes rather than fixed offsets', () => {
  const rng = seededRng(7);
  const q = generate('valuation', { tier: 1, rng });
  const pre = Number(q.facts[0][1].replace(/[$M]/g, ''));
  const cash = Number(q.facts[1][1].replace(/[$M]/g, ''));
  const dividedByPre = round((100 * cash) / pre);
  assert.ok(q.choices.some((c) => Math.abs(c - dividedByPre) < 0.011), 'divide-by-pre distractor present');
  const d = generate('dilution', { tier: 1, rng });
  const stake = Number(d.facts[0][1].replace('%', ''));
  const [a, b] = d.facts[1][1].match(/\d+/g).map(Number);
  assert.ok(d.choices.some((c) => Math.abs(c - (stake - a - b)) < 0.011), 'subtract-points distractor present');
});

test('deal decisions are not always the same offer', () => {
  for (const tier of [1, 2, 3]) {
    let a = 0;
    for (let i = 0; i < 600; i++) if (generate('decision', { tier }).answer === 'Offer A') a++;
    assert.ok(a > 150 && a < 450, `tier ${tier}: Offer A won ${a}/600`);
  }
});

test('displayed inputs agree with the answer for multi-step questions', () => {
  for (let i = 0; i < 200; i++) {
    const q = generate('pool', { tier: 3 });
    const stake = Number(q.facts[0][1].replace('%', ''));
    const [cash, pre, pool] = q.facts[1][1].match(/[\d.]+/g).map(Number);
    const inv = (100 * cash) / (pre + cash);
    near(q.answer, round(stake * (1 - (inv + pool) / 100)), 0.011);
  }
  for (let i = 0; i < 200; i++) {
    const q = generate('safe', { tier: 3 });
    const [inv, cap] = q.facts[0][1].match(/[\d.]+/g).map(Number);
    const [cash, pre] = q.facts[1][1].match(/[\d.]+/g).map(Number);
    near(q.answer, round(((100 * inv) / cap) * (1 - cash / (pre + cash))), 0.011);
  }
  for (let i = 0; i < 200; i++) {
    const q = generate('prorata', { tier: 3 });
    const [own, target] = q.facts[0][1].match(/[\d.]+/g).map(Number);
    const [raise, pre] = q.facts[1][1].match(/[\d.]+/g).map(Number);
    near(q.answer, round((target / 100) * (pre + raise) - (own / 100) * pre), 0.011);
    assert.ok(q.answer <= raise, 'check fits inside the round');
  }
  for (let i = 0; i < 200; i++) {
    const q = generate('exit', { tier: 2 });
    const [you, inv] = q.facts[0][1].match(/[\d.]+/g).map(Number);
    const [pref, , proceeds] = q.facts[1][1].match(/[\d.]+/g).map(Number);
    near(q.answer, round(f.commonProceeds(proceeds, pref, inv, you)), 0.011);
  }
});

test('numeric parsing and precision', () => {
  const q = { answer: 16.67, unit: '%' };
  assert.equal(correct(q, '16.67'), true);
  assert.equal(correct(q, ''), false);
  assert.equal(correct(q, null), false);
  assert.equal(correct(q, 'no'), false);
  assert.equal(correct(q, '16'), false);
  assert.equal(correct(q, '16.7'), false);
  assert.equal(correct({ answer: 'Offer A', unit: 'choice' }, 'Offer A'), true);
});

test('weak topics receive more weight and topics do not repeat back to back', () => {
  const stats = Object.fromEntries(TOPIC_IDS.map((k) => [k, { total: 10, correct: 10 }]));
  stats.safe.correct = 0;
  const rng = seededRng(1);
  const counts = {};
  for (let i = 0; i < 10000; i++) {
    const k = chooseTopic(stats, rng);
    counts[k] = (counts[k] || 0) + 1;
  }
  assert.ok(counts.safe > counts.valuation * 3);
  for (let i = 0; i < 500; i++) assert.notEqual(chooseTopic(stats, rng, { exclude: 'safe' }), 'safe');
  assert.equal(chooseTopic(stats, rng, { pool: ['pool'] }), 'pool');
});

test('difficulty follows recent accuracy', () => {
  const rng = seededRng(3);
  assert.equal(chooseTier([], rng), 1);
  const strong = Array.from({ length: 10 }, () => ({ ok: true, t: 1 }));
  const weak = Array.from({ length: 10 }, () => ({ ok: false, t: 1 }));
  let hard = 0;
  let easy = 0;
  for (let i = 0; i < 1000; i++) {
    if (chooseTier(strong, rng) === 3) hard++;
    if (chooseTier(weak, rng) === 1) easy++;
  }
  assert.ok(hard > 400 && easy > 700);
});

test('daily set is deterministic per date and covers mixed topics', () => {
  const a = dailySet('2026-09-20');
  const b = dailySet('2026-09-20');
  const c = dailySet('2026-09-21');
  assert.deepEqual(a.map((q) => [q.topic, q.tier, q.answer]), b.map((q) => [q.topic, q.tier, q.answer]));
  assert.notDeepEqual(a.map((q) => q.answer), c.map((q) => q.answer));
  assert.equal(a.length, 8);
  assert.equal(new Set(a.map((q) => q.topic)).size, 8);
  assert.ok(Object.keys(topics).length === 8);
});
