import { icon } from '../icons.js';
import { esc, fmtSec, parseSec, num, fmtNum, fmtDate, toast, openModal, confirmDialog, errMsg, getSettings, unlockAudio, alarm, lsGet, lsSet, lsDel, sanitizeNum } from '../utils.js';
import { hasLoad, isTime, isAmrap, targetChips, suggest, lastExposure, indexSets, sortRows, ageFrom, e1rm, isWorkPhase, zoneLabel } from '../training.js';
import { showVideo, videoButton } from './common.js';

const RPE_DESC = {
  1: 'Riposo attivo', 2: 'Molto facile', 3: 'Facile', 4: 'Leggero', 5: 'Moderato',
  6: 'Abbastanza impegnativo', 7: 'Impegnativo', 8: 'Duro', 9: 'Molto duro', 10: 'Massimale',
};
const RING_C = 2 * Math.PI * 110;

export async function render(root, { app }) {
  const { store, db } = app;
  const session = store.sessions.find((s) => !s.ended_at);
  if (!session) { location.hash = '#/home'; return; }

  const rows = sortRows(store.plan.filter((r) => r.id_programma === session.id_programma && r.id_scheda === session.id_scheda));
  const age = ageFrom(store.profile?.data_nascita);
  const settings = getSettings();
  const bySession = indexSets(store.sets);
  const key = (riga, n) => `${riga}|${n}`;

  const done = new Map();
  (bySession.get(session.id) || []).forEach((l) => done.set(key(l.id_riga, l.serie_n), l));

  const info = new Map();
  rows.forEach((r) => {
    const last = lastExposure(r.id_esercizio, store.sessions, bySession, session.id);
    info.set(r.id_riga, { last, sug: suggest(r, last) });
  });

  const draftKey = `wdb_draft_${session.id}`;
  let draft = {};
  try { draft = JSON.parse(lsGet(draftKey, '{}')) || {}; } catch { draft = {}; }
  const saveDraft = () => lsSet(draftKey, JSON.stringify(draft));

  const totalSets = rows.reduce((a, r) => a + (r.serie || 1), 0);
  const doneOf = (r) => { let c = 0; for (let i = 1; i <= (r.serie || 1); i++) if (done.has(key(r.id_riga, i))) c++; return c; };
  const isComplete = (r) => doneOf(r) >= (r.serie || 1);
  const doneCount = () => rows.reduce((a, r) => a + doneOf(r), 0);

  const openCards = new Set();
  const first = rows.find((r) => !isComplete(r));
  if (first) openCards.add(first.id_riga);

  let rest = null;
  let timer = null;
  let wakeLock = null;
  let elapsedIv = null;

  // ---------- rendering ----------
  function prefill(r, n) {
    const k = key(r.id_riga, n);
    const l = done.get(k);
    if (l) return { kg: l.kg ?? '', reps: l.reps ?? '', dur: l.durata_sec ?? r.durata_secondi ?? '' };
    const d = draft[k] || {};
    const { sug } = info.get(r.id_riga);
    return {
      kg: d.kg ?? sug.kg ?? '',
      reps: d.reps ?? sug.perSet?.[n - 1] ?? sug.reps ?? r.ripetizioni_min ?? '',
      dur: d.dur ?? sug.durata ?? r.durata_secondi ?? '',
    };
  }

  // carico della serie precedente di oggi: mostrato in grigio e usato se la cella resta vuota
  function prevKgOf(r, n) {
    for (let j = n - 1; j >= 1; j--) {
      const kk = key(r.id_riga, j);
      if (done.get(kk)?.kg != null) return done.get(kk).kg;
      if (draft[kk]?.kg) return num(draft[kk].kg);
    }
    return null;
  }

  function setsHTML(r) {
    const n = r.serie || 1;
    const load = hasLoad(r);
    const time = isTime(r);
    let h = '';
    if (time) {
      h += `<div class="set-grid set-head t"><span>#</span><span>Durata</span><span></span><span></span></div>`;
    } else {
      h += `<div class="set-grid set-head ${load ? '' : 'noload'}"><span>#</span>${load ? '<span>Kg</span>' : ''}<span>${isAmrap(r) ? 'Rip (max)' : r.per_lato ? 'Rip / lato' : 'Rip'}</span><span></span></div>`;
    }
    for (let i = 1; i <= n; i++) {
      const isDone = done.has(key(r.id_riga, i));
      const p = prefill(r, i);
      const ro = isDone ? 'readonly' : '';
      if (time) {
        const durVal = typeof p.dur === 'number' ? fmtSec(p.dur) : p.dur;
        h += `<div class="set-grid set-row t ${isDone ? 'done' : ''}" data-riga="${esc(r.id_riga)}" data-n="${i}">
          <span class="set-n">${i}</span>
          <input class="set-in" data-f="dur" data-num="time" maxlength="5" inputmode="numeric" value="${esc(durVal)}" aria-label="Durata serie ${i} (mm:ss)" onfocus="this.select()" ${ro}>
          <button class="set-play" data-act="timer" aria-label="Avvia timer serie ${i}" ${isDone ? 'disabled' : ''}>${icon('play')}</button>
          <button class="set-check" data-act="check" aria-label="${isDone ? 'Annulla' : 'Completa'} serie ${i}" aria-pressed="${isDone}">${icon('check')}</button>
        </div>`;
      } else {
        h += `<div class="set-grid set-row ${load ? '' : 'noload'} ${isDone ? 'done' : ''}" data-riga="${esc(r.id_riga)}" data-n="${i}">
          <span class="set-n">${i}</span>
          ${load ? `<input class="set-in" data-f="kg" data-num="dec" maxlength="6" inputmode="decimal" placeholder="${esc(prevKgOf(r, i) != null ? fmtNum(prevKgOf(r, i), 2) : 'kg')}" value="${esc(p.kg === null ? '' : p.kg)}" aria-label="Kg serie ${i}" onfocus="this.select()" ${ro}>` : ''}
          <input class="set-in" data-f="reps" data-num="int" maxlength="3" inputmode="numeric" placeholder="${isAmrap(r) ? 'max' : esc(r.ripetizioni_min ?? '')}" value="${esc(p.reps === null ? '' : p.reps)}" aria-label="Ripetizioni serie ${i}" onfocus="this.select()" ${ro}>
          <button class="set-check" data-act="check" aria-label="${isDone ? 'Annulla' : 'Completa'} serie ${i}" aria-pressed="${isDone}">${icon('check')}</button>
        </div>`;
      }
    }
    return h;
  }

  function lastHTML(r) {
    const { last } = info.get(r.id_riga);
    if (!last) return '';
    const load = hasLoad(r);
    const parts = last.sets.map((s) => (isTime(r) ? fmtSec(s.durata_sec) : load && s.kg ? `${fmtNum(s.kg, 2)}×${s.reps ?? '–'}` : `${s.reps ?? '–'}`));
    return `<div class="last">${icon('clock')}<span>Ultima volta (${esc(fmtDate(last.session.started_at, { day: 'numeric', month: 'short' }))}): <b>${esc(parts.join(' · '))}</b></span></div>`;
  }

  function cardHTML(r) {
    const { sug } = info.get(r.id_riga);
    const complete = isComplete(r);
    const n = r.serie || 1;
    const chips = targetChips(r, age).map((c) => `<span class="chip">${esc(c)}</span>`).join('');
    const ss = r.id_superserie ? `<span class="chip chip-accent">${icon('zap')} Superserie ${esc(r.id_superserie)}</span>` : '';
    const tip = sug.msg ? `<div class="tip ${sug.tone || ''}">${icon(sug.tone === 'up' ? 'trendUp' : 'target')}<span>${esc(sug.msg)}</span></div>` : '';
    return `<article class="ex ${openCards.has(r.id_riga) ? 'open' : ''} ${complete ? 'complete' : ''}" data-ex="${esc(r.id_riga)}">
      <button class="ex-head" data-act="toggle" aria-expanded="${openCards.has(r.id_riga)}">
        <span class="ex-num">${complete ? icon('check') : esc(r.ordine_esecuzione ?? '')}</span>
        <span class="ex-title"><span class="ex-name">${esc(r.esercizio)}</span>
        <span class="ex-sub">${esc([r.gruppo_muscolare, r.attrezzo].filter(Boolean).join(' · '))}</span></span>
        <span class="ex-count">${doneOf(r)}/${n}</span>
        <span class="ex-chev">${icon('chevronDown')}</span>
      </button>
      <div class="ex-body">
        <div class="chips">${chips}${ss}</div>
        ${tip}
        <div class="row wrap ex-actions">
          <button class="btn btn-ghost btn-sm" data-act="notes" aria-expanded="false">${icon('info')} Tecnica</button>
          ${videoButton(r)}
        </div>
        <div class="notes" hidden>${esc(r.note_esecuzione || 'Nessuna nota di esecuzione.')}
          ${r.muscoli_secondari ? `<div class="small muted" style="margin-top:8px">Muscoli secondari: ${esc(r.muscoli_secondari.split('|').join(', '))}</div>` : ''}</div>
        <div class="sets">${setsHTML(r)}</div>
        ${lastHTML(r)}
      </div>
    </article>`;
  }

  function pageHTML() {
    const fasi = [];
    for (const r of rows) {
      const f = r.fase || 'Allenamento';
      if (!fasi.length || fasi.at(-1).name !== f) fasi.push({ name: f, rows: [] });
      fasi.at(-1).rows.push(r);
    }
    return `<div class="wk-top">
        <div class="row between">
          <button class="icon-btn" data-act="back" aria-label="Torna alla home">${icon('chevronLeft')}</button>
          <div class="wk-title"><div class="eyebrow">${esc(session.nome_programma || '')}</div><div class="h2">${esc(session.nome_scheda || '')}</div></div>
          <button class="btn btn-primary btn-sm" data-act="finish">Fine</button>
        </div>
        <div class="row between wk-meta">
          <span class="row small muted">${icon('clock')}<b id="wk-elapsed">0:00</b></span>
          <span class="small muted"><b id="wk-done">0</b>/${totalSets} serie</span>
        </div>
        <div class="progress"><i id="wk-bar"></i></div>
      </div>
      ${rows.length ? '' : `<div class="empty card"><div class="ic">${icon('alert')}</div><p class="muted">La scheda di questo allenamento non esiste più (forse è stata reimportata con ID diversi).</p></div>`}
      ${fasi.map((f) => `<h3 class="fase-title"><span class="eyebrow">${esc(f.name)}</span></h3>${f.rows.map(cardHTML).join('')}`).join('')}
      <div class="wk-end stack">
        <button class="btn btn-primary btn-lg btn-block" data-act="finish">${icon('flag')} Termina allenamento</button>
        <button class="btn btn-danger btn-block" data-act="discard">${icon('trash')} Annulla allenamento</button>
      </div>
      <div class="restbar" id="restbar" role="timer" aria-live="polite">
        <div class="grow"><div class="rest-label">Recupero</div><div class="rest-time" id="rest-time">0:00</div><div class="rest-next" id="rest-next"></div></div>
        <button class="rb-btn" data-act="rest-minus" aria-label="Meno 15 secondi">−15</button>
        <button class="rb-btn" data-act="rest-plus" aria-label="Più 15 secondi">+15</button>
        <button class="rb-btn" data-act="rest-skip">Salta</button>
        <i class="rest-progress" id="rest-progress"></i>
      </div>`;
  }

  root.innerHTML = pageHTML();
  const $ = (s) => root.querySelector(s);
  const restEl = $('#restbar');

  const cardEl = (r) => root.querySelector(`[data-ex="${CSS.escape(r.id_riga)}"]`);
  function refreshCard(r) {
    const el = cardEl(r);
    if (!el) return;
    const notesOpen = el.querySelector('.notes') && !el.querySelector('.notes').hidden;
    el.outerHTML = cardHTML(r);
    if (notesOpen) {
      const ne = cardEl(r);
      ne.querySelector('.notes').hidden = false;
      ne.querySelector('[data-act="notes"]')?.setAttribute('aria-expanded', 'true');
    }
  }
  function updateProgress() {
    const dc = doneCount();
    $('#wk-done').textContent = dc;
    $('#wk-bar').style.width = `${totalSets ? (dc / totalSets) * 100 : 0}%`;
  }
  function updateElapsed() {
    const el = $('#wk-elapsed');
    if (el) el.textContent = fmtSec((Date.now() - new Date(session.started_at).getTime()) / 1000);
  }
  updateProgress();
  updateElapsed();
  elapsedIv = setInterval(updateElapsed, 1000);

  // ---------- recupero ----------
  function startRest(sec, nextLabel) {
    stopRest();
    rest = { end: Date.now() + sec * 1000, total: sec };
    $('#rest-next').textContent = nextLabel ? `Prossimo: ${nextLabel}` : '';
    restEl.classList.add('show');
    tickRest();
    rest.iv = setInterval(tickRest, 250);
  }
  function tickRest() {
    if (!rest) return;
    const left = (rest.end - Date.now()) / 1000;
    $('#rest-time').textContent = fmtSec(Math.ceil(Math.max(0, left)));
    $('#rest-progress').style.width = `${Math.max(0, Math.min(1, left / rest.total)) * 100}%`;
    if (left <= 0) {
      stopRest();
      alarm();
      toast('Recupero finito: vai con la prossima serie!', 'accent');
    }
  }
  function stopRest() {
    if (rest) { clearInterval(rest.iv); rest = null; }
    restEl?.classList.remove('show');
  }

  // ---------- serie ----------
  async function toggleSet(r, rowEl) {
    unlockAudio();
    const n = +rowEl.dataset.n;
    const k = key(r.id_riga, n);
    if (done.has(k)) {
      try { await db.deleteSet(session.id, r.id_riga, n); } catch (e) { toast(errMsg(e), 'error'); return; }
      const l = done.get(k);
      done.delete(k);
      store.sets = store.sets.filter((x) => x !== l && !(x.session_id === session.id && x.id_riga === r.id_riga && x.serie_n === n));
      refreshCard(r);
      updateProgress();
      return;
    }
    const val = (f) => rowEl.querySelector(`[data-f="${f}"]`)?.value;
    const log = {
      session_id: session.id, id_riga: r.id_riga, id_esercizio: r.id_esercizio, esercizio: r.esercizio,
      gruppo_muscolare: r.gruppo_muscolare, fase: r.fase, serie_n: n, reps: null, kg: null, durata_sec: null,
    };
    if (isTime(r)) {
      log.durata_sec = parseSec(val('dur')) ?? r.durata_secondi ?? null;
    } else {
      log.reps = num(val('reps'));
      if (hasLoad(r)) log.kg = num(val('kg')) ?? prevKgOf(r, n);
      if (log.reps === null) {
        toast('Inserisci le ripetizioni eseguite', 'error');
        rowEl.querySelector('[data-f="reps"]')?.focus();
        return;
      }
      log.reps = Math.round(log.reps);
    }
    rowEl.classList.add('done');
    let saved;
    try { saved = await db.upsertSet(log); } catch (e) { rowEl.classList.remove('done'); toast(errMsg(e), 'error'); return; }
    store.sets = store.sets.filter((x) => !(x.session_id === session.id && x.id_riga === r.id_riga && x.serie_n === n));
    store.sets.push(saved);
    done.set(k, saved);
    delete draft[k];
    saveDraft();

    const idx = rows.indexOf(r);
    const nxt = rows[idx + 1];
    if (isComplete(r)) {
      openCards.delete(r.id_riga);
      refreshCard(r);
      const nextOpen = rows.slice(idx + 1).find((x) => !isComplete(x)) || rows.find((x) => !isComplete(x));
      if (nextOpen) {
        if (settings.singleOpen) {
          openCards.clear();
          root.querySelectorAll('.ex.open').forEach((x) => x.classList.remove('open'));
        }
        openCards.add(nextOpen.id_riga);
        refreshCard(nextOpen);
        setTimeout(() => cardEl(nextOpen)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }
    } else {
      refreshCard(r);
    }
    updateProgress();

    if (doneCount() >= totalSets) {
      stopRest();
      toast('Tutte le serie completate! Tocca "Termina allenamento".', 'success', 4000);
      return;
    }
    if (r.id_superserie && nxt && nxt.id_superserie === r.id_superserie) {
      toast(`Superserie: passa subito a ${nxt.esercizio}`, 'accent');
      return;
    }
    const recSec = r.recupero_secondi || 0;
    if (recSec > 0) {
      const label = isComplete(r) ? (rows.find((x) => !isComplete(x))?.esercizio || '') : `${r.esercizio} · serie ${n + 1}`;
      startRest(recSec, label);
    }
  }

  // ---------- timer per esercizi a tempo ----------
  function runTimer(r, rowEl) {
    unlockAudio();
    stopRest();
    const n = +rowEl.dataset.n;
    const input = rowEl.querySelector('[data-f="dur"]');
    const target = parseSec(input.value) || r.durata_secondi || 60;
    let remaining = target * 1000;
    let running = true;
    let lastT = Date.now();
    if (timer) closeTimer();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const zone = r.zona_fc ? esc(zoneLabel(r.zona_fc, age)) : '';
    ov.innerHTML = `<div class="tm-full">
        <button class="icon-btn tm-min" data-o="min" aria-label="Riduci il timer">${icon('minimize')}</button>
        <div class="eyebrow">${esc(r.esercizio)} · Serie ${n}/${r.serie || 1}</div>
        <div class="ring">
          <svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="110" class="ring-bg"/><circle cx="120" cy="120" r="110" class="ring-fg" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg>
          <div class="ring-time" data-t role="timer">${fmtSec(target)}</div>
        </div>
        ${zone ? `<div class="chip chip-accent">${icon('heart')} ${zone}</div>` : ''}
        <div class="row" style="gap:12px;margin-top:10px">
          <button class="btn btn-ghost btn-lg" data-o="pause">${icon('pause')} Pausa</button>
          <button class="btn btn-primary btn-lg" data-o="done">${icon('check')} Fatto</button>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-sm" data-o="min">${icon('minimize')} Riduci</button>
          <button class="btn btn-sm" data-o="cancel">Annulla</button>
        </div>
      </div>
      <div class="restbar show tm-mini" role="timer">
        <button class="grow tm-expand" data-o="max" aria-label="Ingrandisci il timer">
          <div class="rest-label">${esc(r.esercizio)}</div>
          <div class="rest-time" data-t>${fmtSec(target)}</div>
          <div class="rest-next">${zone || `Serie ${n}/${r.serie || 1}`}</div>
        </button>
        <button class="rb-btn" data-o="pause" data-compact aria-label="Pausa">${icon('pause')}</button>
        <button class="rb-btn" data-o="done" data-compact aria-label="Fatto">${icon('check')}</button>
        <button class="rb-btn" data-o="max" aria-label="Ingrandisci">${icon('maximize')}</button>
        <i class="rest-progress" data-p></i>
      </div>`;
    document.body.appendChild(ov);
    const ring = ov.querySelector('.ring-fg');
    const setMini = (on) => {
      ov.classList.toggle('mini', on);
      document.body.classList.toggle('timer-mini', on);
      document.body.classList.toggle('no-scroll', !on);
    };
    setMini(false);
    const tick = () => {
      const now = Date.now();
      if (running) remaining -= now - lastT;
      lastT = now;
      const left = Math.max(0, remaining);
      ov.querySelectorAll('[data-t]').forEach((el) => { el.textContent = fmtSec(Math.ceil(left / 1000)); });
      ring.setAttribute('stroke-dashoffset', String(RING_C * (1 - left / (target * 1000))));
      ov.querySelector('[data-p]').style.width = `${(left / (target * 1000)) * 100}%`;
      if (remaining <= 0) complete(target);
    };
    const complete = (sec) => {
      closeTimer();
      alarm();
      // la card potrebbe essere stata ridisegnata mentre il timer era ridotto
      const liveRow = cardEl(r)?.querySelector(`.set-row[data-n="${n}"]`) || rowEl;
      if (done.has(key(r.id_riga, n))) return;
      const liveIn = liveRow.querySelector('[data-f="dur"]');
      if (liveIn) liveIn.value = fmtSec(sec);
      draft[key(r.id_riga, n)] = { ...draft[key(r.id_riga, n)], dur: fmtSec(sec) };
      saveDraft();
      toggleSet(r, liveRow);
    };
    ov.onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      const o = b.dataset.o;
      if (o === 'pause') {
        running = !running;
        lastT = Date.now();
        ov.querySelectorAll('[data-o="pause"]').forEach((x) => {
          x.innerHTML = 'compact' in x.dataset ? icon(running ? 'pause' : 'play') : `${icon(running ? 'pause' : 'play')} ${running ? 'Pausa' : 'Riprendi'}`;
          x.setAttribute('aria-label', running ? 'Pausa' : 'Riprendi');
        });
      } else if (o === 'done') {
        complete(Math.max(1, Math.round(target - Math.max(0, remaining) / 1000)));
      } else if (o === 'min') setMini(true);
      else if (o === 'max') setMini(false);
      else closeTimer();
    };
    timer = { iv: setInterval(tick, 200), el: ov, tick };
  }

  function closeTimer() {
    if (!timer) return;
    clearInterval(timer.iv);
    timer.el.remove();
    timer = null;
    document.body.classList.remove('timer-mini', 'no-scroll');
  }

  // ---------- fine / annulla ----------
  function findPRs() {
    const cur = store.sets.filter((l) => l.session_id === session.id);
    const endedIds = new Set(store.sessions.filter((s) => s.ended_at && s.id !== session.id).map((s) => s.id));
    const prev = store.sets.filter((l) => endedIds.has(l.session_id));
    const out = [];
    const byEx = new Map();
    cur.forEach((l) => { if (!byEx.has(l.id_esercizio)) byEx.set(l.id_esercizio, []); byEx.get(l.id_esercizio).push(l); });
    for (const [ex, ls] of byEx) {
      const before = prev.filter((l) => l.id_esercizio === ex);
      if (!before.length) continue;
      const bestNow = Math.max(0, ...ls.map((l) => e1rm(num(l.kg), l.reps) || 0));
      const bestBefore = Math.max(0, ...before.map((l) => e1rm(num(l.kg), l.reps) || 0));
      if (bestNow > 0 && bestNow > bestBefore + 0.01) {
        out.push({ name: ls[0].esercizio, text: `1RM stimato ${fmtNum(bestNow, 1)} kg (+${fmtNum(bestNow - bestBefore, 1)})` });
        continue;
      }
      if (bestNow === 0) {
        const repsNow = Math.max(0, ...ls.map((l) => l.reps || 0));
        const repsBefore = Math.max(0, ...before.map((l) => l.reps || 0));
        if (repsNow > repsBefore) { out.push({ name: ls[0].esercizio, text: `${repsNow} ripetizioni (record: era ${repsBefore})` }); continue; }
        const durNow = Math.max(0, ...ls.map((l) => l.durata_sec || 0));
        const durBefore = Math.max(0, ...before.map((l) => l.durata_sec || 0));
        if (durNow > durBefore && durBefore > 0 && !/cardio/i.test(ls[0].gruppo_muscolare || '')) out.push({ name: ls[0].esercizio, text: `${fmtSec(durNow)} di tenuta (era ${fmtSec(durBefore)})` });
      }
    }
    return out;
  }

  async function discard(ask = true) {
    if (ask && !(await confirmDialog('Annullare l\'allenamento?', 'Le serie registrate in questa sessione verranno eliminate.', 'Elimina', true))) return;
    try { await db.deleteSession(session.id); } catch (e) { toast(errMsg(e), 'error'); return; }
    store.sessions = store.sessions.filter((s) => s.id !== session.id);
    store.sets = store.sets.filter((l) => l.session_id !== session.id);
    lsDel(draftKey);
    location.hash = '#/home';
  }

  function finish() {
    const dc = doneCount();
    if (dc === 0) {
      confirmDialog('Nessuna serie registrata', 'Non hai completato nessuna serie. Vuoi annullare l\'allenamento?', 'Annulla allenamento', true)
        .then((ok) => ok && discard(false));
      return;
    }
    const mins = Math.max(1, Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000));
    const logs = [...done.values()];
    const vol = logs.filter((l) => isWorkPhase(l.fase)).reduce((a, l) => a + (num(l.kg) || 0) * (l.reps || 0), 0);
    let rpe = null;
    openModal({
      title: 'Termina allenamento',
      body: `<div class="kpis kpis-3">
          <div class="kpi"><div class="kpi-v">${mins}</div><div class="kpi-l">minuti</div></div>
          <div class="kpi"><div class="kpi-v">${dc}<small>/${totalSets}</small></div><div class="kpi-l">serie</div></div>
          <div class="kpi"><div class="kpi-v">${fmtNum(vol, 0)}</div><div class="kpi-l">kg volume</div></div>
        </div>
        ${dc < totalSets ? `<div class="banner warn" style="margin-top:12px">${icon('alert')}<span>Hai completato ${dc} serie su ${totalSets}. Puoi terminare comunque.</span></div>` : ''}
        <div class="field" style="margin-top:16px"><span>Quanto è stato duro? (RPE della sessione)</span>
          <div class="rpe-grid">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>
          <div class="small muted" id="rpe-desc" style="margin-top:8px">Tocca un valore da 1 (facilissimo) a 10 (massimale).</div>
        </div>
        <label class="field" style="margin-top:14px"><span>Note (facoltative)</span>
          <textarea id="fin-note" placeholder="Sensazioni, dolori, energia, sonno..."></textarea></label>`,
      actions: [
        { label: 'Continua' },
        {
          label: `${icon('check')} Salva`, class: 'btn-primary',
          onClick: async (el) => {
            const note = el.querySelector('#fin-note').value.trim() || null;
            let upd;
            try {
              upd = await db.updateSession(session.id, { ended_at: new Date().toISOString(), durata_min: mins, rpe, note });
            } catch (e) { toast(errMsg(e), 'error'); return false; }
            Object.assign(session, upd);
            lsDel(draftKey);
            const prs = findPRs();
            location.hash = '#/home';
            setTimeout(() => showSummary(mins, dc, vol, prs), 250);
            return true;
          },
        },
      ],
      onMount: (el) => {
        el.querySelector('.rpe-grid').onclick = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          rpe = +b.dataset.v;
          el.querySelectorAll('.rpe-grid button').forEach((x) => x.classList.toggle('active', x === b));
          el.querySelector('#rpe-desc').textContent = `${rpe} · ${RPE_DESC[rpe]}`;
        };
      },
    });
  }

  function showSummary(mins, sets, vol, prs) {
    openModal({
      title: 'Allenamento completato',
      body: `<div class="done-hero">${icon('trophy')}<div class="h2">Ottimo lavoro!</div><p class="muted">${esc(session.nome_scheda)} · ${mins} min · ${sets} serie · ${fmtNum(vol, 0)} kg</p></div>
        ${prs.length ? `<div class="eyebrow" style="margin:14px 0 8px">Nuovi record</div>${prs.map((p) => `<div class="pr">${icon('flame')}<div><b>${esc(p.name)}</b><div class="small muted">${esc(p.text)}</div></div></div>`).join('')}`
          : `<p class="small muted center" style="margin-top:12px">Ricorda: la costanza batte l'intensità. Ci vediamo al prossimo allenamento.</p>`}`,
      actions: [{ label: 'Chiudi' }, { label: `${icon('chart')} Report`, class: 'btn-primary', onClick: () => { location.hash = '#/report'; } }],
    });
  }

  // ---------- eventi ----------
  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const card = b.closest('[data-ex]');
    const r = card && rows.find((x) => x.id_riga === card.dataset.ex);
    switch (act) {
      case 'back': location.hash = '#/home'; break;
      case 'toggle': {
        const opening = !openCards.has(r.id_riga);
        if (opening && settings.singleOpen) {
          openCards.clear();
          root.querySelectorAll('.ex.open').forEach((x) => {
            x.classList.remove('open');
            x.querySelector('.ex-head')?.setAttribute('aria-expanded', 'false');
          });
        }
        if (opening) openCards.add(r.id_riga); else openCards.delete(r.id_riga);
        card.classList.toggle('open', opening);
        b.setAttribute('aria-expanded', String(opening));
        if (opening && settings.singleOpen) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        break;
      }
      case 'notes': {
        const n = card.querySelector('.notes');
        n.hidden = !n.hidden;
        b.setAttribute('aria-expanded', String(!n.hidden));
        b.classList.toggle('active', !n.hidden);
        break;
      }
      case 'video': showVideo(r); break;
      case 'check':
        b.disabled = true;
        await toggleSet(r, b.closest('.set-row'));
        b.disabled = false;
        break;
      case 'timer': runTimer(r, b.closest('.set-row')); break;
      case 'finish': finish(); break;
      case 'discard': discard(); break;
      case 'rest-minus': if (rest) { rest.end -= 15000; tickRest(); } break;
      case 'rest-plus': if (rest) { rest.end += 15000; rest.total += 15; tickRest(); } break;
      case 'rest-skip': stopRest(); break;
      default: break;
    }
  };

  root.oninput = (e) => {
    const inp = e.target.closest('.set-in');
    if (!inp) return;
    sanitizeNum(inp);
    const row = inp.closest('.set-row');
    const k = key(row.dataset.riga, +row.dataset.n);
    draft[k] = { ...draft[k], [inp.dataset.f]: inp.value };
    saveDraft();
  };

  // ---------- schermo sempre acceso ----------
  async function lock() {
    if (!settings.wakelock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* non supportato */ }
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') { lock(); tickRest(); updateElapsed(); timer?.tick(); }
  };
  document.addEventListener('visibilitychange', onVis);
  lock();

  if (first && doneCount() > 0) setTimeout(() => cardEl(first)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);

  return () => {
    clearInterval(elapsedIv);
    stopRest();
    closeTimer();
    document.removeEventListener('visibilitychange', onVis);
    try { wakeLock?.release(); } catch { /* ignora */ }
  };
}
