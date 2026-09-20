// Cap table math: question generation, formulas, and answer validation.
// Every question states the assumptions that determine its answer.
// Contracts:
//  - Post-money = pre-money + new cash.
//  - Dilution compounds multiplicatively.
//  - Post-money SAFEs convert at the cap; the priced round then dilutes the SAFE stake.
//  - Pool questions start with no existing pool; the pool is a pre-money carve-out
//    measured as a final post-round percentage.
//  - Pro-rata round totals include the participant's own check.
//  - Exit questions: one preferred class, net distributable proceeds, 1× non-participating.
//  - Deal comparisons optimize ownership only.

export const topics = {
  valuation: {
    name: 'Valuation',
    short: 'Valuation',
    rule: 'Post-money = pre-money + new cash. New investor ownership = new cash ÷ post-money.',
  },
  dilution: {
    name: 'Dilution',
    short: 'Dilution',
    rule: 'Multiply what you own by what you keep. Two rounds of 20% dilution leave 80% × 80% = 64% of your original stake.',
  },
  safe: {
    name: 'Post-money SAFEs',
    short: 'SAFEs',
    rule: 'When the cap determines conversion: ownership before the priced round = investment ÷ post-money cap. The priced round dilutes that stake.',
  },
  pool: {
    name: 'Option pools',
    short: 'Pools',
    rule: 'A new pool carved out of the pre-money comes from existing holders. With no existing pool: old holders keep 100% − investor % − final pool %.',
  },
  prorata: {
    name: 'Pro rata',
    short: 'Pro rata',
    rule: 'To maintain your stake, invest your current ownership × total new cash in the round (including your check).',
  },
  price: {
    name: 'Share price',
    short: 'Price',
    rule: 'Price per share = pre-money valuation ÷ pre-round fully diluted shares. New shares = new cash ÷ price per share.',
  },
  exit: {
    name: 'Exit waterfall',
    short: 'Exits',
    rule: 'With 1× non-participating preferred, the investor takes the larger of their investment or their as-converted share of proceeds, capped at total proceeds.',
  },
  decision: {
    name: 'Deal decisions',
    short: 'Deals',
    rule: 'Compare what you retain after both the investment and any pool carve-out. A higher headline valuation can still leave you with less.',
  },
};

export const TOPIC_IDS = Object.keys(topics);
export const TIERS = { 1: 'Clean', 2: 'Messy', 3: 'Multi-step' };

export const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(round(n));
export const money = (n) => `$${fmt(n)}M`;
export const pct = (n) => `${fmt(n)}%`;

export const formulas = {
  ownership: (pre, cash) => (100 * cash) / (pre + cash),
  preMoneyFor: (cash, ownershipPct) => cash / (ownershipPct / 100) - cash,
  retain: (stake, pre, cash) => (stake * pre) / (pre + cash),
  dilute: (stake, sold) => stake * (1 - sold / 100),
  undilute: (stake, sold) => stake / (1 - sold / 100),
  safe: (cash, cap) => (100 * cash) / cap,
  pool: (stake, investor, pool) => stake * (1 - (investor + pool) / 100),
  effectivePre: (pre, cash, poolPct) => pre - (poolPct / 100) * (pre + cash),
  prorata: (stake, cash) => (stake / 100) * cash,
  checkFor: (stake, target, pre, cash) => (target / 100) * (pre + cash) - (stake / 100) * pre,
  price: (pre, shares) => pre / shares,
  newShares: (cash, pre, shares) => cash / (pre / shares),
  exit: (proceeds, invested, stake) => Math.min(proceeds, Math.max(invested, (proceeds * stake) / 100)),
  commonProceeds: (proceeds, invested, invStake, yourStake) => {
    const investor = formulas.exit(proceeds, invested, invStake);
    return ((proceeds - investor) * yourStake) / (100 - invStake);
  },
  breakeven: (invested, stake) => invested / (stake / 100),
};

// Deterministic PRNG (mulberry32) for seeded daily challenges.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pickWith = (rng) => (xs) => xs[Math.floor(rng() * xs.length)];

// Unit rendering. Units: '%', '$M', '$' (per share), 'shares' (millions), 'choice'.
export function display(value, unit) {
  if (unit === 'choice') return value;
  if (unit === '$M') return money(value);
  if (unit === '$') return `$${fmt(value)}`;
  if (unit === 'shares') return `${fmt(value)}M shares`;
  return pct(value);
}

export const unitLabel = {
  '%': 'as a percentage',
  $M: 'in millions of dollars',
  $: 'in dollars per share',
  shares: 'in millions of shares',
};

export const unitHint = {
  '%': 'Enter just the number.',
  $M: '$500,000 = 0.5 in this field.',
  $: 'Dollars per share, like 2.5.',
  shares: '4,000,000 shares = 4 in this field.',
};

// Stake bar helpers for the visual explanation.
const seg = (k, v, label) => ({ k, v: round(v), label });
const stakeBars = (before, after) => ({ type: 'stake', bars: [before, after] });

const generators = {
  valuation(tier, p) {
    if (tier === 1) {
      const pre = p([6, 8, 12, 16, 20, 24, 30, 40]);
      const cash = round(pre / p([2, 3, 4, 5]));
      const answer = formulas.ownership(pre, cash);
      const post = pre + cash;
      return {
        prompt: `You raise ${money(cash)} at a ${money(pre)} pre-money valuation. What does the new investor own after closing?`,
        facts: [['Pre-money', money(pre)], ['New cash', money(cash)]],
        answer, unit: '%',
        explain: `Post-money is ${money(pre)} + ${money(cash)} = ${money(post)}. ${money(cash)} ÷ ${money(post)} = ${pct(answer)}.`,
        trap: 'Divide by post-money, not pre-money.',
        wrongs: [(100 * cash) / pre, (100 * pre) / post, (100 * cash) / (post + cash)],
        viz: stakeBars(
          { label: `Pre-money ${money(pre)}`, segs: [seg('you', 100, 'Existing')] },
          { label: `Post-money ${money(post)}`, segs: [seg('you', 100 - answer, 'Existing'), seg('new', answer, 'Investor')] },
        ),
      };
    }
    if (tier === 2) {
      const cash = p([1.5, 2, 2.5, 3, 4, 5, 6]);
      const own = p([10, 12.5, 15, 20, 25]);
      const answer = formulas.preMoneyFor(cash, own);
      const post = cash / (own / 100);
      return {
        prompt: `An investor offers ${money(cash)} and wants ${pct(own)} after closing. What pre-money valuation does that imply?`,
        facts: [['New cash', money(cash)], ['Investor wants', pct(own)]],
        answer, unit: '$M',
        explain: `Post-money = ${money(cash)} ÷ ${fmt(own / 100)} = ${money(post)}. Pre-money = ${money(post)} − ${money(cash)} = ${money(answer)}.`,
        trap: 'The percentage is of the post-money. Back out the cash to get the pre-money.',
        wrongs: [post, post + cash, cash / (own / 100) * (1 - own / 100) + cash],
        viz: stakeBars(
          { label: `Pre-money ${money(answer)}`, segs: [seg('you', 100, 'Existing')] },
          { label: `Post-money ${money(post)}`, segs: [seg('you', 100 - own, 'Existing'), seg('new', own, 'Investor')] },
        ),
      };
    }
    const stake = p([35, 40, 45, 50, 60, 70]);
    const pre = p([9, 12, 15, 18, 21, 25, 35]);
    const cash = p([3, 4, 5, 6, 7]);
    const post = pre + cash;
    const answer = formulas.retain(stake, pre, cash);
    const investor = formulas.ownership(pre, cash);
    return {
      prompt: `You own ${pct(stake)} today. The company raises ${money(cash)} at a ${money(pre)} pre-money valuation. What do you own after closing?`,
      facts: [['Your stake', pct(stake)], ['Round', `${money(cash)} at ${money(pre)} pre`]],
      answer, unit: '%',
      explain: `Investor gets ${money(cash)} ÷ ${money(post)} = ${pct(investor)}. You keep ${pct(stake)} × ${fmt(pre)}/${fmt(post)} = ${pct(answer)}.`,
      trap: 'Your stake scales by pre ÷ post. Don’t subtract the investor’s points from yours.',
      wrongs: [stake - investor, stake * (1 - cash / pre), stake - cash],
      viz: stakeBars(
        { label: 'Before', segs: [seg('you', stake, 'You'), seg('other', 100 - stake, 'Others')] },
        { label: 'After', segs: [seg('you', answer, 'You'), seg('other', 100 - stake - (investor - (stake - answer)), 'Others'), seg('new', investor, 'Investor')] },
      ),
    };
  },

  dilution(tier, p) {
    const stake = p([40, 50, 60, 70, 80]);
    if (tier === 1) {
      const a = p([10, 20, 25]);
      const b = p([10, 20, 25]);
      const answer = formulas.dilute(formulas.dilute(stake, a), b);
      return {
        prompt: `You own ${pct(stake)}. A seed round sells ${pct(a)} of the company, then a Series A sells ${pct(b)}. What do you own now?`,
        facts: [['Your stake', pct(stake)], ['Two rounds', `${pct(a)} then ${pct(b)}`]],
        answer, unit: '%',
        explain: `${pct(stake)} × ${fmt(1 - a / 100)} × ${fmt(1 - b / 100)} = ${pct(answer)}.`,
        trap: 'Dilution compounds. Don’t subtract percentage points from your stake.',
        wrongs: [stake - a - b, stake * (1 - (a + b) / 100), formulas.dilute(stake, a)],
        viz: stakeBars(
          { label: 'Today', segs: [seg('you', stake, 'You'), seg('other', 100 - stake, 'Others')] },
          { label: 'After Series A', segs: [seg('you', answer, 'You'), seg('other', (100 - stake) * (1 - a / 100) * (1 - b / 100), 'Others'), seg('new', 100 - (100 * (1 - a / 100) * (1 - b / 100)), 'New investors')] },
        ),
      };
    }
    if (tier === 2) {
      const a = p([10, 15, 20]);
      const b = p([15, 20, 25]);
      const c = p([10, 15, 20]);
      const answer = formulas.dilute(formulas.dilute(formulas.dilute(stake, a), b), c);
      return {
        prompt: `You own ${pct(stake)}. Three rounds sell ${pct(a)}, ${pct(b)}, and ${pct(c)} of the company. What do you own after the third?`,
        facts: [['Your stake', pct(stake)], ['Three rounds', `${pct(a)}, ${pct(b)}, ${pct(c)}`]],
        answer, unit: '%',
        explain: `${pct(stake)} × ${fmt(1 - a / 100)} × ${fmt(1 - b / 100)} × ${fmt(1 - c / 100)} = ${pct(answer)}.`,
        trap: 'Each round multiplies what is left. Three rounds means three factors.',
        wrongs: [stake - a - b - c, stake * (1 - (a + b + c) / 100), formulas.dilute(formulas.dilute(stake, a), b)],
        viz: stakeBars(
          { label: 'Today', segs: [seg('you', stake, 'You'), seg('other', 100 - stake, 'Others')] },
          { label: 'After three rounds', segs: [seg('you', answer, 'You'), seg('other', (100 - stake) * (answer / stake), 'Others'), seg('new', 100 - 100 * (answer / stake), 'New investors')] },
        ),
      };
    }
    const a = p([20, 25]);
    const b = p([20, 25]);
    const end = p([24, 27, 30, 36, 45]);
    const answer = formulas.undilute(formulas.undilute(end, b), a);
    return {
      prompt: `After a seed round sold ${pct(a)} and a Series A sold ${pct(b)}, you own ${pct(end)}. What did you own before both rounds?`,
      facts: [['Rounds sold', `${pct(a)} then ${pct(b)}`], ['You own now', pct(end)]],
      answer, unit: '%',
      explain: `Work backwards: ${pct(end)} ÷ ${fmt(1 - b / 100)} ÷ ${fmt(1 - a / 100)} = ${pct(answer)}.`,
      trap: 'Reverse dilution by dividing by what you kept, not by adding points back.',
      wrongs: [end + a + b, end / (1 - (a + b) / 100), end * (1 + a / 100) * (1 + b / 100)],
      viz: stakeBars(
        { label: 'Before both rounds', segs: [seg('you', answer, 'You'), seg('other', 100 - answer, 'Others')] },
        { label: 'Now', segs: [seg('you', end, 'You'), seg('other', (100 - answer) * (end / answer), 'Others'), seg('new', 100 - 100 * (end / answer), 'New investors')] },
      ),
    };
  },

  safe(tier, p) {
    if (tier === 1) {
      const cap = p([5, 8, 10, 12, 20]);
      const investment = round(cap * p([0.05, 0.1, 0.15]));
      const d = p([10, 20, 25]);
      const before = formulas.safe(investment, cap);
      const answer = formulas.dilute(before, d);
      return {
        prompt: `A ${money(investment)} post-money SAFE has a ${money(cap)} cap. It converts at the cap, then new money buys ${pct(d)} of the company. What does the SAFE investor own after the round?`,
        facts: [['SAFE / cap', `${money(investment)} / ${money(cap)}`], ['New money buys', pct(d)]],
        answer, unit: '%',
        explain: `Before new money: ${money(investment)} ÷ ${money(cap)} = ${pct(before)}. Then × ${fmt(1 - d / 100)} = ${pct(answer)}.`,
        trap: 'A post-money SAFE percentage is measured before the priced-round money.',
        assumption: 'Cap controls conversion; no discount, pool increase, or other securities.',
        wrongs: [before, before - d, formulas.dilute((100 * investment) / (cap + investment), d)],
        viz: stakeBars(
          { label: 'SAFE converts', segs: [seg('new', before, 'SAFE'), seg('you', 100 - before, 'Existing')] },
          { label: 'After priced round', segs: [seg('new', answer, 'SAFE'), seg('you', (100 - before) * (1 - d / 100), 'Existing'), seg('pool', d, 'New money')] },
        ),
      };
    }
    if (tier === 2) {
      const cap1 = p([5, 6, 8, 10]);
      const cap2 = p([12, 15, 16, 20]);
      const inv1 = round(cap1 * p([0.05, 0.1]));
      const inv2 = round(cap2 * p([0.05, 0.1, 0.125]));
      const s1 = formulas.safe(inv1, cap1);
      const s2 = formulas.safe(inv2, cap2);
      const answer = s1 + s2;
      return {
        prompt: `Two post-money SAFEs convert at their caps: ${money(inv1)} at a ${money(cap1)} cap and ${money(inv2)} at a ${money(cap2)} cap. What do the two SAFE holders own together before the priced-round money?`,
        facts: [['SAFE 1', `${money(inv1)} / ${money(cap1)} cap`], ['SAFE 2', `${money(inv2)} / ${money(cap2)} cap`]],
        answer, unit: '%',
        explain: `Each SAFE is its own investment ÷ its own cap: ${pct(s1)} + ${pct(s2)} = ${pct(answer)}.`,
        trap: 'Each post-money SAFE is priced off its own cap. Add the percentages; don’t pool the dollars.',
        assumption: 'Each SAFE converts at its cap; no discounts, pool increase, or other securities. Percentages are measured before new priced-round money.',
        wrongs: [(100 * (inv1 + inv2)) / cap1, (100 * (inv1 + inv2)) / cap2, (100 * (inv1 + inv2)) / (cap1 + cap2)],
        viz: stakeBars(
          { label: 'Before SAFEs', segs: [seg('you', 100, 'Existing')] },
          { label: 'SAFEs converted', segs: [seg('you', 100 - answer, 'Existing'), seg('new', s1, 'SAFE 1'), seg('pool', s2, 'SAFE 2')] },
        ),
      };
    }
    const cap = p([8, 10, 12, 15, 20]);
    const investment = round(cap * p([0.05, 0.1, 0.15]));
    const pre = p([16, 20, 24, 30, 40]);
    const cash = p([4, 5, 6, 8, 10]);
    const before = formulas.safe(investment, cap);
    const d = formulas.ownership(pre, cash);
    const answer = formulas.dilute(before, d);
    return {
      prompt: `A ${money(investment)} post-money SAFE (${money(cap)} cap) converts at the cap. The priced round raises ${money(cash)} at a ${money(pre)} pre-money that already includes the converted SAFE. What does the SAFE investor own after closing?`,
      facts: [['SAFE / cap', `${money(investment)} / ${money(cap)}`], ['Priced round', `${money(cash)} at ${money(pre)} pre`]],
      answer, unit: '%',
      explain: `SAFE stake before new money: ${money(investment)} ÷ ${money(cap)} = ${pct(before)}. New money buys ${money(cash)} ÷ ${money(pre + cash)} = ${pct(d)}. ${pct(before)} × ${fmt(1 - d / 100)} = ${pct(answer)}.`,
      trap: 'Two steps: the cap sets the SAFE stake, then the priced round dilutes it by pre ÷ post.',
      assumption: 'Cap controls conversion; no discount or pool increase. The pre-money is fully diluted including the SAFE shares.',
      wrongs: [before, formulas.dilute(before, (100 * cash) / pre), (100 * investment) / (pre + cash)],
      viz: stakeBars(
        { label: 'SAFE converts', segs: [seg('new', before, 'SAFE'), seg('you', 100 - before, 'Existing')] },
        { label: 'After priced round', segs: [seg('new', answer, 'SAFE'), seg('you', (100 - before) * (1 - d / 100), 'Existing'), seg('pool', d, 'New money')] },
      ),
    };
  },

  pool(tier, p) {
    if (tier === 1) {
      const stake = p([40, 50, 60, 70, 80]);
      const inv = p([10, 20, 25]);
      const pool = p([10, 15, 20]);
      const answer = formulas.pool(stake, inv, pool);
      return {
        prompt: `You own ${pct(stake)} today. New investors will own ${pct(inv)} after closing. A new option pool, carved out of the pre-money, will be ${pct(pool)} after closing. Your final stake?`,
        facts: [['Investor', `${pct(inv)} final`], ['New pool', `${pct(pool)} final`]],
        answer, unit: '%',
        explain: `Existing holders together keep ${pct(100 - inv - pool)}. Your ${pct(stake)} of that: ${pct(stake)} × ${fmt((100 - inv - pool) / 100)} = ${pct(answer)}.`,
        trap: 'Both percentages are final ownership. The pre-money pool comes out of existing holders.',
        assumption: 'No existing option pool, SAFEs, or other changes.',
        wrongs: [formulas.dilute(stake, inv), stake - inv - pool, formulas.dilute(formulas.dilute(stake, inv), pool)],
        viz: stakeBars(
          { label: 'Before', segs: [seg('you', stake, 'You'), seg('other', 100 - stake, 'Others')] },
          { label: 'After', segs: [seg('you', answer, 'You'), seg('other', formulas.pool(100 - stake, inv, pool), 'Others'), seg('pool', pool, 'Pool'), seg('new', inv, 'Investor')] },
        ),
      };
    }
    if (tier === 2) {
      const pre = p([8, 10, 12, 16, 20, 24]);
      const cash = p([2, 3, 4, 5, 6]);
      const pool = p([10, 15, 20]);
      const post = pre + cash;
      const answer = formulas.effectivePre(pre, cash, pool);
      return {
        prompt: `A term sheet says ${money(pre)} pre-money for ${money(cash)}, with a new ${pct(pool)} option pool (measured post-closing) carved out of the pre-money. What is the effective pre-money for existing holders?`,
        facts: [['Headline', `${money(pre)} pre, ${money(cash)} in`], ['Pool', `${pct(pool)} final, pre-money`]],
        answer, unit: '$M',
        explain: `Post-money is ${money(post)}, so the pool is worth ${pct(pool)} × ${money(post)} = ${money((pool / 100) * post)}. Effective pre = ${money(pre)} − ${money((pool / 100) * post)} = ${money(answer)}.`,
        trap: 'Price the pool off the post-money, then take it out of the headline pre-money.',
        assumption: 'No existing pool. The whole pool is new and comes out of existing holders.',
        wrongs: [pre - (pool / 100) * pre, pre, pre - (pool / 100) * cash],
        viz: stakeBars(
          { label: `Headline pre ${money(pre)}`, segs: [seg('you', 100, 'Existing')] },
          { label: `Post-money ${money(post)}`, segs: [seg('you', (100 * answer) / post, 'Existing'), seg('pool', pool, 'Pool'), seg('new', (100 * cash) / post, 'Investor')] },
        ),
      };
    }
    const stake = p([40, 50, 60, 70]);
    const pre = p([12, 16, 20, 24, 30]);
    const cash = p([4, 5, 6, 8]);
    const pool = p([10, 12, 15]);
    const inv = formulas.ownership(pre, cash);
    const answer = formulas.pool(stake, inv, pool);
    return {
      prompt: `You own ${pct(stake)}. The company raises ${money(cash)} at a ${money(pre)} pre-money, and a new ${pct(pool)} option pool (measured post-closing) is carved out of the pre-money. Your stake after closing?`,
      facts: [['Your stake', pct(stake)], ['Round', `${money(cash)} at ${money(pre)} pre, ${pct(pool)} pool`]],
      answer, unit: '%',
      explain: `Investor: ${money(cash)} ÷ ${money(pre + cash)} = ${pct(inv)}. Existing holders keep ${pct(100 - inv - pool)}. ${pct(stake)} × ${fmt((100 - inv - pool) / 100)} = ${pct(answer)}.`,
      trap: 'First find the investor’s share from the valuation, then take both the investor and the pool out of the old holders.',
      assumption: 'No existing pool, SAFEs, or other securities.',
      wrongs: [formulas.dilute(stake, inv), stake * (1 - cash / pre - pool / 100), stake - inv - pool],
      viz: stakeBars(
        { label: 'Before', segs: [seg('you', stake, 'You'), seg('other', 100 - stake, 'Others')] },
        { label: 'After', segs: [seg('you', answer, 'You'), seg('other', formulas.pool(100 - stake, inv, pool), 'Others'), seg('pool', pool, 'Pool'), seg('new', inv, 'Investor')] },
      ),
    };
  },

  prorata(tier, p) {
    if (tier === 1) {
      const own = p([5, 10, 15, 20]);
      const raise = p([2, 4, 5, 8, 10]);
      const answer = formulas.prorata(own, raise);
      return {
        prompt: `You own ${pct(own)} and want to maintain it in a ${money(raise)} round. How much must you invest?`,
        facts: [['Current stake', pct(own)], ['Total round', money(raise)]],
        answer, unit: '$M',
        explain: `${pct(own)} × ${money(raise)} = ${money(answer)}. Your check is part of the ${money(raise)}.`,
        trap: 'The total round includes your check.',
        assumption: 'Same price for all new cash; no pool increase or conversions.',
        wrongs: [(own / 100) * raise / (1 - own / 100), (own / 100) * raise * 2, raise / own],
        viz: { type: 'money', bars: [{ label: `${money(raise)} round`, segs: [seg('you', (100 * answer) / raise, `You ${money(answer)}`), seg('new', 100 - (100 * answer) / raise, `Others ${money(raise - answer)}`)] }] },
      };
    }
    if (tier === 2) {
      const own = p([10, 15, 20, 25]);
      const pre = p([12, 15, 18, 20, 24]);
      const raise = p([4, 5, 6, 8]);
      const post = pre + raise;
      const check = formulas.prorata(own, raise) / 2;
      const answer = formulas.retain(own, pre, raise) + (100 * check) / post;
      return {
        prompt: `You own ${pct(own)}. The company raises ${money(raise)} at a ${money(pre)} pre-money. You take half your pro rata. What do you own after closing?`,
        facts: [['Your stake', pct(own)], ['Round', `${money(raise)} at ${money(pre)} pre`]],
        answer, unit: '%',
        explain: `Full pro rata is ${pct(own)} × ${money(raise)} = ${money(check * 2)}; half is ${money(check)}. Your old shares are worth ${pct(own)} × ${money(pre)} = ${money((own / 100) * pre)}. (${money((own / 100) * pre)} + ${money(check)}) ÷ ${money(post)} = ${pct(answer)}.`,
        trap: 'Value your old stake at the pre-money, add your check, divide by the post-money.',
        assumption: 'Same price for all new cash; no pool increase or conversions.',
        wrongs: [formulas.retain(own, pre, raise), own, own - (50 * raise) / post],
        viz: stakeBars(
          { label: 'Before', segs: [seg('you', own, 'You'), seg('other', 100 - own, 'Others')] },
          { label: 'After', segs: [seg('you', answer, 'You'), seg('other', formulas.retain(100 - own, pre, raise), 'Others'), seg('new', (100 * (raise - check)) / post, 'New money')] },
        ),
      };
    }
    const own = p([5, 8, 10, 12]);
    const target = own + p([2, 3, 5]);
    const pre = p([15, 20, 25, 30, 40]);
    const raise = p([5, 6, 8, 10]);
    const post = pre + raise;
    const answer = formulas.checkFor(own, target, pre, raise);
    return {
      prompt: `You own ${pct(own)}. The company raises ${money(raise)} at a ${money(pre)} pre-money. How big a check gets you to ${pct(target)} after closing?`,
      facts: [['Stake now / target', `${pct(own)} → ${pct(target)}`], ['Round', `${money(raise)} at ${money(pre)} pre`]],
      answer, unit: '$M',
      explain: `${pct(target)} of the ${money(post)} post-money is ${money((target / 100) * post)}. Your existing stake is worth ${pct(own)} × ${money(pre)} = ${money((own / 100) * pre)}. Check = ${money((target / 100) * post)} − ${money((own / 100) * pre)} = ${money(answer)}.`,
      trap: 'Target × post-money, minus what your old shares are already worth at the pre-money.',
      assumption: 'Your check is part of the round total; same price for all new cash; no pool increase.',
      wrongs: [(target / 100) * raise, ((target - own) / 100) * post, (target / 100) * post],
      viz: { type: 'money', bars: [{ label: `${money(raise)} round`, segs: [seg('you', (100 * answer) / raise, `You ${money(answer)}`), seg('new', 100 - (100 * answer) / raise, `Others ${money(raise - answer)}`)] }] },
    };
  },

  price(tier, p) {
    const shares = p([2, 4, 5, 8, 10]);
    const pre = p([6, 8, 12, 16, 20, 24, 30, 40]);
    if (tier === 1) {
      const answer = formulas.price(pre, shares);
      return {
        prompt: `A company has ${shares}M fully diluted shares and a ${money(pre)} pre-money valuation. What is the price per share?`,
        facts: [['Pre-money', money(pre)], ['FD shares', `${shares}M`]],
        answer, unit: '$',
        explain: `${money(pre)} ÷ ${shares}M shares = $${fmt(answer)} per share. The millions cancel.`,
        trap: 'Use the pre-round fully diluted share count.',
        assumption: 'Share count already includes all pre-round dilution.',
        wrongs: [shares / pre, pre / (shares * 10), (pre * 10) / shares],
      };
    }
    const cash = p([2, 3, 4, 5, 6]);
    const price = formulas.price(pre, shares);
    if (tier === 2) {
      const answer = formulas.newShares(cash, pre, shares);
      return {
        prompt: `${shares}M fully diluted shares, ${money(pre)} pre-money, and the round raises ${money(cash)}. How many new shares are issued?`,
        facts: [['Pre-money / shares', `${money(pre)} / ${shares}M`], ['New cash', money(cash)]],
        answer, unit: 'shares',
        explain: `Price = ${money(pre)} ÷ ${shares}M = $${fmt(price)}. New shares = ${money(cash)} ÷ $${fmt(price)} = ${fmt(answer)}M.`,
        trap: 'Price off the pre-money and pre-round shares, then divide the cash by that price.',
        assumption: 'Share count already includes all pre-round dilution; no pool increase.',
        wrongs: [(cash * shares) / (pre + cash), cash / price / 2, (cash / pre) * 100],
        viz: { type: 'money', bars: [{ label: `${fmt(shares + answer)}M shares after`, segs: [seg('you', (100 * shares) / (shares + answer), `Existing ${shares}M`), seg('new', (100 * answer) / (shares + answer), `New ${fmt(answer)}M`)] }] },
      };
    }
    const issued = formulas.newShares(cash, pre, shares);
    const answer = shares + issued;
    return {
      prompt: `${shares}M fully diluted shares, ${money(pre)} pre-money, and the round raises ${money(cash)}. How many fully diluted shares are outstanding after closing?`,
      facts: [['Pre-money / shares', `${money(pre)} / ${shares}M`], ['New cash', money(cash)]],
      answer, unit: 'shares',
      explain: `Price = ${money(pre)} ÷ ${shares}M = $${fmt(price)}. New shares = ${money(cash)} ÷ $${fmt(price)} = ${fmt(issued)}M. Total = ${shares}M + ${fmt(issued)}M = ${fmt(answer)}M. Check: ${money(pre + cash)} ÷ ${fmt(answer)}M = $${fmt(price)}.`,
      trap: 'The price does not change inside the round. Post-money ÷ post-round shares must equal the same price.',
      assumption: 'Share count already includes all pre-round dilution; no pool increase.',
      wrongs: [shares + (cash * shares) / (pre + cash), issued, shares * (1 + cash / (pre + cash))],
      viz: { type: 'money', bars: [{ label: `${fmt(answer)}M shares after`, segs: [seg('you', (100 * shares) / answer, `Existing ${shares}M`), seg('new', (100 * issued) / answer, `New ${fmt(issued)}M`)] }] },
    };
  },

  exit(tier, p) {
    if (tier === 1) {
      const investment = p([1, 2, 3, 4]);
      const own = p([10, 20, 25]);
      const proceeds = investment * p([2, 3, 4, 5, 8]);
      const answer = formulas.exit(proceeds, investment, own);
      const conv = (proceeds * own) / 100;
      return {
        prompt: `An investor put in ${money(investment)} for ${pct(own)} with 1× non-participating preferred. The company exits for ${money(proceeds)}. How much does the investor receive?`,
        facts: [['Preference', `${money(investment)} · 1×`], ['Exit proceeds', money(proceeds)]],
        answer, unit: '$M',
        explain: `Preference: ${money(investment)}. Conversion: ${pct(own)} × ${money(proceeds)} = ${money(conv)}. They take the larger: ${money(answer)}.`,
        trap: 'Non-participating means preference or conversion, not both.',
        assumption: 'One preferred class; proceeds are net of debt and costs; no dividends.',
        wrongs: [investment + conv, conv, investment, proceeds - investment],
        viz: { type: 'money', bars: [{ label: `Exit ${money(proceeds)}`, segs: [seg('new', (100 * answer) / proceeds, `Investor ${money(answer)}`), seg('you', 100 - (100 * answer) / proceeds, `Common ${money(proceeds - answer)}`)] }] },
      };
    }
    if (tier === 2) {
      const investment = p([2, 3, 4, 5]);
      const inv = p([20, 25]);
      const you = p([30, 40, 50]);
      const proceeds = investment * p([2, 3, 6, 8]);
      const investor = formulas.exit(proceeds, investment, inv);
      const answer = formulas.commonProceeds(proceeds, investment, inv, you);
      const converts = (proceeds * inv) / 100 >= investment;
      return {
        prompt: `You hold ${pct(you)} as common. An investor holds ${pct(inv)} with a 1× non-participating preference on ${money(investment)}. The company exits for ${money(proceeds)}. How much do you receive?`,
        facts: [['You / investor', `${pct(you)} common / ${pct(inv)} preferred`], ['Preference / exit', `${money(investment)} · 1× / ${money(proceeds)}`]],
        answer, unit: '$M',
        explain: converts
          ? `Converting pays ${pct(inv)} × ${money(proceeds)} = ${money(investor)}, more than the ${money(investment)} preference, so everyone shares pro rata: ${pct(you)} × ${money(proceeds)} = ${money(answer)}.`
          : `Converting would pay only ${money((proceeds * inv) / 100)}, so the investor takes the ${money(investment)} preference. Common splits ${money(proceeds - investment)}; your share is ${pct(you)} ÷ ${pct(100 - inv)} = ${pct((100 * you) / (100 - inv))} of that: ${money(answer)}.`,
        trap: 'First decide whether the investor converts. If not, common splits what is left in proportion to common holdings.',
        assumption: 'One preferred class; proceeds are net of debt and costs; no dividends or option pool.',
        wrongs: [(you / 100) * proceeds, (you / 100) * (proceeds - investment), ((proceeds - investment) * you) / (100 - inv)],
        viz: { type: 'money', bars: [{ label: `Exit ${money(proceeds)}`, segs: [seg('new', (100 * investor) / proceeds, `Investor ${money(investor)}`), seg('you', (100 * answer) / proceeds, `You ${money(answer)}`), seg('other', 100 - (100 * (investor + answer)) / proceeds, `Other common ${money(proceeds - investor - answer)}`)] }] },
      };
    }
    const investment = p([2, 3, 4, 5, 6]);
    const own = p([10, 20, 25, 40]);
    const answer = formulas.breakeven(investment, own);
    return {
      prompt: `An investor paid ${money(investment)} for ${pct(own)} with 1× non-participating preferred. At what exit value are they indifferent between taking the preference and converting?`,
      facts: [['Investment', money(investment)], ['Ownership', pct(own)]],
      answer, unit: '$M',
      explain: `Conversion equals preference when ${pct(own)} × exit = ${money(investment)}. Exit = ${money(investment)} ÷ ${fmt(own / 100)} = ${money(answer)}. Below that they take the preference.`,
      trap: 'The breakeven is the post-money they paid: investment ÷ ownership.',
      assumption: 'One preferred class; proceeds are net of debt and costs; no dividends.',
      wrongs: [investment * (own / 10), investment * 2, investment / (own / 100) - investment],
      viz: { type: 'money', bars: [{ label: `Exit ${money(answer)}`, segs: [seg('new', own, `Investor ${money(investment)}`), seg('you', 100 - own, `Common ${money(answer - investment)}`)] }] },
    };
  },

  decision(tier, p) {
    const offers = [];
    if (tier === 1) {
      const raise = p([2, 3, 4]);
      const aPre = raise * p([3, 4]);
      const bPre = raise * p([5, 6, 8]);
      const pool = p([5, 8, 10, 15]);
      offers.push({ cash: raise, pre: aPre, pool: 0 }, { cash: raise, pre: bPre, pool });
    } else if (tier === 2) {
      const aCash = p([2, 3, 4]);
      const bCash = aCash + p([1, 2]);
      const aPre = aCash * p([3, 4, 5]);
      const bPre = bCash * p([3, 4, 5]);
      offers.push({ cash: aCash, pre: aPre, pool: 0 }, { cash: bCash, pre: bPre, pool: 0 });
    } else {
      const aCash = p([3, 4, 5]);
      const bCash = aCash + p([1, 2]);
      const aPre = aCash * p([3, 4]);
      const bPre = bCash * p([4, 5]);
      offers.push({ cash: aCash, pre: aPre, pool: p([5, 10]) }, { cash: bCash, pre: bPre, pool: p([10, 15]) });
    }
    const keep = (o) => 100 - formulas.ownership(o.pre, o.cash) - o.pool;
    const [a, b] = offers;
    const ka = keep(a);
    const kb = keep(b);
    const desc = (o) => `${money(o.cash)} at ${money(o.pre)} pre${o.pool ? `, ${pct(o.pool)} final pool` : ', no pool'}`;
    const answer = ka > kb ? 'Offer A' : 'Offer B';
    const tie = Math.abs(ka - kb) < 0.3;
    return {
      prompt: 'You and your co-founders own 100%. Which offer leaves you with more ownership after closing?',
      facts: [['Offer A', desc(a)], ['Offer B', desc(b)]],
      answer, unit: 'choice', choices: ['Offer A', 'Offer B'],
      explain: `A: 100% − ${money(a.cash)}/${money(a.pre + a.cash)}${a.pool ? ` − ${pct(a.pool)}` : ''} = ${pct(ka)}. B: 100% − ${money(b.cash)}/${money(b.pre + b.cash)}${b.pool ? ` − ${pct(b.pool)}` : ''} = ${pct(kb)}. ${answer} keeps more.`,
      trap: tier === 2 ? 'More money at a higher valuation is not automatically better for ownership. Compare cash ÷ post-money.' : 'A higher valuation can be offset by a pre-money pool carve-out.',
      assumption: 'No existing pool or convertibles. Any pool is carved out of the pre-money and measured post-closing. Compare ownership only.',
      retry: tie,
      viz: stakeBars(
        { label: `Offer A: you keep ${pct(ka)}`, segs: [seg('you', ka, 'You'), ...(a.pool ? [seg('pool', a.pool, 'Pool')] : []), seg('new', formulas.ownership(a.pre, a.cash), 'Investor')] },
        { label: `Offer B: you keep ${pct(kb)}`, segs: [seg('you', kb, 'You'), ...(b.pool ? [seg('pool', b.pool, 'Pool')] : []), seg('new', formulas.ownership(b.pre, b.cash), 'Investor')] },
      ),
    };
  },
};

function buildChoices(q, rng) {
  const tooClose = (a, b) => Math.abs(a - b) < 0.011;
  const valid = (v) => Number.isFinite(v) && v > 0 && (q.unit !== '%' || v < 100);
  const values = [q.answer];
  const add = (v) => {
    v = round(v);
    if (!valid(v) || values.some((x) => tooClose(x, v))) return false;
    values.push(v);
    return true;
  };
  for (const w of q.wrongs || []) {
    if (values.length === 4) break;
    add(w);
  }
  const fallback = [0.5, 1.5, 0.8, 1.25, 2, 0.75, 1.1, 0.9, 1.4, 0.6];
  for (const f of fallback) {
    if (values.length === 4) break;
    add(q.answer * f);
  }
  for (const d of [-1, 1, -2, 2, -5, 5, -0.5, 0.5]) {
    if (values.length === 4) break;
    add(q.answer + d);
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export function generate(topic, options = {}) {
  const { tier = 1, rng = Math.random } = options;
  const gen = generators[topic];
  if (!gen) throw new Error(`Unknown topic: ${topic}`);
  const p = pickWith(rng);
  let q;
  for (let attempt = 0; attempt < 12; attempt++) {
    q = gen(tier, p);
    if (!q.retry) break;
  }
  delete q.retry;
  q.topic = topic;
  q.tier = tier;
  q.answer = typeof q.answer === 'number' ? round(q.answer) : q.answer;
  if (!q.choices) q.choices = buildChoices(q, rng);
  delete q.wrongs;
  return q;
}

export function correct(q, input) {
  if (q.unit === 'choice') return input === q.answer;
  if (input === '' || input === null || input === undefined) return false;
  const n = Number(input);
  return Number.isFinite(n) && Math.abs(n - q.answer) < 0.011;
}

// Adaptive selection: weaker and newer topics get more weight; never the same topic twice in a row.
export function chooseTopic(stats = {}, rng = Math.random, options = {}) {
  const { exclude = null, pool = TOPIC_IDS } = options;
  const candidates = pool.filter((k) => k !== exclude);
  const list = candidates.length ? candidates : pool;
  const weights = list.map((k) => {
    const s = stats[k];
    if (!s || !s.total) return 4;
    const acc = s.correct / s.total;
    return 1 + 4 * (1 - acc);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

// Tier selection from a topic's recent window: [{ok, t}].
export function chooseTier(window = [], rng = Math.random) {
  const recent = window.slice(-10);
  if (recent.length < 3) return 1;
  const acc = recent.filter((r) => r.ok).length / recent.length;
  const r = rng();
  if (acc >= 0.85) return r < 0.55 ? 3 : r < 0.9 ? 2 : 1;
  if (acc >= 0.6) return r < 0.6 ? 2 : r < 0.85 ? 1 : 3;
  return r < 0.8 ? 1 : 2;
}

// Deterministic daily set: same questions for everyone on the same date.
export function dailySet(dateKey, count = 8) {
  const rng = seededRng(hashString(`captable-daily-${dateKey}`));
  const order = [...TOPIC_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const tiers = [1, 1, 2, 1, 2, 3, 2, 3, 1, 2];
  return Array.from({ length: count }, (_, i) => generate(order[i % order.length], { tier: tiers[i % tiers.length], rng }));
}
