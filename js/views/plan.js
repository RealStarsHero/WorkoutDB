import { icon } from '../icons.js';
import { esc, num, fmtDateTime, toast, confirmDialog, errMsg, downloadText, daysSince, relDays, parseVideo, openModal } from '../utils.js';
import { groupPlan, targetChips, ageFrom, estimateMinutes } from '../training.js';
import { exerciseDetail } from './common.js';

// Colonne del CSV (nome originale → tipo). L'ordine è quello usato anche per l'export.
const COLS = [
  ['ID_Riga', 'text'], ['ID_Programma', 'text'], ['Nome_Programma', 'text'], ['ID_Scheda', 'text'], ['Nome_Scheda', 'text'],
  ['Ordine_Esecuzione', 'int'], ['Fase', 'text'], ['ID_Esercizio', 'text'], ['Esercizio', 'text'], ['Gruppo_Muscolare', 'text'],
  ['Muscoli_Secondari', 'text'], ['Schema_Movimento', 'text'], ['Attrezzo', 'text'], ['Tipo_Misura', 'upper'], ['Serie', 'int'],
  ['Ripetizioni_Min', 'int'], ['Ripetizioni_Max', 'int'], ['Durata_Secondi', 'int'], ['Per_Lato', 'bool'], ['Recupero_Secondi', 'int'],
  ['Carico_Kg', 'num'], ['RIR_Target', 'num'], ['Tempo_Esecuzione', 'text'], ['Zona_FC', 'text'], ['ID_Superserie', 'text'],
  ['Metodo_Progressione', 'upper'], ['Incremento_Kg', 'num'], ['Note_Esecuzione', 'text'], ['URL_Video', 'text'],
];
const REQUIRED = ['id_riga', 'id_programma', 'id_scheda', 'esercizio'];
const norm = (h) => String(h || '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, '_');
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function readText(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf); // CSV salvato da Excel
  return t.replace(/^﻿/, '');
}

function convert(v, type) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (s === '') return { v: type === 'bool' ? false : null };
  switch (type) {
    case 'int': { const n = num(s); return n === null ? { v: null, bad: true } : { v: Math.round(n) }; }
    case 'num': { const n = num(s); return n === null ? { v: null, bad: true } : { v: n }; }
    case 'bool': return { v: /^(1|true|si|sì|yes|x|vero)$/i.test(s) };
    case 'upper': return { v: s.toUpperCase() };
    default: return { v: s };
  }
}

export function parsePlanCsv(text) {
  const res = window.Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: norm });
  const errors = [];
  const warnings = [];
  const fields = res.meta.fields || [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) {
    errors.push(`Colonne obbligatorie mancanti: ${missing.map((m) => COLS.find(([n]) => norm(n) === m)?.[0] || m).join(', ')}`);
    return { rows: [], errors, warnings };
  }
  const known = new Set(COLS.map(([n]) => norm(n)));
  const extra = fields.filter((f) => f && !known.has(f));
  if (extra.length) warnings.push(`Colonne ignorate: ${extra.join(', ')}`);

  const rows = [];
  const seen = new Set();
  res.data.forEach((raw, i) => {
    const line = i + 2;
    const r = {};
    for (const [name, type] of COLS) {
      const k = norm(name);
      const { v, bad } = convert(raw[k], type);
      if (bad) warnings.push(`Riga ${line}: valore non numerico in ${name} ("${raw[k]}"), ignorato`);
      r[k] = v;
    }
    const miss = REQUIRED.filter((c) => !r[c]);
    if (miss.length) { errors.push(`Riga ${line}: manca ${miss.join(', ')}`); return; }
    if (seen.has(r.id_riga)) { errors.push(`Riga ${line}: ID_Riga duplicato "${r.id_riga}"`); return; }
    seen.add(r.id_riga);
    r.id_esercizio = r.id_esercizio || slug(r.esercizio);
    r.ordine_esecuzione = r.ordine_esecuzione ?? rows.filter((x) => x.id_scheda === r.id_scheda).length + 1;
    r.fase = r.fase || 'Allenamento';
    r.tipo_misura = r.tipo_misura || 'RIPETIZIONI';
    r.serie = r.serie || 1;
    r.metodo_progressione = r.metodo_progressione || 'NESSUNA';
    if (r.url_video && !parseVideo(r.url_video)) warnings.push(`Riga ${line}: URL_Video non valido (deve iniziare con http/https)`);
    if (r.tipo_misura === 'TEMPO' && !r.durata_secondi) warnings.push(`Riga ${line}: ${r.esercizio} è a TEMPO ma senza Durata_Secondi`);
    rows.push(r);
  });
  (res.errors || []).slice(0, 5).forEach((e) => warnings.push(`Riga ${(e.row ?? 0) + 2}: ${e.message}`));
  return { rows, errors, warnings };
}

// Legenda dei termini tecnici: letta ogni volta dalla tabella "legenda" del DB
function openLegenda(db) {
  openModal({
    title: 'Legenda',
    body: '<div class="legenda" aria-live="polite"><div class="spinner sm-dark"></div></div>',
    onMount: async (el) => {
      const box = el.querySelector('.legenda');
      let items;
      try {
        items = await db.listLegenda();
      } catch (e) {
        const msg = /legenda/i.test(e?.message || '') && /schema cache|does not exist/i.test(e?.message || '')
          ? 'La tabella della legenda non esiste ancora: esegui lo script supabase/legenda.sql nel SQL Editor di Supabase.'
          : errMsg(e);
        box.innerHTML = `<div class="banner warn">${icon('alert')}<span>${esc(msg)}</span></div>`;
        return;
      }
      if (!items.length) {
        box.innerHTML = `<p class="muted center">Nessun termine presente nella legenda.</p>`;
        return;
      }
      const groups = [];
      for (const it of items) {
        const cat = it.categoria || 'Generale';
        let g = groups.find((x) => x.cat === cat);
        if (!g) groups.push(g = { cat, items: [] });
        g.items.push(it);
      }
      box.innerHTML = `<label class="faq-search">${icon('search')}<input type="search" placeholder="Cerca un termine…" aria-label="Cerca un termine"></label>
        ${groups.map((g) => `<section class="faq-group"><div class="eyebrow">${esc(g.cat)}</div>
          ${g.items.map((it) => `<details class="faq" data-text="${esc(`${it.termine} ${it.descrizione} ${it.esempio || ''}`.toLowerCase())}">
            <summary><span>${esc(it.termine)}</span>${icon('chevronDown')}</summary>
            <div class="faq-body"><p>${esc(it.descrizione)}</p>${it.esempio ? `<p class="faq-ex"><b>Esempio:</b> ${esc(it.esempio)}</p>` : ''}</div>
          </details>`).join('')}</section>`).join('')}
        <p class="muted center faq-none" hidden>Nessun termine trovato.</p>`;
      box.querySelector('input').oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        let any = false;
        box.querySelectorAll('.faq-group').forEach((g) => {
          let vis = 0;
          g.querySelectorAll('.faq').forEach((f) => { const on = !q || f.dataset.text.includes(q); f.hidden = !on; if (on) vis++; });
          g.hidden = !vis;
          if (vis) any = true;
        });
        box.querySelector('.faq-none').hidden = any;
      };
    },
  });
}

export async function render(root, { app }) {
  const { store, db } = app;
  let parsed = null;   // { file, rows, errors, warnings }
  let removeMissing = true;
  let selProg = null;
  let selScheda = null;
  const age = ageFrom(store.profile?.data_nascita);

  function previewHTML() {
    const { rows, errors, warnings, file } = parsed;
    const progs = groupPlan(rows);
    const exUnique = new Set(rows.map((r) => r.id_esercizio)).size;
    const videos = rows.filter((r) => parseVideo(r.url_video)).length;
    return `<div class="stack">
      <div class="row between"><div class="row grow">${icon('file')}<b class="ellipsis">${esc(file.name)}</b></div>
        <button class="icon-btn" data-act="cancel" aria-label="Annulla import">${icon('x')}</button></div>
      ${errors.length ? `<div class="banner danger">${icon('alert')}<div><b>Il file contiene errori</b><ul class="msg-list">${errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>${errors.length > 8 ? `<div class="small">…e altri ${errors.length - 8}</div>` : ''}</div></div>` : ''}
      <div class="kpis kpis-3">
        <div class="kpi"><div class="kpi-v">${rows.length}</div><div class="kpi-l">righe valide</div></div>
        <div class="kpi"><div class="kpi-v">${exUnique}</div><div class="kpi-l">esercizi</div></div>
        <div class="kpi"><div class="kpi-v">${videos}</div><div class="kpi-l">con video</div></div>
      </div>
      ${progs.map((p) => `<div><div class="eyebrow">${esc(p.nome)}</div><div class="chips" style="margin-top:6px">${p.schede.map((s) => `<span class="chip">${esc(s.nome)} · ${s.rows.length} es.</span>`).join('')}</div></div>`).join('')}
      ${warnings.length ? `<details class="banner warn"><summary>${icon('alert')} ${warnings.length} avvisi</summary><ul class="msg-list">${warnings.slice(0, 20).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      <label class="check"><input type="checkbox" id="rm-missing" ${removeMissing ? 'checked' : ''}><span>Rimuovi dalla scheda gli esercizi di questo programma non più presenti nel file</span></label>
      <button class="btn btn-primary btn-lg btn-block" data-act="import" ${errors.length || !rows.length ? 'disabled' : ''}>${icon('upload')} Importa ${rows.length} righe</button>
      <p class="small muted">Le righe con lo stesso <b>ID_Riga</b> vengono aggiornate, le nuove aggiunte. Lo storico degli allenamenti non viene toccato.</p>
    </div>`;
  }

  function draw() {
    const programs = groupPlan(store.plan);
    const lastImp = store.imports[0];
    let h = `<header class="page-head"><div><div class="eyebrow">Programma</div><h1 class="h1">La tua <span class="accent">scheda</span></h1></div>
      <button class="btn btn-ghost btn-sm" data-act="legenda">${icon('help')} Legenda</button></header>`;

    h += `<section class="card stack">
      <div class="row between"><h2 class="h2">Importa CSV</h2>
        ${lastImp ? `<span class="chip ${daysSince(lastImp.created_at) > 60 ? 'chip-warn' : 'chip-success'}">${icon('clock')} ${esc(relDays(daysSince(lastImp.created_at)))}</span>` : ''}</div>
      ${lastImp ? `<div class="small muted">Ultimo import: <b>${esc(fmtDateTime(lastImp.created_at))}</b> · ${esc(lastImp.file_name || '')} · ${lastImp.righe} righe${lastImp.rimossi ? ` · ${lastImp.rimossi} rimosse` : ''}</div>` : ''}
      ${parsed ? previewHTML() : `<label class="dropzone" id="dz">
        <input type="file" accept=".csv,text/csv" id="csv" hidden>
        <div class="ic">${icon('upload')}</div>
        <b>Scegli il file .csv</b>
        <span class="small muted">Separatore virgola o punto e virgola · UTF-8</span>
      </label>`}
    </section>`;

    if (programs.length) {
      const prog = programs.find((p) => p.id === selProg) || programs.find((p) => p.id === store.profile?.programma_attivo) || programs[0];
      selProg = prog.id;
      const sch = prog.schede.find((s) => s.id === selScheda) || prog.schede[0];
      selScheda = sch.id;
      h += `<section class="section">
        <div class="section-title"><h2 class="h2">Programmi</h2>
          <button class="btn btn-ghost btn-sm" data-act="export">${icon('download')} Esporta CSV</button></div>
        ${programs.length > 1 ? `<div class="chips scroll-x" style="margin-bottom:12px">${programs.map((p) => `<button class="chip ${p.id === prog.id ? 'chip-accent' : ''}" data-prog="${esc(p.id)}">${esc(p.nome)}</button>`).join('')}</div>` : ''}
        <div class="card">
          <div class="row between"><div><div class="eyebrow">${esc(prog.id)}</div><div class="h2">${esc(prog.nome)}</div></div></div>
          <div class="seg" style="margin:14px 0 6px">${prog.schede.map((s) => `<button class="${s.id === sch.id ? 'active' : ''}" data-scheda="${esc(s.id)}">${esc(s.nome)}</button>`).join('')}</div>
          <div class="small muted" style="margin:8px 2px">${sch.rows.length} esercizi · ~${estimateMinutes(sch.rows)} min</div>
          <div class="plan-list">${sch.rows.map((r) => `<button class="plan-ex" data-riga="${esc(r.id_riga)}">
              <span class="mini-n">${esc(r.ordine_esecuzione ?? '')}</span>
              <span class="grow"><span class="plan-name">${esc(r.esercizio)}</span><span class="small muted">${esc(r.fase || '')} · ${esc(targetChips(r, age).slice(0, 2).join(' · '))}</span></span>
              ${parseVideo(r.url_video) ? `<span class="accent" title="Video disponibile">${icon('video')}</span>` : `<span class="faint" title="Video non disponibile">${icon('alert')}</span>`}
            </button>`).join('')}</div>
          <button class="btn btn-danger btn-block" style="margin-top:14px" data-act="delprog">${icon('trash')} Elimina programma</button>
        </div>
      </section>`;
    }

    if (store.imports.length > 1) {
      h += `<section class="section"><div class="section-title"><h2 class="h2">Storico import</h2></div><div class="card">
        ${store.imports.slice(0, 10).map((i) => `<div class="list-item">
          <span class="ins-ic">${icon('file')}</span>
          <span class="grow"><b class="ellipsis">${esc(i.file_name || 'File CSV')}</b>
          <span class="small muted ellipsis">${esc(i.programmi || '')}</span>
          <span class="small muted">${esc(fmtDateTime(i.created_at))} · ${i.righe} righe${i.rimossi ? ` · ${i.rimossi} rimosse` : ''}</span></span>
        </div>`).join('')}
      </div></section>`;
    }

    root.innerHTML = h;
    bindDropzone();
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !/csv|text/.test(file.type)) { toast('Seleziona un file .csv', 'error'); return; }
    if (!window.Papa) { toast('Libreria CSV non caricata: controlla la connessione.', 'error'); return; }
    try {
      const text = await readText(file);
      parsed = { file, ...parsePlanCsv(text) };
    } catch (e) { toast(`Impossibile leggere il file: ${errMsg(e)}`, 'error'); return; }
    draw();
  }

  function bindDropzone() {
    const dz = root.querySelector('#dz');
    if (!dz) return;
    const input = dz.querySelector('#csv');
    input.onchange = () => handleFile(input.files[0]);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = () => dz.classList.remove('drag');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); };
  }

  async function doImport(btn) {
    const { rows, file } = parsed;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner sm"></span> Importazione…`;
    try {
      const progIds = [...new Set(rows.map((r) => r.id_programma))];
      await db.upsertPlan(rows);
      let removed = 0;
      if (removeMissing) {
        const keep = new Set(rows.map((r) => r.id_riga));
        const toDel = store.plan.filter((r) => progIds.includes(r.id_programma) && !keep.has(r.id_riga)).map((r) => r.id_riga);
        if (toDel.length) await db.deletePlanRows(toDel);
        removed = toDel.length;
      }
      const names = [...new Set(rows.map((r) => r.nome_programma || r.id_programma))];
      await db.addImport({ file_name: file.name, righe: rows.length, programmi: names.join(', '), rimossi: removed });
      await app.reload('plan', 'imports');
      parsed = null;
      selProg = progIds[0];
      selScheda = null;
      toast(`Scheda importata: ${rows.length} righe${removed ? `, ${removed} rimosse` : ''}`, 'success');
      draw();
    } catch (e) {
      toast(errMsg(e), 'error', 5000);
      btn.disabled = false;
      btn.innerHTML = `${icon('upload')} Riprova import`;
    }
  }

  function exportCsv() {
    const data = [...store.plan]
      .sort((a, b) => String(a.id_programma).localeCompare(b.id_programma) || String(a.id_scheda).localeCompare(b.id_scheda) || (a.ordine_esecuzione ?? 0) - (b.ordine_esecuzione ?? 0))
      .map((r) => COLS.map(([n, t]) => { const v = r[norm(n)]; return t === 'bool' ? (v ? 1 : 0) : v ?? ''; }));
    downloadText(`scheda_${new Date().toISOString().slice(0, 10)}.csv`, window.Papa.unparse({ fields: COLS.map(([n]) => n), data }));
  }

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act],[data-prog],[data-scheda],[data-riga]');
    if (!b) return;
    if (b.dataset.prog) { selProg = b.dataset.prog; selScheda = null; draw(); return; }
    if (b.dataset.scheda) { selScheda = b.dataset.scheda; draw(); return; }
    if (b.dataset.riga) { const r = store.plan.find((x) => x.id_riga === b.dataset.riga); if (r) exerciseDetail(r, age); return; }
    switch (b.dataset.act) {
      case 'legenda': openLegenda(db); break;
      case 'cancel': parsed = null; draw(); break;
      case 'import': doImport(b); break;
      case 'export': exportCsv(); break;
      case 'delprog': {
        const prog = groupPlan(store.plan).find((p) => p.id === selProg);
        if (!prog) return;
        if (!(await confirmDialog('Eliminare il programma?', `"${prog.nome}" verrà rimosso dalla scheda. Lo storico degli allenamenti resta salvato.`, 'Elimina', true))) return;
        try { await db.deleteProgram(prog.id); await app.reload('plan'); selProg = null; draw(); toast('Programma eliminato'); } catch (err) { toast(errMsg(err), 'error'); }
        break;
      }
      default: break;
    }
  };
  root.onchange = (e) => { if (e.target.id === 'rm-missing') removeMissing = e.target.checked; };

  draw();
}
