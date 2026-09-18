# Cap Table

A mobile-first mental-math game for founder conversations. Ten-question adaptive rounds cover valuation, compounded dilution, cap-based post-money SAFEs, pre-money option pools, pro rata, share prices, 1× non-participating preferences, and offer comparisons.

## Play

https://uri-rolls.github.io/cap-table-math/

- **Quick sprint:** 20 seconds per question; accuracy plus speed points.
- **Practice lab:** no timer; focus on any topic.
- **Deal room:** compare ownership retained under two offers.
- **No training wheels:** enter numeric answers directly.
- Local progress, topic accuracy, missed-answer review, installable PWA, offline play after first load.

## Development

Node 22+ and Python 3. Run `npm ci`, `npm start`, then open http://localhost:4173. Run `npm test` for math checks and `npx playwright install chromium && npm run test:e2e` for mobile browser tests. GitHub Actions tests and publishes `public/` to Pages on main pushes.

All game logic is client-side. No accounts, analytics, API keys, or server storage. Progress uses localStorage on each device/browser. External Google Fonts are optional; system fallbacks work offline.

## Financial model

Questions state material assumptions. SAFE drills assume the valuation cap determines conversion and no pool increase; option-pool drills begin with no existing pool; pro-rata round totals include the participant’s investment. Exit drills have one preferred class, net distributable proceeds, and no cumulative dividends. Offer comparisons optimize ownership only. Numeric answers are rounded to two decimal places. These simplified exercises teach arithmetic and are not transaction-specific advice.

Primary references: [YC SAFE documents](https://www.ycombinator.com/safe), [Carta: The life of a cap table](https://carta.com/blog/the-life-of-a-cap-table/).
