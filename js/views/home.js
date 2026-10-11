import { icon } from '../icons.js';
import { esc, fmtDate, daysSince, relDays, toast, confirmDialog, errMsg, dateKey, weekStart, lsDel } from '../utils.js';
import { groupPlan, activeProgram, nextScheda, estimateMinutes, workingSets, mainMuscles, trainedDays, targetChips, ageFrom } from '../training.js';

const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export async function render(root, { app }) {
  const { store, db } = app;
  const expanded = new Set();

  async function start(prog, scheda) {
    const open = store.sessions.find((s) => !s.ended_at);
    if (open) {
      const ok = await confirmDialog('Allenamento in corso', `Hai già un allenamento aperto (${open.nome_scheda}). Vuoi riprenderlo?`, 'Riprendi');
      if (ok) location.hash = '#/workout';
      return;
    }
    try {
      const s = await db.createSession({
        id_programma: prog.id, nome_programma: prog.nome,
        id_scheda: scheda.id, nome_scheda: scheda.nome,
        started_at: new Date().toISOString(),
      });
      store.sessions.unshift(s);
      location.hash = '#/workout';
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  function draw() {
    const programs = groupPlan(store.plan);
    const firstName = (store.profile?.nome || '').trim().split(/\s+/)[0];
    const open = store.sessions.find((s) => !s.ended_at);
    const lastM = store.measurements.at(-1);
    const mDays = daysSince(lastM?.data);
    const age = ageFrom(store.profile?.data_nascita);

    let h = `<header class="page-head"><div>
      <div class="eyebrow">${esc(fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
      <h1 class="h1">${firstName ? `Ciao, <span class="accent">${esc(firstName)}</span>` : 'Pronto ad <span class="accent">allenarti?</span>'}</h1>
    </div></header>`;

    if (app.demo) {
      h += `<div class="banner info">${icon('info')}<span><b>Modalità demo</b>: i dati restano solo in questo browser.</span></div>`;
    }

    if (open) {
      const done = store.sets.filter((l) => l.session_id === open.id).length;
      h += `<a href="#/workout" class="card resume">
        <span class="pulse"></span>
        <div class="grow"><div class="eyebrow accent">Allenamento in corso</div>
        <div class="resume-title">${esc(open.nome_scheda)}</div>
        <div class="small muted">Iniziato ${esc(fmtDate(open.started_at, { hour: '2-digit', minute: '2-digit' }))} · ${done} serie registrate</div></div>
        <span class="btn btn-primary btn-sm">Riprendi ${icon('chevronRight')}</span></a>`;
    }

    if (!store.profile?.altezza_cm || mDays === null || mDays > 14) {
      const text = mDays === null ? 'Inserisci peso e misure per tracciare i progressi.' : `Ultima misurazione ${relDays(mDays)}: aggiorna peso e misure.`;
      h += `<a href="#/user" class="banner warn">${icon('scale')}<span class="grow">${text}</span>${icon('chevronRight')}</a>`;
    }

    if (!programs.length) {
      h += `<div class="empty card"><div class="ic">${icon('upload')}</div>
        <h2 class="h2">Nessuna scheda</h2>
        <p class="muted" style="margin:6px 0 18px">Importa il file CSV con la tua scheda per iniziare ad allenarti.</p>
        <a href="#/plan" class="btn btn-primary">${icon('upload')} Importa scheda</a></div>`;
      root.innerHTML = h;
      return;
    }

    const prog = activeProgram(programs, store.profile);
    const next = nextScheda(prog, store.sessions);

    if (programs.length > 1) {
      h += `<div class="chips scroll-x" style="margin:4px 0 12px">${programs.map((p) =>
        `<button class="chip ${p.id === prog.id ? 'chip-accent' : ''}" data-prog="${esc(p.id)}">${esc(p.nome)}</button>`).join('')}</div>`;
    }

    const lastNext = store.sessions.find((s) => s.ended_at && s.id_programma === prog.id && s.id_scheda === next.id);
    h += `<section class="hero">
      <div class="eyebrow">Prossimo allenamento · ${esc(prog.nome)}</div>
      <div class="hero-title">${esc(next.nome)}</div>
      <div class="stat-row">
        <div class="stat"><b>${next.rows.length}</b><span>esercizi</span></div>
        <div class="stat"><b>${workingSets(next.rows)}</b><span>serie allenanti</span></div>
        <div class="stat"><b>~${estimateMinutes(next.rows)}</b><span>minuti</span></div>
      </div>
      <div class="chips">${mainMuscles(next.rows).map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div>
      <button class="btn btn-primary btn-lg btn-block" style="margin-top:16px" data-start="${esc(next.id)}">${icon('play')} Inizia allenamento</button>
      <div class="small muted center" style="margin-top:10px">${lastNext ? `Ultima volta ${relDays(daysSince(lastNext.started_at))}` : 'Mai eseguita finora'}</div>
    </section>`;

    // settimana corrente
    const ws = weekStart(new Date());
    const days = trainedDays(store.sessions);
    const target = store.profile?.giorni_settimana || 3;
    let count = 0;
    const cells = DAYS.map((d, i) => {
      const day = new Date(ws); day.setDate(ws.getDate() + i);
      const k = dateKey(day);
      const on = days.has(k);
      if (on) count++;
      return `<div class="day ${on ? 'done' : ''} ${k === dateKey(new Date()) ? 'today' : ''}"><span>${d}</span><b>${day.getDate()}</b></div>`;
    }).join('');
    h += `<section class="section">
      <div class="section-title"><h2 class="h2">Questa settimana</h2><span class="chip ${count >= target ? 'chip-success' : 'chip-accent'}">${count}/${target} allenamenti</span></div>
      <div class="week">${cells}</div>
    </section>`;

    // tutte le schede
    h += `<section class="section"><div class="section-title"><h2 class="h2">Le tue schede</h2></div>
      ${prog.schede.map((s) => {
        const last = store.sessions.find((x) => x.ended_at && x.id_programma === prog.id && x.id_scheda === s.id);
        const isOpen = expanded.has(s.id);
        return `<div class="card sched ${isOpen ? 'open' : ''}">
          <button class="sched-head" data-toggle="${esc(s.id)}" aria-expanded="${isOpen}">
            <span class="sched-badge">${esc(String(s.id).slice(0, 2))}</span>
            <span class="grow"><span class="sched-name">${esc(s.nome)}${s.id === next.id ? ' <span class="chip chip-accent chip-xs">Prossima</span>' : ''}</span>
            <span class="small muted">${s.rows.length} esercizi · ~${estimateMinutes(s.rows)} min · ${last ? `ultima ${relDays(daysSince(last.started_at))}` : 'mai eseguita'}</span></span>
            <span class="ex-chev">${icon('chevronDown')}</span>
          </button>
          ${isOpen ? `<div class="sched-list">${s.rows.map((r) => `<div class="mini-ex"><span class="mini-n">${r.ordine_esecuzione ?? ''}</span><span class="grow"><span>${esc(r.esercizio)}</span><span class="small muted">${esc(targetChips(r, age).slice(0, 2).join(' · '))}</span></span></div>`).join('')}
            <button class="btn btn-outline btn-block" style="margin-top:12px" data-start="${esc(s.id)}">${icon('play')} Inizia ${esc(s.nome)}</button></div>` : ''}
        </div>`;
      }).join('')}
    </section>`;

    root.innerHTML = h;

    root.onclick = async (e) => {
      const st = e.target.closest('[data-start]');
      if (st) { st.disabled = true; await start(prog, prog.schede.find((s) => s.id === st.dataset.start)); st.disabled = false; return; }
      const tg = e.target.closest('[data-toggle]');
      if (tg) { const id = tg.dataset.toggle; expanded.has(id) ? expanded.delete(id) : expanded.add(id); draw(); return; }
      const pg = e.target.closest('[data-prog]');
      if (pg) {
        try { store.profile = await db.saveProfile({ programma_attivo: pg.dataset.prog }); } catch (err) { toast(errMsg(err), 'error'); }
        draw();
      }
    };
  }

  // pulizia bozze di sessioni non più aperte
  try {
    const openIds = new Set(store.sessions.filter((s) => !s.ended_at).map((s) => s.id));
    Object.keys(localStorage).filter((k) => k.startsWith('wdb_draft_') && !openIds.has(k.slice(10))).forEach(lsDel);
  } catch { /* ignora */ }

  draw();
}
