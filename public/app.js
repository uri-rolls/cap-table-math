import { topics, TOPIC_IDS, TIERS, generate, display, correct, chooseTopic, chooseTier, dailySet, unitLabel, unitHint } from './math.js';
import { createStore, rankFor, mastery, scoreAnswer, recordAnswer, finishRound, todayKey, weekDots, RANKS, MILESTONES } from './progress.js';
import { renderViz, ring } from './visuals.js';
import { sounds, haptic, unlockAudio } from './sound.js';

const root = document.querySelector('#app');
const store = createStore(window.localStorage);
const data = store.data;

const MODES = {
  sprint: { name: 'Sprint', count: 10, limit: 20, blurb: '10 questions, 20 seconds each' },
  daily: { name: 'Daily challenge', count: 8, limit: 20, blurb: '8 questions, same set for everyone today' },
  practice: { name: 'Practice', count: 10, limit: 0, blurb: '10 questions, no timer' },
  deals: { name: 'Deal room', count: 10, limit: 20, blurb: '10 offers to compare' },
  revenge: { name: 'Revenge round', count: 6, limit: 30, blurb: '6 questions on what you missed' },
  calibrate: { name: 'Calibration', count: 6, limit: 30, blurb: '6 questions to set your starting level' },
};
const CALIBRATION_TOPICS = ['valuation', 'dilution', 'safe', 'pool', 'prorata', 'exit'];

let screen = 'home';
let session = store.loadSession();
let recap = null;
let raf = null;
let lastTickSecond = null;
let toast = null;
let waitingWorker = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => new Intl.NumberFormat('en-US').format(Math.round(n));
const settings = data.settings;

function fx(kind, arg) {
  if (settings.sound) sounds[kind]?.(arg);
  if (settings.haptics) {
    if (kind === 'correct') haptic(12);
    else if (kind === 'wrong' || kind === 'timeout') haptic([18, 30, 18]);
    else if (kind === 'best') haptic([10, 20, 10, 20, 30]);
  }
}

// ---------- routing ----------
const routes = { '': 'home', home: 'home', play: 'play', results: 'results', progress: 'progress', learn: 'learn' };
function go(next, { replace = false } = {}) {
  screen = next;
  const hash = next === 'home' ? '#/' : `#/${next}`;
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
  }
  render();
}
window.addEventListener('popstate', () => {
  const key = location.hash.replace(/^#\/?/, '');
  let next = routes[key] || 'home';
  if (next === 'play' && !session) next = 'home';
  if (next === 'results' && !recap) next = 'home';
  screen = next;
  render();
});

// ---------- shell ----------
function topbar(extra = '') {
  return `<header class="top"><a class="brand" href="#/" data-action="home">Cap Table</a>${extra}<button class="icon-btn" data-action="sound" aria-pressed="${settings.sound}" aria-label="${settings.sound ? 'Sound on' : 'Sound off'}" title="${settings.sound ? 'Sound on' : 'Sound off'}">${settings.sound ? '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h3l4-3v12l-4-3H3z" fill="currentColor"/><path d="M12.5 7.5a3.5 3.5 0 0 1 0 5M14.5 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' : '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h3l4-3v12l-4-3H3z" fill="currentColor"/><path d="M13 8l4 4M17 8l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'}</button></header>`;
}

function nav(active) {
  const items = [['home', 'Train'], ['progress', 'Progress'], ['learn', 'Playbook']];
  return `<nav class="tabs" aria-label="Main">${items
    .map(([id, label]) => `<a href="#/${id === 'home' ? '' : id}" data-action="${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`)
    .join('')}</nav>`;
}

function toastHtml() {
  if (!toast) return '';
  return `<div class="toast" role="status">${toast.html}</div>`;
}

function showToast(html, ms = 4000) {
  toast = { html };
  render();
  if (ms) setTimeout(() => { if (toast?.html === html) { toast = null; render(); } }, ms);
}

function render() {
  cancelAnimationFrame(raf);
  const y = window.scrollY;
  if (screen === 'home') home();
  else if (screen === 'play') play();
  else if (screen === 'results') results();
  else if (screen === 'progress') progress();
  else learn();
  document.body.dataset.screen = screen;
  if (screen === 'play' && session?.feedback) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
}

// ---------- home ----------
function rankCard({ hero = false } = {}) {
  const r = rankFor(data.xp);
  const dots = weekDots(data.days);
  const ladder = RANKS.map((x, i) => `<i class="${i < r.index ? 'done' : i === r.index ? 'now' : ''}" title="${x.name}"></i>`).join('');
  return `<section class="rank ${hero ? 'hero' : ''}" aria-label="Your rank">
    <div class="rank-row"><div><span class="rank-kicker">Your stage</span><span class="rank-name">${r.name}</span></div>
    <div class="rank-ring" aria-hidden="true">${ring(r.progress * 100, 64, 6)}<b>${Math.round(r.progress * 100)}%</b></div></div>
    <div class="xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.progress * 100)}"><span style="width:${(r.progress * 100).toFixed(1)}%"></span></div>
    <div class="rank-foot"><span class="rank-xp"><b>${num(data.xp)}</b> XP${r.next ? ` · ${num(r.toNext)} to ${r.next.name}` : ' · top stage'}</span>
    <span class="ladder-dots" aria-label="Stage ${r.index + 1} of ${RANKS.length}">${ladder}</span></div>
    <div class="week" aria-label="Days trained this week">${dots.map((d) => `<i class="${d.done ? 'on' : ''} ${d.today ? 'today' : ''}" title="${d.key}"></i>`).join('')}<span>${data.days.length} day${data.days.length === 1 ? '' : 's'} trained</span></div>
  </section>`;
}

function masteryStrip() {
  const levels = TOPIC_IDS.map((k) => mastery(data.topics[k]));
  const mastered = levels.filter((m) => m.level === 4).length;
  const rated = levels.filter((m) => m.level > 0).length;
  const summary = mastered ? `${mastered} of 8 mastered` : rated ? `${rated} of 8 rated` : 'Play to rate your topics';
  return `<a class="mastery-strip" href="#/progress" data-action="progress" aria-label="Topic mastery, open progress">
    <div class="ms-head"><span>Topics</span><span>${summary}</span></div>
    <div class="ms-row">${TOPIC_IDS.map((k, i) => {
      const m = levels[i];
      return `<span class="ms ms-${m.level}" title="${topics[k].name}: ${m.label}"><b style="--h:${m.level ? m.level * 25 : 0}%"></b><small>${topics[k].short}</small></span>`;
    }).join('')}</div></a>`;
}

function home() {
  const firstRun = !data.calibrated && data.total === 0;
  const dailyDone = Object.hasOwn(data.dailies, todayKey());
  const daily = data.dailies[todayKey()];
  const resumable = session && !session.finished && session.answers.length < session.count;
  const primary = resumable
    ? `<button class="cta" data-action="resume"><span class="cta-title">Resume ${MODES[session.mode].name.toLowerCase()}</span><span class="cta-sub">Question ${Math.min(session.answers.length + 1, session.count)} of ${session.count}, ${session.score} points so far</span></button><button class="link" data-action="discard">Discard that round</button>`
    : firstRun
      ? `<button class="cta" data-action="start" data-mode="calibrate"><span class="cta-title">Calibrate in 6 questions</span><span class="cta-sub">Sets your starting difficulty. About two minutes.</span></button><button class="link" data-action="start" data-mode="sprint">Skip and start a sprint</button>`
      : `<button class="cta" data-action="start" data-mode="sprint"><span class="cta-title">Sprint</span><span class="cta-sub">${MODES.sprint.blurb}${data.bests.sprint[settings.typed ? 'typed' : 'choice'] ? ` · best ${num(data.bests.sprint[settings.typed ? 'typed' : 'choice'])}` : ''}</span></button>`;

  root.innerHTML = topbar() + `<main class="home">
    ${rankCard({ hero: true })}
    ${primary}
    <div class="mode-grid">
      <button class="mode m-daily ${dailyDone ? 'done' : ''}" data-action="start" data-mode="daily"><span class="glyph glyph-date">${new Date().getDate()}</span><span class="mode-title">Daily challenge</span><span class="mode-sub">${dailyDone ? `Done today: ${num(daily)} pts. Play again to beat it.` : 'Same 8 questions for everyone today'}</span></button>
      <button class="mode m-practice" data-action="start" data-mode="practice"><span class="glyph">∞</span><span class="mode-title">Practice</span><span class="mode-sub">No timer${settings.focus !== 'all' ? `, ${topics[settings.focus].short.toLowerCase()} only` : ''}</span></button>
      <button class="mode m-deals" data-action="start" data-mode="deals"><span class="glyph glyph-bars"><i style="--w:80%"></i><i style="--w:62%"></i></span><span class="mode-title">Deal room</span><span class="mode-sub">Two offers, keep more</span></button>
      ${data.lastMisses.length ? `<button class="mode revenge" data-action="start" data-mode="revenge"><span class="glyph">↻</span><span class="mode-title">Revenge round</span><span class="mode-sub">${data.lastMisses.map((k) => topics[k].short).join(', ')}</span></button>` : ''}
    </div>
    ${masteryStrip()}
    <section class="prefs">
      <label class="switch"><input type="checkbox" id="typed" ${settings.typed ? 'checked' : ''}><span class="knob"></span><span>Type answers instead of choosing<small>Harder, separate personal bests</small></span></label>
      <label class="select">Practice focus<select id="focus"><option value="all">All topics, adaptive</option>${TOPIC_IDS.map((k) => `<option value="${k}" ${settings.focus === k ? 'selected' : ''}>${topics[k].name}</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" id="haptics" ${settings.haptics ? 'checked' : ''}><span class="knob"></span><span>Haptics<small>Short taps on answers, where supported</small></span></label>
    </section>
    <p class="fine">Progress stays on this device. Add to your Home Screen to open it in one tap.${store.saveFailed ? ' Storage is unavailable in this browser, so progress will not be saved.' : ''}</p>
  </main>` + nav('home') + toastHtml();
}

// ---------- session ----------
function start(mode) {
  const m = MODES[mode];
  const typed = settings.typed && mode !== 'deals' && mode !== 'calibrate';
  session = {
    mode, typed, count: m.count, limit: m.limit,
    focus: mode === 'practice' ? settings.focus : 'all',
    pool: mode === 'revenge' ? data.lastMisses.slice() : mode === 'calibrate' ? CALIBRATION_TOPICS.slice() : null,
    queue: mode === 'daily' ? dailySet(todayKey(), m.count) : null,
    answers: [], score: 0, streak: 0, maxStreak: 0, question: null, feedback: null, lastTopic: null, finished: false,
  };
  if (mode === 'revenge' && !session.pool.length) session.pool = null;
  unlockAudio();
  next();
  go('play');
}

function pickQuestion() {
  if (session.queue) return session.queue[session.answers.length];
  if (session.mode === 'deals') return generate('decision', { tier: chooseTier(data.topics.decision.window) });
  if (session.mode === 'calibrate') return generate(session.pool[session.answers.length], { tier: 1 });
  let topic;
  if (session.focus !== 'all') topic = session.focus;
  else if (session.pool) topic = session.pool.length === 1 ? session.pool[0] : chooseTopic(data.topics, Math.random, { pool: session.pool, exclude: session.lastTopic });
  else topic = chooseTopic(data.topics, Math.random, { exclude: session.lastTopic });
  return generate(topic, { tier: chooseTier(data.topics[topic].window) });
}

function next() {
  if (session.answers.length >= session.count) { finish(); return; }
  session.question = pickQuestion();
  session.lastTopic = session.question.topic;
  session.feedback = null;
  session.started = Date.now();
  session.deadline = session.limit ? Date.now() + session.limit * 1000 : null;
  store.saveSession(session);
  if (screen === 'play') render();
}

function submit(input) {
  if (screen !== 'play' || !session || session.feedback) return;
  const q = session.question;
  const now = Date.now();
  if (session.deadline && now >= session.deadline) input = null;
  cancelAnimationFrame(raf);
  const seconds = Math.min((now - session.started) / 1000, session.limit || 600);
  const ok = input !== null && correct(q, input);
  session.streak = ok ? session.streak + 1 : 0;
  session.maxStreak = Math.max(session.maxStreak, session.streak);
  const points = scoreAnswer({ ok, tier: q.tier, seconds, limit: session.limit, streak: session.streak });
  session.score += points.total;
  session.feedback = { input, ok, points, seconds, timedOut: input === null };
  session.answers.push({ q, input, ok, seconds, points: points.total });
  recordAnswer(data, { topic: q.topic, tier: q.tier, ok, seconds, points: points.total });
  store.save();
  store.saveSession(session);
  fx(ok ? 'correct' : input === null ? 'timeout' : 'wrong', session.streak);
  render();
  if (ok) document.querySelector('#score')?.classList.add('pop');
}

function finish() {
  cancelAnimationFrame(raf);
  session.finished = true;
  recap = { ...finishRound(data, session), session, xpBefore: data.xp - session.score };
  store.save();
  store.saveSession(null);
  const done = session;
  session = null;
  recap.session = done;
  fx(recap.personalBest ? 'best' : 'finish', recap.correct / recap.count >= 0.7);
  go('results', { replace: true });
}

// ---------- play ----------
function timerRing(left, limit) {
  const p = limit ? (100 * left) / limit : 0;
  return `${ring(p, 44, 4)}<b id="clock-text">${Math.ceil(left)}</b>`;
}

function play() {
  const q = session.question;
  const fb = session.feedback;
  const answered = !!fb;
  const m = MODES[session.mode];
  const idx = Math.min(session.answers.length + (answered ? 0 : 1), session.count);
  const left = session.deadline ? Math.max(0, (session.deadline - Date.now()) / 1000) : 0;
  const typed = session.typed && q.unit !== 'choice';
  const tierLabel = session.mode === 'calibrate' ? '' : ` · ${TIERS[q.tier]}`;

  const choices = typed
    ? `<form id="answer-form" class="typed" novalidate><label for="answer">Answer ${unitLabel[q.unit]}</label><div class="input-row"><input id="answer" name="answer" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0.00" ${answered ? 'disabled' : ''} aria-describedby="answer-help"><span class="unit">${q.unit === 'shares' ? 'M' : q.unit}</span><button class="btn primary" type="submit" ${answered ? 'disabled' : ''}>Check</button></div><span id="answer-help" class="help">${unitHint[q.unit]} Round to 2 decimals.</span></form>`
    : `<div class="choices ${q.choices.length === 2 ? 'two' : ''}" role="group" aria-label="Answer choices">${q.choices.map((v, i) => {
        let cls = '';
        if (answered) cls = correct(q, v) ? 'right' : fb.input === v ? 'wrong' : 'muted';
        return `<button class="choice ${cls}" data-action="answer" data-index="${i}" ${answered ? 'disabled' : ''}><kbd>${i + 1}</kbd><span class="val">${display(v, q.unit)}</span></button>`;
      }).join('')}</div>`;

  root.innerHTML = `<header class="playbar"><button class="icon-btn" data-action="leave" aria-label="Leave round">×</button>
    <div class="steps" aria-label="Question ${idx} of ${session.count}">${Array.from({ length: session.count }, (_, i) => {
      const a = session.answers[i];
      return `<i class="${a ? (a.ok ? 'ok' : 'miss') : i === session.answers.length && !answered ? 'now' : ''}"></i>`;
    }).join('')}</div>
    <div class="score" aria-live="off"><b id="score">${num(session.score)}</b><small>pts</small></div></header>
  <main class="play">
    <div class="q-meta"><span>${topics[q.topic].name}${tierLabel}${session.streak >= 3 && !answered ? ` · <em class="combo">${session.streak} in a row</em>` : ''}</span>${session.limit ? `<div id="clock" class="clock ${left <= 5 ? 'urgent' : ''}" aria-label="Time left">${timerRing(left, session.limit)}</div>` : `<span class="untimed">No timer</span>`}</div>
    <h1 class="prompt">${esc(q.prompt)}</h1>
    <dl class="facts">${q.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${q.assumption ? `<p class="assumption">${esc(q.assumption)}</p>` : ''}
    ${choices}
    ${!answered && !typed ? `<p class="hint">${session.limit ? 'Answer fast for a speed bonus. Accuracy comes first.' : 'Take your time. The explanation follows your answer.'}</p>` : ''}
  </main>
  ${answered ? feedbackSheet(q, fb) : ''}`;

  if (session.limit && !answered) {
    lastTickSecond = null;
    const tick = () => {
      const remaining = Math.max(0, (session.deadline - Date.now()) / 1000);
      const el = document.querySelector('#clock');
      if (el) {
        el.innerHTML = timerRing(remaining, session.limit);
        el.classList.toggle('urgent', remaining <= 5);
        const s = Math.ceil(remaining);
        if (remaining <= 3 && s !== lastTickSecond && s > 0) { lastTickSecond = s; if (settings.sound) sounds.tick(); }
      }
      if (remaining <= 0) { submit(null); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  if (typed && !answered) setTimeout(() => document.querySelector('#answer')?.focus({ preventScroll: true }), 30);
  else if (answered) setTimeout(() => document.querySelector('.sheet .btn.primary')?.focus({ preventScroll: true }), 30);
}

function feedbackSheet(q, fb) {
  const last = session.answers.length >= session.count;
  const p = fb.points;
  const heading = fb.ok ? (session.streak >= 5 ? `${session.streak} in a row.` : session.streak >= 3 ? 'On a run.' : 'Correct.') : fb.timedOut ? 'Out of time.' : 'Not quite.';
  const breakdown = fb.ok ? `${p.base} base${p.speed ? ` + ${p.speed} speed` : ''}${p.combo ? ` + ${p.combo} combo` : ''}` : fb.timedOut ? 'No points. The answer was' : 'No points. The answer was';
  return `<section class="sheet ${fb.ok ? 'ok' : 'miss'}" aria-live="polite" aria-label="Result">
    <div class="sheet-inner">
      <div class="verdict"><div><h2>${heading}</h2><p class="pts">${fb.ok ? `<b>+${p.total}</b> <span>${breakdown}</span>` : `<span>${breakdown}</span> <b>${esc(display(q.answer, q.unit))}</b>`}</p></div>${fb.ok ? '' : `<span class="answer-chip">${fb.timedOut ? 'No answer' : `You said ${esc(display(fb.input, q.unit))}`}</span>`}</div>
      ${renderViz(q.viz)}
      <p class="explain">${esc(q.explain)}</p>
      <p class="shortcut"><b>Shortcut</b> ${esc(q.trap)}</p>
      <button class="btn primary big" data-action="next">${last ? 'See results' : 'Next'}</button>
    </div>
  </section>`;
}

// ---------- results ----------
function results() {
  const s = recap.session;
  const n = recap.correct;
  const total = recap.count;
  const avg = s.answers.reduce((a, x) => a + x.seconds, 0) / total;
  const misses = s.answers.filter((a) => !a.ok);
  const acc = n / total;
  const title = acc === 1 ? 'Clean sheet.' : acc >= 0.8 ? 'Sharp.' : acc >= 0.6 ? 'Getting there.' : 'Worth the reps.';
  const rBefore = rankFor(recap.xpBefore);
  const rAfter = rankFor(data.xp);
  const topicsSeen = [...new Set(s.answers.map((a) => a.q.topic))];
  const byTopic = topicsSeen.map((k) => {
    const rows = s.answers.filter((a) => a.q.topic === k);
    return { k, ok: rows.filter((a) => a.ok).length, n: rows.length };
  });
  const strong = byTopic.filter((t) => t.ok === t.n).map((t) => topics[t.k].short);
  const weak = byTopic.filter((t) => t.ok < t.n).map((t) => topics[t.k].short);

  root.innerHTML = topbar() + `<main class="results">
    <p class="kicker">${MODES[s.mode].name}${s.typed ? ', typed answers' : ''}</p>
    <h1>${title}</h1>
    <div class="score-hero"><b>${num(s.score)}</b><span>points${recap.personalBest ? ' · new personal best' : ''}</span></div>
    ${recap.rankUp ? `<p class="callout">Promoted to ${recap.rankUp}.</p>` : ''}
    <section class="rank compact" aria-label="Rank progress"><div class="rank-row"><div><span class="rank-kicker">+${num(s.score)} XP</span><span class="rank-name">${rAfter.name}</span></div><span class="rank-xp">${rAfter.next ? `${num(rAfter.toNext)} to ${rAfter.next.name}` : 'Top stage'}</span></div><div class="xpbar"><span class="from" style="width:${(rBefore.index === rAfter.index ? rBefore.progress * 100 : 0).toFixed(1)}%"></span><span style="width:${(rAfter.progress * 100).toFixed(1)}%"></span></div></section>
    <dl class="stats"><div><dt>Correct</dt><dd>${n}<small>/${total}</small></dd></div><div><dt>Avg time</dt><dd>${avg.toFixed(1)}<small>s</small></dd></div><div><dt>Best run</dt><dd>${s.maxStreak}<small> in a row</small></dd></div></dl>
    ${recap.earned.length ? `<ul class="earned">${recap.earned.map((id) => `<li><b>Milestone</b> ${MILESTONES[id].name}</li>`).join('')}</ul>` : ''}
    ${recap.masteryUps.length ? `<ul class="earned">${recap.masteryUps.map((k) => `<li><b>${mastery(data.topics[k]).label}</b> ${topics[k].name}</li>`).join('')}</ul>` : ''}
    <p class="takeaway">${strong.length ? `Solid on ${strong.join(', ')}.` : ''} ${weak.length ? `Work on ${weak.join(', ')}.` : 'Nothing missed this round.'}</p>
    <div class="actions">
      ${misses.length ? `<button class="btn primary big" data-action="start" data-mode="revenge">Revenge round: ${[...new Set(misses.map((a) => topics[a.q.topic].short))].slice(0, 3).join(', ')}</button><button class="btn big" data-action="start" data-mode="${s.mode === 'calibrate' ? 'sprint' : s.mode}">${s.mode === 'calibrate' ? 'Start a sprint' : 'Play again'}</button>` : `<button class="btn primary big" data-action="start" data-mode="${s.mode === 'calibrate' || s.mode === 'revenge' ? 'sprint' : s.mode}">${s.mode === 'calibrate' || s.mode === 'revenge' ? 'Start a sprint' : 'Play again'}</button>`}
      <a class="btn big ghost" href="#/" data-action="home">Home</a>
    </div>
    ${misses.length ? `<h2>Review</h2>${misses.map((a) => `<details class="review"><summary><span>${topics[a.q.topic].name}</span><b>${esc(display(a.q.answer, a.q.unit))}</b></summary><p>${esc(a.q.prompt)}</p>${renderViz(a.q.viz)}<p><b>${esc(a.q.explain)}</b></p><p class="shortcut"><b>Shortcut</b> ${esc(a.q.trap)}</p></details>`).join('')}` : ''}
  </main>` + nav('home') + toastHtml();
}

// ---------- progress ----------
function progress() {
  const r = rankFor(data.xp);
  const acc = data.total ? Math.round((100 * data.correct) / data.total) : 0;
  const today = todayKey();
  root.innerHTML = topbar() + `<main class="progress">
    <h1>Progress</h1>
    ${rankCard()}
    <ol class="ladder" aria-label="Ranks">${RANKS.map((x, i) => `<li class="${i < r.index ? 'done' : i === r.index ? 'now' : ''}"><span>${x.name}</span><small>${num(x.xp)}</small></li>`).join('')}</ol>
    <dl class="stats"><div><dt>Answers</dt><dd>${num(data.total)}</dd></div><div><dt>Accuracy</dt><dd>${data.total ? acc : '–'}<small>${data.total ? '%' : ''}</small></dd></div><div><dt>Rounds</dt><dd>${num(data.sessions)}</dd></div></dl>
    <h2>Personal bests</h2>
    <dl class="bests"><div><dt>Sprint, choices</dt><dd>${data.bests.sprint.choice ? num(data.bests.sprint.choice) : '–'}</dd></div><div><dt>Sprint, typed</dt><dd>${data.bests.sprint.typed ? num(data.bests.sprint.typed) : '–'}</dd></div><div><dt>Deal room</dt><dd>${data.bests.deals.choice ? num(data.bests.deals.choice) : '–'}</dd></div><div><dt>Today’s daily</dt><dd>${data.bests.daily[today] ? num(data.bests.daily[today]) : '–'}</dd></div></dl>
    <h2>Topics</h2>
    <div class="topics">${TOPIC_IDS.map((k) => {
      const m = mastery(data.topics[k]);
      return `<div class="topic"><div class="topic-head"><b>${topics[k].name}</b><span class="lvl lvl-${m.level}">${m.label}</span></div><div class="dots" aria-label="Last ${m.n} answers">${(data.topics[k].window || []).slice(-12).map((w) => `<i class="${w.ok ? 'ok' : 'miss'} t${w.t}" title="${TIERS[w.t]}"></i>`).join('')}${Array.from({ length: Math.max(0, 12 - m.n) }, () => '<i></i>').join('')}</div><div class="topic-foot"><small>${m.level === 4 ? 'Mastered' : `Next: ${m.next}`}</small><button class="link" data-action="focus" data-topic="${k}">Practice</button></div></div>`;
    }).join('')}</div>
    <h2>Milestones</h2>
    <ul class="milestones">${Object.entries(MILESTONES).map(([id, m]) => `<li class="${data.milestones[id] ? 'done' : ''}"><b>${m.name}</b><small>${data.milestones[id] ? `Earned ${data.milestones[id]}` : m.how}</small></li>`).join('')}</ul>
    <h2>Recent rounds</h2>
    ${data.recent.length ? `<ul class="history">${data.recent.slice(0, 12).map((x) => `<li><span>${MODES[x.mode]?.name || x.mode}${x.typed ? ', typed' : ''}<small>${x.date}</small></span><b>${x.correct}/${x.count || 10} · ${num(x.score)}</b></li>`).join('')}</ul>` : '<p class="fine">Your first finished round shows up here.</p>'}
    <p class="fine">Saved only in this browser. Clearing site data resets progress.</p>
  </main>` + nav('progress') + toastHtml();
}

// ---------- learn ----------
function learn() {
  root.innerHTML = topbar() + `<main class="learn">
    <h1>Playbook</h1>
    <p class="lede">Eight shortcuts for the next conversation. Each drill states the assumptions that decide its answer.</p>
    <div class="playbook">${TOPIC_IDS.map((k) => `<article><h2>${topics[k].name}</h2><p>${topics[k].rule}</p><button class="link" data-action="focus" data-topic="${k}">Practice this</button></article>`).join('')}</div>
    <h2>Scoring</h2>
    <p>Correct answers earn 100, 125, or 150 points by difficulty. Timed modes add up to 40 for speed. From the third correct answer in a row, each adds a combo bonus of 10 per step, up to 50. Every point is XP toward the next stage. Mastery of a topic needs 90% on your last 12 answers, including three harder ones.</p>
    <details class="review"><summary><span>Assumptions and sources</span></summary><p>Simplified mental-math exercises. Ownership is fully diluted; no unmentioned instruments or pool changes. Deal comparisons optimize ownership only.</p><p>SAFE questions assume cap-based conversion. Real conversions can differ at low round valuations or under different terms. Pool questions start with no existing pool; the pool is a pre-money carve-out measured after closing. Pro-rata round totals include your check. Exit questions have one preferred class, net proceeds, and 1× non-participating preferred.</p><p><a href="https://www.ycombinator.com/safe" target="_blank" rel="noopener">Y Combinator, post-money SAFE documents</a></p><p><a href="https://carta.com/blog/the-life-of-a-cap-table/" target="_blank" rel="noopener">Carta, the life of a cap table</a></p><p>Practice for fluency; use the actual documents for a real transaction.</p></details>
    <details class="review"><summary><span>Install on your phone</span></summary><p>iPhone: open in Safari, Share, Add to Home Screen. Android: open in Chrome, menu, Add to Home Screen or Install app.</p><p>Once loaded, the game works offline. Progress stays on this browser and device.</p></details>
  </main>` + nav('learn') + toastHtml();
}

// ---------- events ----------
root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (b.tagName === 'A') e.preventDefault();
  unlockAudio();
  if (a === 'home' || a === 'progress' || a === 'learn') go(a);
  else if (a === 'start') start(b.dataset.mode);
  else if (a === 'resume') { if (session) { if (session.deadline && !session.feedback && Date.now() >= session.deadline) { go('play'); submit(null); } else go('play'); } }
  else if (a === 'discard') { session = null; store.saveSession(null); render(); }
  else if (a === 'answer') { if (settings.sound) sounds.tap(); submit(session.question.choices[Number(b.dataset.index)]); }
  else if (a === 'next') next();
  else if (a === 'leave') go('home');
  else if (a === 'focus') { settings.focus = b.dataset.topic; store.save(); start('practice'); }
  else if (a === 'sound') { settings.sound = !settings.sound; store.save(); if (settings.sound) sounds.tap(); render(); }
  else if (a === 'reload') { if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING'); location.reload(); }
  else if (a === 'dismiss-toast') { toast = null; render(); }
});

root.addEventListener('change', (e) => {
  if (e.target.id === 'focus') { settings.focus = e.target.value; store.save(); render(); }
  if (e.target.id === 'typed') { settings.typed = e.target.checked; store.save(); render(); }
  if (e.target.id === 'haptics') { settings.haptics = e.target.checked; store.save(); }
});

root.addEventListener('submit', (e) => {
  if (e.target.id !== 'answer-form') return;
  e.preventDefault();
  const input = document.querySelector('#answer');
  const value = input.value.trim().replace(',', '.').replace(/^\$/, '').replace(/%$/, '');
  if (!/^\d+(\.\d+)?$/.test(value)) {
    input.setCustomValidity('Enter a positive number, like 12.5');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  submit(value);
});

root.addEventListener('input', (e) => { if (e.target.id === 'answer') e.target.setCustomValidity(''); });

document.addEventListener('keydown', (e) => {
  if (screen !== 'play' || !session) return;
  if (e.target.tagName === 'INPUT' && e.key !== 'Enter') return;
  if (session.feedback && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); return; }
  if (!session.feedback && !session.typed && /^[1-4]$/.test(e.key)) {
    const i = Number(e.key) - 1;
    if (session.question.choices[i] !== undefined) submit(session.question.choices[i]);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden || screen !== 'play' || !session || session.feedback) return;
  if (session.deadline && Date.now() >= session.deadline) submit(null);
});

// ---------- boot ----------
(function boot() {
  const key = location.hash.replace(/^#\/?/, '');
  let initial = routes[key] || 'home';
  if (initial === 'play' && session && !session.finished) {
    if (session.deadline && !session.feedback && Date.now() >= session.deadline) { screen = 'play'; render(); submit(null); return; }
  } else if (initial === 'play' || initial === 'results') initial = 'home';
  if (session?.finished) { session = null; store.saveSession(null); }
  screen = initial;
  render();
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const track = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = w;
          showToast('Update ready. <button class="link" data-action="reload">Reload</button>', 0);
        }
      });
    };
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; showToast('Update ready. <button class="link" data-action="reload">Reload</button>', 0); }
  }).catch(() => {});
}
