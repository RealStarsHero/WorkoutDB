import { icon } from '../icons.js';
import { esc, num, fmtNum, fmtDate, fmtDateTime, fmtSec, daysSince, relDays, dateKey, weekStart, toast, openModal, confirmDialog, errMsg, downloadText, lsGet, lsSet } from '../utils.js';
import { indexSets, e1rm, isWorkPhase, volumeRange, trainedDays } from '../training.js';

const WEEK = 7 * 86400000;
const C = { accent: '#FFD43B', accentSoft: 'rgba(255,212,59,.18)', muted: '#9AA1AD', faint: '#4B515C', grid: 'rgba(255,255,255,.06)', ok: '#34D399', warn: '#FB923C', text: '#F3F4F6' };
const DOW = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function setupChartDefaults() {
  const Ch = window.Chart;
  if (!Ch || Ch.__wdb) return;
  Ch.__wdb = true;
  Ch.defaults.color = C.muted;
  Ch.defaults.font.family = 'Inter, system-ui, sans-serif';
  Ch.defaults.font.size = 11;
  Ch.defaults.borderColor = C.grid;
  Ch.defaults.plugins.legend.display = false;
  Ch.defaults.maintainAspectRatio = false;
  Object.assign(Ch.defaults.plugins.tooltip, { backgroundColor: '#262A31', borderColor: '#2B2F37', borderWidth: 1, titleColor: C.text, bodyColor: C.text, padding: 10, cornerRadius: 10, displayColors: false });
}

export async function render(root, { app }) {
  const { store, db } = app;
  setupChartDefaults();
  let period = lsGet('wdb_period', '12');
  let exSel = null;
  const charts = [];
  const destroy = () => { charts.splice(0).forEach((c) => c.destroy()); };

  function compute() {
    const ended = store.sessions.filter((s) => s.ended_at); // dalla più recente
    const bySession = indexSets(store.sets);
    const planByEx = new Map(store.plan.map((r) => [r.id_esercizio, r]));
    const now = new Date();
    const thisWeek = weekStart(now);
    const oldest = ended.length ? new Date(ended.at(-1).started_at) : now;
    const weeks = period === 'all' ? Math.max(1, Math.round((thisWeek - weekStart(oldest)) / WEEK) + 1) : +period;
    // per la frequenza contano solo le settimane da quando hai iniziato ad allenarti
    const effWeeks = Math.min(weeks, Math.max(1, Math.round((thisWeek - weekStart(oldest)) / WEEK) + 1));
    const from = new Date(thisWeek.getTime() - (weeks - 1) * WEEK);
    const prevFrom = new Date(from.getTime() - weeks * WEEK);
    const inP = ended.filter((s) => new Date(s.started_at) >= from);
    const prevP = period === 'all' ? [] : ended.filter((s) => { const d = new Date(s.started_at); return d >= prevFrom && d < from; });

    const work = (s) => (bySession.get(s.id) || []).filter((l) => isWorkPhase(l.fase));
    const volOf = (list) => list.reduce((a, s) => a + work(s).reduce((b, l) => b + (num(l.kg) || 0) * (l.reps || 0), 0), 0);
    const setsOf = (list) => list.reduce((a, s) => a + work(s).length, 0);

    const weekly = Array.from({ length: weeks }, (_, i) => {
      const ws = new Date(from.getTime() + i * WEEK);
      const we = new Date(ws.getTime() + WEEK);
      const ss = inP.filter((s) => { const d = new Date(s.started_at); return d >= ws && d < we; });
      return { label: fmtDate(ws, { day: 'numeric', month: 'short' }), vol: volOf(ss), n: ss.length };
    });

    // serie settimanali per gruppo muscolare (media del periodo, max 4 settimane per restare "attuale")
    const muscWeeks = Math.min(weeks, 4);
    const muscFrom = new Date(thisWeek.getTime() - (muscWeeks - 1) * WEEK);
    const musc = new Map();
    ended.filter((s) => new Date(s.started_at) >= muscFrom).forEach((s) => work(s).forEach((l) => {
      const g = l.gruppo_muscolare || 'Altro';
      if (/cardio|mobilit/i.test(g)) return;
      musc.set(g, (musc.get(g) || 0) + 1);
    }));
    const muscArr = [...musc.entries()].map(([g, n]) => ({ g, v: n / muscWeeks })).sort((a, b) => b.v - a.v);

    // storico per esercizio (tutto il periodo disponibile)
    const exHist = new Map();
    [...ended].reverse().forEach((s) => {
      const byEx = new Map();
      (bySession.get(s.id) || []).forEach((l) => { if (!byEx.has(l.id_esercizio)) byEx.set(l.id_esercizio, []); byEx.get(l.id_esercizio).push(l); });
      byEx.forEach((ls, ex) => {
        if (!exHist.has(ex)) exHist.set(ex, { id: ex, name: ls[0].esercizio, gruppo: ls[0].gruppo_muscolare, fase: ls[0].fase, points: [] });
        const best = Math.max(0, ...ls.map((l) => e1rm(num(l.kg), l.reps) || 0));
        const topKg = Math.max(0, ...ls.map((l) => num(l.kg) || 0));
        const reps = ls.reduce((a, l) => a + (l.reps || 0), 0);
        const dur = Math.max(0, ...ls.map((l) => l.durata_sec || 0));
        const bestSet = ls.reduce((b, l) => ((e1rm(num(l.kg), l.reps) || 0) > (e1rm(num(b.kg), b.reps) || 0) ? l : b), ls[0]);
        exHist.get(ex).points.push({ date: s.started_at, e1rm: best, topKg, reps, dur, bestSet });
      });
    });
    exHist.forEach((h) => { h.kind = h.points.some((p) => p.e1rm > 0) ? 'load' : h.points.some((p) => p.reps > 0) ? 'reps' : 'time'; });

    // streak settimanale
    const days = trainedDays(store.sessions);
    const weeksWith = new Set([...days].map((k) => weekStart(new Date(k)).getTime()));
    let streak = 0;
    let w = thisWeek.getTime();
    if (!weeksWith.has(w)) w -= WEEK;
    while (weeksWith.has(w)) { streak++; w -= WEEK; }

    return { ended, inP, prevP, weeks, effWeeks, from, weekly, muscArr, muscWeeks, exHist, planByEx, bySession, work, volOf, setsOf, days, streak };
  }

  function insights(d) {
    const out = [];
    const p = store.profile || {};
    const target = p.giorni_settimana || 3;
    const freq = d.inP.length / d.effWeeks;
    const lastS = d.ended[0];
    const sinceLast = lastS ? daysSince(lastS.started_at) : null;

    if (!d.ended.length) return out;
    if (sinceLast !== null && sinceLast >= 5) out.push({ tone: 'warn', ic: 'calendar', t: `Ultimo allenamento ${relDays(sinceLast)}`, s: 'Riprendi appena puoi: dopo 7–10 giorni di stop iniziano a calare le prestazioni. Riparti con la scheda successiva.' });
    if (d.effWeeks >= 2) {
      if (freq >= target * 0.9) out.push({ tone: 'good', ic: 'calendar', t: `Frequenza ottima: ${fmtNum(freq, 1)} allenamenti/settimana`, s: `Obiettivo ${target}/sett rispettato. La costanza è il fattore n°1 dei risultati.` });
      else out.push({ tone: 'warn', ic: 'calendar', t: `Frequenza: ${fmtNum(freq, 1)}/sett su ${target} previsti`, s: 'Pianifica i giorni in anticipo (es. lun-mer-ven). Anche un allenamento breve vale più di uno saltato.' });
    }
    if (d.streak >= 2) out.push({ tone: 'good', ic: 'flame', t: `${d.streak} settimane consecutive di allenamento`, s: d.streak >= 6 ? 'Ottima continuità. Dopo 6–8 settimane valuta una settimana di scarico (stesse schede, carichi −30–40%).' : 'Continua così!' });

    // progressi e stalli sugli esercizi con carico
    const prog = [];
    const stalled = [];
    d.exHist.forEach((h) => {
      if (h.kind !== 'load' || !isWorkPhase(h.fase)) return;
      const pts = h.points.filter((x) => x.e1rm > 0);
      if (pts.length >= 2) prog.push({ name: h.name, pct: (pts.at(-1).e1rm / pts[0].e1rm - 1) * 100 });
      if (pts.length >= 4) {
        const bestBefore = Math.max(...pts.slice(0, -3).map((x) => x.e1rm));
        const bestRecent = Math.max(...pts.slice(-3).map((x) => x.e1rm));
        if (bestRecent <= bestBefore * 1.005) stalled.push(h.name);
      }
    });
    const top = prog.filter((x) => x.pct > 0.5).sort((a, b) => b.pct - a.pct).slice(0, 3);
    if (top.length) out.push({ tone: 'good', ic: 'trendUp', t: 'Esercizi in maggior progresso', s: top.map((x) => `${x.name} +${fmtNum(x.pct, 0)}%`).join(' · ') });
    if (stalled.length) out.push({ tone: 'warn', ic: 'trendFlat', t: `In stallo: ${stalled.slice(0, 3).join(', ')}`, s: 'Nessun miglioramento nelle ultime 3 sedute. Prova: scarico del 10% e risali, cura sonno e proteine, o rallenta la fase eccentrica.' });

    // equilibrio spinta / tirata
    let push = 0, pull = 0;
    d.inP.forEach((s) => d.work(s).forEach((l) => {
      const sm = d.planByEx.get(l.id_esercizio)?.schema_movimento || '';
      if (/spinta/i.test(sm)) push++;
      else if (/tirata/i.test(sm)) pull++;
    }));
    if (push + pull >= 12) {
      if (pull >= push) out.push({ tone: 'good', ic: 'target', t: `Equilibrio spinta/tirata ${push}:${pull}`, s: 'Bene: almeno quanta tirata quanta spinta protegge le spalle e la postura.' });
      else out.push({ tone: 'warn', ic: 'target', t: `Più spinta che tirata (${push}:${pull})`, s: 'Aggiungi serie di rematori o lat machine per bilanciare e proteggere le spalle.' });
    }

    // volume per muscolo
    const [lo] = volumeRange(p.livello);
    const low = d.muscArr.filter((m) => m.v < lo * 0.75).map((m) => m.g);
    if (d.muscArr.length && low.length) out.push({ tone: 'info', ic: 'dumbbell', t: `Volume basso: ${low.slice(0, 3).join(', ')}`, s: `Sotto le ${lo} serie/settimana consigliate per il tuo livello. Se sono gruppi che vuoi sviluppare, aggiungi 2–4 serie.` });

    // fatica percepita
    const rpes = d.ended.slice(0, 3).map((s) => s.rpe).filter((x) => x != null);
    if (rpes.length === 3) {
      const avg = rpes.reduce((a, b) => a + b, 0) / 3;
      if (avg >= 8.5) out.push({ tone: 'warn', ic: 'heart', t: `Fatica alta: RPE medio ${fmtNum(avg, 1)}`, s: 'Le ultime sedute sono state molto dure. Valuta qualche giorno più leggero, più sonno e un pasto in più.' });
      else if (avg <= 5) out.push({ tone: 'info', ic: 'zap', t: `Sedute facili: RPE medio ${fmtNum(avg, 1)}`, s: 'Hai margine: rispetta il RIR indicato e spingi un po\' di più sui carichi.' });
    }

    // peso corporeo vs obiettivo
    const ws = store.measurements.filter((m) => num(m.peso_kg) !== null);
    if (ws.length >= 2) {
      const a = ws.find((m) => daysSince(m.data) <= 35) || ws[0];
      const b = ws.at(-1);
      const days = Math.max(1, daysSince(a.data) - daysSince(b.data));
      if (days >= 10) {
        const perWeek = ((num(b.peso_kg) - num(a.peso_kg)) / num(a.peso_kg)) * 100 / (days / 7);
        const ob = String(p.obiettivo || '');
        const txt = `${perWeek >= 0 ? '+' : ''}${fmtNum(perWeek, 2)}% del peso a settimana`;
        if (/dimagr/i.test(ob)) out.push(perWeek <= -0.25 && perWeek >= -1 ? { tone: 'good', ic: 'scale', t: `Peso: ${txt}`, s: 'Ritmo corretto per perdere grasso mantenendo i muscoli (0,25–1% a settimana).' } : { tone: 'warn', ic: 'scale', t: `Peso: ${txt}`, s: perWeek < -1 ? 'Calo troppo rapido: rischi di perdere muscolo. Aumenta leggermente le calorie.' : 'Il peso non scende: riduci di 150–200 kcal al giorno e aumenta i passi.' });
        else if (/ipertrof/i.test(ob)) out.push(perWeek >= 0.1 && perWeek <= 0.5 ? { tone: 'good', ic: 'scale', t: `Peso: ${txt}`, s: 'Crescita pulita (0,25–0,5%/sett): perfetto per costruire muscolo.' } : { tone: 'warn', ic: 'scale', t: `Peso: ${txt}`, s: perWeek < 0.1 ? 'Il peso non sale: aggiungi 150–200 kcal al giorno.' : 'Aumento rapido: rischi di accumulare grasso, riduci un po\' le calorie.' });
      }
    }
    const lastM = store.measurements.at(-1);
    if (!lastM || daysSince(lastM.data) > 14) out.push({ tone: 'info', ic: 'scale', t: 'Misure da aggiornare', s: 'Pesati una volta a settimana per avere report affidabili.', link: '#/user' });
    return out;
  }

  function html(d) {
    const p = store.profile || {};
    const target = p.giorni_settimana || 3;
    let h = `<header class="page-head"><div><div class="eyebrow">Progressi</div><h1 class="h1">Il tuo <span class="accent">report</span></h1></div></header>
      <div class="seg" style="margin-bottom:16px">${[['4', '4 sett.'], ['12', '12 sett.'], ['all', 'Tutto']].map(([v, l]) => `<button class="${period === v ? 'active' : ''}" data-period="${v}">${l}</button>`).join('')}</div>`;

    if (!d.ended.length) {
      h += `<div class="empty card"><div class="ic">${icon('chart')}</div><h2 class="h2">Ancora nessun dato</h2>
        <p class="muted" style="margin:6px 0 18px">Completa il primo allenamento: qui vedrai progressi, volumi, record e i consigli del coach.</p>
        <a class="btn btn-primary" href="#/home">${icon('play')} Vai ad allenarti</a></div>`;
      h += bodySection();
      return h;
    }

    const vol = d.volOf(d.inP), volPrev = d.volOf(d.prevP);
    const dur = d.inP.filter((s) => s.durata_min).map((s) => s.durata_min);
    const durAvg = dur.length ? dur.reduce((a, b) => a + b, 0) / dur.length : null;
    const freq = d.inP.length / d.effWeeks;
    const delta = (a, b) => (period === 'all' || !b ? '' : `<div class="kpi-d ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${fmtNum(Math.abs((a / b - 1) * 100), 0)}% vs periodo prec.</div>`);

    h += `<section class="kpis">
      <div class="kpi"><div class="kpi-v">${d.inP.length}</div><div class="kpi-l">Allenamenti</div>${delta(d.inP.length, d.prevP.length)}</div>
      <div class="kpi"><div class="kpi-v">${fmtNum(freq, 1)}<small>/${target}</small></div><div class="kpi-l">A settimana</div><div class="meter"><i style="width:${Math.min(100, (freq / target) * 100)}%"></i></div></div>
      <div class="kpi"><div class="kpi-v">${vol >= 10000 ? `${fmtNum(vol / 1000, 1)}<small> t</small>` : `${fmtNum(vol, 0)}<small> kg</small>`}</div><div class="kpi-l">Volume sollevato</div>${delta(vol, volPrev)}</div>
      <div class="kpi"><div class="kpi-v">${durAvg ? fmtNum(durAvg, 0) : '—'}<small> min</small></div><div class="kpi-l">Durata media</div></div>
    </section>`;

    // costanza (heatmap 12 settimane)
    const ws0 = new Date(weekStart(new Date()).getTime() - 11 * WEEK);
    const today = dateKey(new Date());
    let cells = DOW.map((x) => `<span class="heat-l">${x}</span>`).join('');
    for (let w = 0; w < 12; w++) {
      for (let i = 0; i < 7; i++) {
        const day = new Date(ws0.getTime() + w * WEEK); day.setDate(day.getDate() + i);
        const k = dateKey(day);
        cells += `<i class="${d.days.has(k) ? 'on' : ''} ${k > today ? 'future' : ''} ${k === today ? 'today' : ''}" title="${fmtDate(day)}"></i>`;
      }
    }
    h += `<section class="section"><div class="section-title"><h2 class="h2">Costanza</h2><span class="chip ${d.streak ? 'chip-accent' : ''}">${icon('flame')} ${d.streak} sett. di fila</span></div>
      <div class="card"><div class="heat">${cells}</div><div class="small muted" style="margin-top:8px">Ultime 12 settimane</div></div></section>`;

    // consigli del coach
    const ins = insights(d);
    if (ins.length) {
      h += `<section class="section"><div class="section-title"><h2 class="h2">Analisi del coach</h2></div><div class="card">
        ${ins.map((x) => `<${x.link ? `a href="${x.link}"` : 'div'} class="insight"><span class="ins-ic ${x.tone}">${icon(x.ic)}</span><span><b>${esc(x.t)}</b><span class="small muted">${esc(x.s)}</span></span></${x.link ? 'a' : 'div'}>`).join('')}
      </div></section>`;
    }

    h += `<section class="section"><div class="section-title"><h2 class="h2">Volume settimanale</h2><span class="small muted">kg × rip</span></div>
      <div class="card"><div class="chart-box"><canvas id="ch-vol" aria-label="Volume settimanale"></canvas></div></div></section>`;

    if (d.muscArr.length) {
      const [lo, hi] = volumeRange(p.livello);
      h += `<section class="section"><div class="section-title"><h2 class="h2">Serie per muscolo</h2><span class="small muted">media/sett · ultime ${d.muscWeeks} sett.</span></div>
        <div class="card"><div class="chart-box" style="height:${Math.max(160, d.muscArr.length * 34)}px"><canvas id="ch-musc" aria-label="Serie settimanali per gruppo muscolare"></canvas></div>
        <div class="legend"><span><i style="background:${C.faint}"></i>&lt; ${lo}</span><span><i style="background:${C.accent}"></i>${lo}–${hi} ideale${p.livello ? ` (${esc(p.livello.toLowerCase())})` : ''}</span><span><i style="background:${C.warn}"></i>&gt; ${hi}</span></div></div></section>`;
    }

    // progressione esercizio
    const exList = [...d.exHist.values()].filter((x) => x.points.length && !/cardio/i.test(x.gruppo || ''));
    if (exList.length) {
      exList.sort((a, b) => isWorkPhase(b.fase) - isWorkPhase(a.fase) || (b.kind === 'load') - (a.kind === 'load') || b.points.length - a.points.length);
      if (!exSel || !d.exHist.has(exSel)) exSel = exList[0].id;
      h += `<section class="section"><div class="section-title"><h2 class="h2">Progressione</h2></div><div class="card">
        <label class="field"><span>Esercizio</span><select id="ex-sel">${[...exList].sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${esc(x.id)}" ${x.id === exSel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div id="ex-stats" class="kpis kpis-3" style="margin-top:12px"></div>
        <div class="chart-box" style="margin-top:12px"><canvas id="ch-ex" aria-label="Progressione esercizio"></canvas></div>
      </div></section>`;
    }

    // record personali
    const prs = [...d.exHist.values()].filter((x) => x.kind === 'load' && isWorkPhase(x.fase)).map((x) => {
      const best = x.points.reduce((b, pt) => (pt.e1rm > b.e1rm ? pt : b), x.points[0]);
      return { name: x.name, best };
    }).sort((a, b) => new Date(b.best.date) - new Date(a.best.date)).slice(0, 8);
    if (prs.length) {
      h += `<section class="section"><div class="section-title"><h2 class="h2">Record personali</h2><span class="small muted">1RM stimato</span></div><div class="card">
        ${prs.map((x) => `<div class="list-item"><span class="ins-ic good">${icon('trophy')}</span><span class="grow"><b>${esc(x.name)}</b><span class="small muted">${fmtNum(x.best.bestSet.kg, 2)} kg × ${x.best.bestSet.reps} · ${esc(fmtDate(x.best.date))}</span></span><b class="pr-v">${fmtNum(x.best.e1rm, 1)}<small> kg</small></b></div>`).join('')}
      </div></section>`;
    }

    // fatica
    const rpeS = [...d.inP].reverse().filter((s) => s.rpe);
    if (rpeS.length >= 2) {
      h += `<section class="section"><div class="section-title"><h2 class="h2">Fatica percepita</h2><span class="small muted">RPE sessione</span></div>
        <div class="card"><div class="chart-box" style="height:180px"><canvas id="ch-rpe" aria-label="RPE delle sessioni"></canvas></div></div></section>`;
    }

    h += bodySection();

    // storico
    h += `<section class="section"><div class="section-title"><h2 class="h2">Storico allenamenti</h2>
        <button class="btn btn-ghost btn-sm" data-act="export">${icon('download')} CSV</button></div>
      <div class="card">${d.inP.length ? d.inP.map((s) => {
        const w = d.work(s);
        const v = w.reduce((a, l) => a + (num(l.kg) || 0) * (l.reps || 0), 0);
        return `<button class="list-item hist" data-session="${esc(s.id)}">
          <span class="hist-date"><b>${new Date(s.started_at).getDate()}</b><span>${esc(fmtDate(s.started_at, { month: 'short' }))}</span></span>
          <span class="grow"><b>${esc(s.nome_scheda || '')}</b><span class="small muted">${s.durata_min ?? '—'} min · ${w.length} serie · ${fmtNum(v, 0)} kg${s.rpe ? ` · RPE ${s.rpe}` : ''}</span></span>
          ${icon('chevronRight')}</button>`;
      }).join('') : '<p class="small muted">Nessun allenamento nel periodo selezionato.</p>'}</div></section>`;
    return h;
  }

  function bodySection() {
    const ws = store.measurements.filter((m) => num(m.peso_kg) !== null);
    if (ws.length < 2) {
      return `<section class="section"><div class="section-title"><h2 class="h2">Peso corporeo</h2></div>
        <a href="#/user" class="banner info">${icon('scale')}<span class="grow">Registra il peso almeno 2 volte per vedere l'andamento.</span>${icon('chevronRight')}</a></section>`;
    }
    const a = ws[0], b = ws.at(-1);
    const diff = num(b.peso_kg) - num(a.peso_kg);
    return `<section class="section"><div class="section-title"><h2 class="h2">Peso corporeo</h2>
      <span class="chip">${diff > 0 ? '+' : ''}${fmtNum(diff, 1)} kg dal ${esc(fmtDate(a.data, { day: 'numeric', month: 'short' }))}</span></div>
      <div class="card"><div class="chart-box"><canvas id="ch-body" aria-label="Andamento peso corporeo"></canvas></div></div></section>`;
  }

  function mk(id, cfg) {
    const el = root.querySelector(`#${id}`);
    if (!el || !window.Chart) return null;
    const c = new window.Chart(el, cfg);
    charts.push(c);
    return c;
  }
  const scales = (extra = {}) => ({
    x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
    y: { beginAtZero: true, grid: { color: C.grid }, ticks: { maxTicksLimit: 5 } },
    ...extra,
  });

  function drawExChart(d) {
    const h = d.exHist.get(exSel);
    const statsEl = root.querySelector('#ex-stats');
    if (!h || !statsEl) return;
    const old = charts.findIndex((c) => c.canvas.id === 'ch-ex');
    if (old >= 0) charts.splice(old, 1)[0].destroy();
    const pts = h.points;
    const labels = pts.map((x) => fmtDate(x.date, { day: 'numeric', month: 'short' }));
    let datasets, stats;
    if (h.kind === 'load') {
      const first = pts.find((x) => x.e1rm > 0), last = [...pts].reverse().find((x) => x.e1rm > 0);
      const best = pts.reduce((b, x) => (x.e1rm > b.e1rm ? x : b), pts[0]);
      const pct = first && last ? (last.e1rm / first.e1rm - 1) * 100 : 0;
      stats = [[`${fmtNum(last?.e1rm, 1)}`, '1RM stimato (kg)'], [`${pct >= 0 ? '+' : ''}${fmtNum(pct, 0)}%`, 'dal primo'], [`${fmtNum(best.bestSet.kg, 2)}×${best.bestSet.reps}`, 'miglior serie']];
      datasets = [
        { label: '1RM stimato', data: pts.map((x) => x.e1rm || null), borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: C.accent },
        { label: 'Carico max', data: pts.map((x) => x.topKg || null), borderColor: C.muted, borderDash: [4, 4], pointRadius: 2, tension: 0.3 },
      ];
    } else if (h.kind === 'reps') {
      const best = Math.max(...pts.map((x) => x.reps));
      stats = [[`${pts.at(-1).reps}`, 'rip totali ultima'], [`${best}`, 'record rip totali'], [`${pts.length}`, 'sedute']];
      datasets = [{ label: 'Ripetizioni totali', data: pts.map((x) => x.reps), borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.3, pointRadius: 3 }];
    } else {
      const best = Math.max(...pts.map((x) => x.dur));
      stats = [[fmtSec(pts.at(-1).dur), 'ultima durata'], [fmtSec(best), 'record'], [`${pts.length}`, 'sedute']];
      datasets = [{ label: 'Secondi', data: pts.map((x) => x.dur), borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.3, pointRadius: 3 }];
    }
    statsEl.innerHTML = stats.map(([v, l]) => `<div class="kpi sm"><div class="kpi-v">${esc(v)}</div><div class="kpi-l">${esc(l)}</div></div>`).join('');
    mk('ch-ex', { type: 'line', data: { labels, datasets }, options: { scales: scales({ y: { beginAtZero: false, grid: { color: C.grid }, ticks: { maxTicksLimit: 5 } } }), plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 10, boxHeight: 2 } } } } });
  }

  function mountCharts(d) {
    if (!window.Chart) {
      root.querySelectorAll('.chart-box').forEach((b) => { b.innerHTML = '<p class="small muted">Grafici non disponibili (libreria non caricata).</p>'; b.style.height = 'auto'; });
      return;
    }
    mk('ch-vol', {
      type: 'bar',
      data: { labels: d.weekly.map((w) => w.label), datasets: [{ data: d.weekly.map((w) => Math.round(w.vol)), backgroundColor: d.weekly.map((_, i) => (i === d.weekly.length - 1 ? C.accent : 'rgba(255,212,59,.45)')), borderRadius: 6, maxBarThickness: 28 }] },
      options: { scales: scales(), plugins: { tooltip: { callbacks: { label: (c) => `${fmtNum(c.raw, 0)} kg · ${d.weekly[c.dataIndex].n} allenamenti` } } } },
    });
    if (d.muscArr.length) {
      const [lo, hi] = volumeRange(store.profile?.livello);
      mk('ch-musc', {
        type: 'bar',
        data: { labels: d.muscArr.map((m) => m.g), datasets: [{ data: d.muscArr.map((m) => +m.v.toFixed(1)), backgroundColor: d.muscArr.map((m) => (m.v < lo ? C.faint : m.v > hi ? C.warn : C.accent)), borderRadius: 6, maxBarThickness: 18 }] },
        options: { indexAxis: 'y', scales: { x: { beginAtZero: true, suggestedMax: hi + 2, grid: { color: C.grid } }, y: { grid: { display: false }, ticks: { color: C.text } } }, plugins: { tooltip: { callbacks: { label: (c) => `${fmtNum(c.raw, 1)} serie/settimana` } } } },
      });
    }
    drawExChart(d);
    const rpeS = [...d.inP].reverse().filter((s) => s.rpe);
    if (rpeS.length >= 2) {
      mk('ch-rpe', {
        type: 'line',
        data: { labels: rpeS.map((s) => fmtDate(s.started_at, { day: 'numeric', month: 'short' })), datasets: [{ data: rpeS.map((s) => s.rpe), borderColor: C.accent, pointBackgroundColor: rpeS.map((s) => (s.rpe >= 9 ? C.warn : C.accent)), tension: 0.3, pointRadius: 3 }] },
        options: { scales: scales({ y: { min: 1, max: 10, grid: { color: C.grid }, ticks: { stepSize: 3 } } }) },
      });
    }
    const ws = store.measurements.filter((m) => num(m.peso_kg) !== null);
    if (ws.length >= 2) {
      const vita = store.measurements.some((m) => num(m.vita_cm) !== null);
      const datasets = [{ label: 'Peso (kg)', data: ws.map((m) => num(m.peso_kg)), borderColor: C.accent, backgroundColor: C.accentSoft, fill: true, tension: 0.3, pointRadius: 3, yAxisID: 'y' }];
      if (vita) datasets.push({ label: 'Vita (cm)', data: ws.map((m) => num(m.vita_cm)), borderColor: C.muted, borderDash: [4, 4], pointRadius: 2, tension: 0.3, yAxisID: 'y1', spanGaps: true });
      mk('ch-body', {
        type: 'line',
        data: { labels: ws.map((m) => fmtDate(m.data, { day: 'numeric', month: 'short' })), datasets },
        options: {
          scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } }, y: { grid: { color: C.grid }, ticks: { maxTicksLimit: 5 } }, ...(vita ? { y1: { position: 'right', grid: { display: false }, ticks: { maxTicksLimit: 5 } } } : {}) },
          plugins: { legend: { display: vita, labels: { boxWidth: 10, boxHeight: 2 } } },
        },
      });
    }
  }

  function sessionDetail(d, s) {
    const logs = (d.bySession.get(s.id) || []).sort((a, b) => String(a.id_riga).localeCompare(String(b.id_riga)) || a.serie_n - b.serie_n);
    const byEx = new Map();
    logs.forEach((l) => { if (!byEx.has(l.id_riga)) byEx.set(l.id_riga, []); byEx.get(l.id_riga).push(l); });
    const vol = d.work(s).reduce((a, l) => a + (num(l.kg) || 0) * (l.reps || 0), 0);
    const { close } = openModal({
      title: s.nome_scheda || 'Allenamento',
      body: `<div class="small muted">${esc(fmtDateTime(s.started_at))}</div>
        <div class="kpis kpis-3" style="margin:12px 0">
          <div class="kpi sm"><div class="kpi-v">${s.durata_min ?? '—'}</div><div class="kpi-l">minuti</div></div>
          <div class="kpi sm"><div class="kpi-v">${fmtNum(vol, 0)}</div><div class="kpi-l">kg volume</div></div>
          <div class="kpi sm"><div class="kpi-v">${s.rpe ?? '—'}</div><div class="kpi-l">RPE</div></div>
        </div>
        ${s.note ? `<div class="notes" style="margin-bottom:12px">${esc(s.note)}</div>` : ''}
        ${[...byEx.values()].map((ls) => `<div class="kv"><span>${esc(ls[0].esercizio)}</span><span class="muted right">${ls.map((l) => (l.durata_sec ? fmtSec(l.durata_sec) : l.kg ? `${fmtNum(l.kg, 2)}×${l.reps}` : `${l.reps ?? '–'}`)).join(' · ')}</span></div>`).join('') || '<p class="small muted">Nessuna serie registrata.</p>'}
        <button class="btn btn-danger btn-block" style="margin-top:16px" data-del-session>${icon('trash')} Elimina allenamento</button>`,
      onMount: (el) => {
        el.querySelector('[data-del-session]').onclick = async () => {
          if (!(await confirmDialog('Eliminare l\'allenamento?', 'Verranno eliminate anche tutte le serie registrate.', 'Elimina', true))) return;
          try {
            await db.deleteSession(s.id);
            store.sessions = store.sessions.filter((x) => x.id !== s.id);
            store.sets = store.sets.filter((l) => l.session_id !== s.id);
            close();
            draw();
            toast('Allenamento eliminato');
          } catch (e) { toast(errMsg(e), 'error'); }
        };
      },
    });
  }

  function exportHistory() {
    const sById = new Map(store.sessions.map((s) => [s.id, s]));
    const data = store.sets.filter((l) => sById.get(l.session_id)?.ended_at)
      .map((l) => { const s = sById.get(l.session_id); return [dateKey(s.started_at), s.nome_programma, s.nome_scheda, l.esercizio, l.fase, l.gruppo_muscolare, l.serie_n, l.kg ?? '', l.reps ?? '', l.durata_sec ?? '', s.rpe ?? '', s.durata_min ?? '']; })
      .sort((a, b) => String(a[0]).localeCompare(b[0]));
    downloadText(`storico_allenamenti_${dateKey(new Date())}.csv`, window.Papa.unparse({ fields: ['Data', 'Programma', 'Scheda', 'Esercizio', 'Fase', 'Gruppo_Muscolare', 'Serie', 'Kg', 'Ripetizioni', 'Durata_Sec', 'RPE_Sessione', 'Durata_Min'], data }));
  }

  let data;
  function draw() {
    destroy();
    data = compute();
    root.innerHTML = html(data);
    mountCharts(data);
  }

  root.onclick = (e) => {
    const pb = e.target.closest('[data-period]');
    if (pb) { period = pb.dataset.period; lsSet('wdb_period', period); draw(); return; }
    const sb = e.target.closest('[data-session]');
    if (sb) { const s = store.sessions.find((x) => x.id === sb.dataset.session); if (s) sessionDetail(data, s); return; }
    if (e.target.closest('[data-act="export"]')) exportHistory();
  };
  root.onchange = (e) => {
    if (e.target.id === 'ex-sel') { exSel = e.target.value; drawExChart(data); }
  };

  draw();
  return destroy;
}
