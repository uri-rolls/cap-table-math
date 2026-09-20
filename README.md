# Cap Table

A mobile-first mental-math game for founder conversations. Short adaptive rounds on valuation, compounded dilution, cap-based post-money SAFEs, pre-money option pools, pro rata, share prices, 1× non-participating preferences, and offer comparisons.

## Play

https://uri-rolls.github.io/cap-table-math/

- **Sprint:** 10 questions, 20 seconds each. Accuracy first, a bounded speed bonus, combo bonus from three in a row.
- **Daily challenge:** 8 questions, the same set for everyone on a given date, with a per-day best.
- **Practice:** no timer, any topic.
- **Deal room:** compare two offers by ownership retained.
- **Revenge round:** 6 questions on whatever you missed last round.
- **Calibration:** a 6-question first run that sets starting difficulty.
- **Typed answers:** enter numbers instead of choosing; separate personal bests.
- Three difficulty tiers per topic (clean, messy, multi-step), chosen from your last 12 answers in that topic.
- Wrong choices are generated from real mistakes (dividing by pre-money, subtracting percentage points, forgetting the pool) rather than fixed offsets.
- Every answer shows an ownership bar: before and after stakes, or how exit proceeds split.
- Funding-stage ranks (Pre-seed to IPO) from lifetime XP, topic mastery, milestones, personal bests per mode.
- Rounds survive refreshes and backgrounding; timers use absolute deadlines.
- Local progress, installable PWA, offline play after first load, optional sound and haptics, light and dark themes.

## Development

Node 22+ and Python 3. Run `npm ci`, `npm start`, then open http://localhost:4173. Run `npm test` for math and progress checks and `npx playwright install chromium && npm run test:e2e` for mobile browser tests. GitHub Actions tests and publishes `public/` to Pages on main pushes.

Files: `public/math.js` (formulas, generators, distractors, daily seeding), `public/progress.js` (storage, v1 to v2 migration, scoring, ranks, mastery, milestones), `public/visuals.js` (ownership bars), `public/sound.js` (WebAudio tones and haptics), `public/app.js` (screens, session state, routing, service worker updates).

All game logic is client-side. No accounts, analytics, API keys, or server storage. Progress uses localStorage on each device/browser and migrates from the original schema automatically. Google Fonts are optional; the system stack works offline.

## Financial model

Questions state material assumptions. Post-money = pre-money + new cash. Dilution compounds multiplicatively. SAFE drills assume the valuation cap determines conversion and no pool increase; new priced-round money then dilutes the SAFE stake. Option-pool drills begin with no existing pool and describe a pre-money carve-out measured as a final post-round percentage. Pro-rata round totals include the participant's investment. Exit drills have one preferred class, net distributable proceeds, 1× non-participating preferred, and no cumulative dividends. Offer comparisons optimize ownership only. Numeric answers are rounded to two decimal places. These simplified exercises teach arithmetic and are not transaction-specific advice.

Primary references: [YC SAFE documents](https://www.ycombinator.com/safe), [Carta: The life of a cap table](https://carta.com/blog/the-life-of-a-cap-table/).
