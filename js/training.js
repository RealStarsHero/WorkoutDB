// Logica "da trainer": target, progressioni, stime, zone cardio.
import { num, fmtNum, fmtSec, dateKey } from './utils.js';

export const isTime = (r) => String(r.tipo_misura || '').toUpperCase() === 'TEMPO';
export const isAmrap = (r) => String(r.tipo_misura || '').toUpperCase() === 'AMRAP';
export function hasLoad(r) {
  if (isTime(r)) return false;
  const a = String(r.attrezzo || '').trim().toLowerCase();
  return !['', 'corpo libero', 'tappetino'].includes(a);
}
export const isWorkPhase = (fase) => !fase || /allenament/i.test(fase);

export const sortRows = (rows) => [...rows].sort((a, b) =>
  (a.ordine_esecuzione ?? 999) - (b.ordine_esecuzione ?? 999) || String(a.id_riga).localeCompare(String(b.id_riga)));

export function groupPlan(rows) {
  const progs = new Map();
  for (const r of rows) {
    if (!progs.has(r.id_programma)) progs.set(r.id_programma, { id: r.id_programma, nome: r.nome_programma || r.id_programma, schede: new Map() });
    const p = progs.get(r.id_programma);
    if (!p.schede.has(r.id_scheda)) p.schede.set(r.id_scheda, { id: r.id_scheda, nome: r.nome_scheda || `Scheda ${r.id_scheda}`, rows: [] });
    p.schede.get(r.id_scheda).rows.push(r);
  }
  return [...progs.values()].map((p) => ({
    ...p,
    schede: [...p.schede.values()]
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'it', { numeric: true }))
      .map((s) => ({ ...s, rows: sortRows(s.rows) })),
  }));
}

export const activeProgram = (programs, profile) => programs.find((p) => p.id === profile?.programma_attivo) || programs[0];

export function nextScheda(prog, sessions) {
  const last = sessions.find((s) => s.ended_at && s.id_programma === prog.id);
  const idx = last ? prog.schede.findIndex((s) => s.id === last.id_scheda) : -1;
  return prog.schede[(idx + 1) % prog.schede.length];
}

export function fmtDuration(s) {
  if (s === null || s === undefined) return '—';
  if (s >= 60 && s % 60 === 0) return `${s / 60} min`;
  if (s < 60) return `${s}s`;
  return fmtSec(s);
}
export function repsLabel(r) {
  const a = r.ripetizioni_min, b = r.ripetizioni_max;
  if (a == null && b == null) return isAmrap(r) ? 'max' : '—';
  if (a == null || b == null || a === b) return String(a ?? b);
  return `${a}–${b}`;
}

export function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob), t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a > 0 && a < 120 ? a : null;
}
// FC max con formula di Tanaka (più accurata di 220-età)
export const fcMax = (age) => (age ? Math.round(208 - 0.7 * age) : null);
export const ZONES = {
  1: [0.5, 0.6, 'Recupero attivo'],
  2: [0.6, 0.7, 'Fondo aerobico'],
  3: [0.7, 0.8, 'Aerobico intenso'],
  4: [0.8, 0.9, 'Soglia'],
  5: [0.9, 1.0, 'Massimale'],
};
export function zoneRange(z, age) {
  const m = fcMax(age), r = ZONES[String(z).trim()];
  return m && r ? [Math.round(m * r[0]), Math.round(m * r[1])] : null;
}
export function zoneLabel(z, age) {
  const rg = zoneRange(z, age);
  return `Zona ${z}${rg ? ` · ${rg[0]}–${rg[1]} bpm` : ''}`;
}

export function targetChips(r, age) {
  const c = [];
  const n = r.serie || 1;
  if (isTime(r)) c.push(`${n > 1 ? `${n} × ` : ''}${fmtDuration(r.durata_secondi)}`);
  else c.push(`${n} × ${isAmrap(r) ? 'max' : repsLabel(r)} rip${r.per_lato ? ' per lato' : ''}`);
  if (r.recupero_secondi) c.push(`Rec ${r.recupero_secondi < 180 ? `${r.recupero_secondi}s` : fmtDuration(r.recupero_secondi)}`);
  if (r.rir_target != null) c.push(`RIR ${fmtNum(r.rir_target)}`);
  if (r.tempo_esecuzione) c.push(`Tempo ${r.tempo_esecuzione}`);
  if (r.zona_fc) c.push(zoneLabel(r.zona_fc, age));
  if (hasLoad(r) && num(r.carico_kg)) c.push(`${fmtNum(r.carico_kg, 2)} kg`);
  return c;
}

// 1RM stimato (Epley)
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : null);

export function indexSets(sets) {
  const m = new Map();
  for (const l of sets) {
    if (!m.has(l.session_id)) m.set(l.session_id, []);
    m.get(l.session_id).push(l);
  }
  return m;
}

// Ultima sessione conclusa in cui è stato eseguito l'esercizio (sessions ordinate dalla più recente)
export function lastExposure(idEsercizio, sessions, bySession, excludeId) {
  for (const s of sessions) {
    if (!s.ended_at || s.id === excludeId) continue;
    const sets = (bySession.get(s.id) || []).filter((l) => l.id_esercizio === idEsercizio).sort((a, b) => a.serie_n - b.serie_n);
    if (sets.length) return { session: s, sets };
  }
  return null;
}

const roundKg = (x) => Math.round(x * 4) / 4;

// Suggerimento per la prossima esecuzione, in base al metodo di progressione del CSV
export function suggest(r, last) {
  const metodo = String(r.metodo_progressione || '').toUpperCase();
  const inc = num(r.incremento_kg) || 0;
  const nSerie = r.serie || 1;

  if (isTime(r)) {
    const target = r.durata_secondi || 0;
    if (!last) return { durata: target, msg: null };
    const lastD = Math.max(0, ...last.sets.map((s) => s.durata_sec || 0));
    const base = Math.max(target, lastD);
    if (metodo === 'TEMPO') {
      const allDone = last.sets.length >= nSerie && last.sets.every((s) => (s.durata_sec || 0) >= base);
      if (allDone) return { durata: base + 5, msg: `Hai tenuto tutte le serie per ${base}s: prova ${base + 5}s (+5s).`, tone: 'up' };
      return { durata: base, msg: `Obiettivo: completare tutte le serie da ${base}s.`, tone: 'same' };
    }
    return { durata: target, msg: null };
  }

  const rmin = r.ripetizioni_min ?? null;
  const rmax = r.ripetizioni_max ?? rmin;
  const load = hasLoad(r);

  if (!last) {
    if (isAmrap(r)) return { msg: `Massimo di ripetizioni pulite${r.rir_target != null ? `, lasciandone ${fmtNum(r.rir_target)} in riserva` : ''}.`, tone: 'new' };
    if (load) {
      const kg = num(r.carico_kg);
      return {
        kg, reps: rmin,
        msg: kg ? `Carico di partenza: ${fmtNum(kg, 2)} kg.` : `Prima volta: scegli un carico con cui arrivi a ${rmax ?? '—'} rip lasciandone ${fmtNum(r.rir_target ?? 2)} in riserva.`,
        tone: 'new',
      };
    }
    return { reps: rmin, msg: null };
  }

  const sets = last.sets;
  const lastKg = load ? Math.max(0, ...sets.map((s) => num(s.kg) || 0)) : null;
  const repsStr = sets.map((s) => s.reps ?? '–').join(' · ');

  if (isAmrap(r)) {
    const tot = sets.reduce((a, s) => a + (s.reps || 0), 0);
    return { perSet: sets.map((s) => s.reps), msg: `Ultima volta ${repsStr} (totale ${tot}): prova a battere il totale.`, tone: 'same' };
  }
  if (metodo === 'DOPPIA_PROGRESSIONE' && load && lastKg > 0 && rmax) {
    const allMax = sets.length >= nSerie && sets.every((s) => (s.reps || 0) >= rmax && (num(s.kg) || 0) >= lastKg);
    if (allMax && inc > 0) {
      const kg = roundKg(lastKg + inc);
      return { kg, reps: rmin, msg: `Tutte le serie a ${rmax} rip con ${fmtNum(lastKg, 2)} kg: sali a ${fmtNum(kg, 2)} kg e riparti da ${rmin} rip.`, tone: 'up' };
    }
    return {
      kg: lastKg,
      perSet: sets.map((s) => Math.min((s.reps || 0) + 1, rmax)),
      msg: `Resta a ${fmtNum(lastKg, 2)} kg e cerca +1 rip per serie (ultima: ${repsStr}). Quando arrivi a ${rmax} rip su tutte le serie, si aumenta.`,
      tone: 'same',
    };
  }
  if (metodo === 'RIPETIZIONI') {
    const allMax = rmax && sets.length >= nSerie && sets.every((s) => (s.reps || 0) >= rmax);
    if (allMax) return { kg: lastKg, reps: rmax, msg: `Hai raggiunto ${rmax} rip su tutte le serie: rendi l'esercizio più difficile (variante più dura o fase eccentrica più lenta).`, tone: 'up' };
    return { kg: lastKg, perSet: sets.map((s) => Math.min((s.reps || 0) + 1, rmax || 99)), msg: `Ultima volta ${repsStr}: aggiungi 1 rip dove puoi.`, tone: 'same' };
  }
  return { kg: lastKg || num(r.carico_kg), perSet: sets.map((s) => s.reps), reps: rmin };
}

export function estimateMinutes(rows) {
  let s = 0;
  for (const r of rows) {
    const n = r.serie || 1;
    const rec = r.recupero_secondi || 0;
    if (isTime(r)) s += n * (r.durata_secondi || 0) + (n - 1) * rec;
    else {
      const reps = r.ripetizioni_max || r.ripetizioni_min || 10;
      const t = String(r.tempo_esecuzione || '').split('-').map(Number).filter((x) => !Number.isNaN(x));
      const perRep = t.length ? Math.max(2, t.reduce((a, b) => a + b, 0)) : 3;
      s += n * reps * perRep * (r.per_lato ? 2 : 1) + (n - 1) * rec;
    }
    s += 60; // cambio esercizio / preparazione
  }
  return Math.round(s / 60);
}
export const workingSets = (rows) => rows.filter((r) => isWorkPhase(r.fase)).reduce((a, r) => a + (r.serie || 1), 0);

export function mainMuscles(rows, max = 4) {
  const seen = [];
  for (const r of rows) {
    if (!isWorkPhase(r.fase) || !r.gruppo_muscolare) continue;
    if (!seen.includes(r.gruppo_muscolare)) seen.push(r.gruppo_muscolare);
  }
  return seen.slice(0, max);
}

export const trainedDays = (sessions) => new Set(sessions.filter((s) => s.ended_at).map((s) => dateKey(s.started_at)));

// Serie settimanali consigliate per gruppo muscolare in base al livello
export function volumeRange(livello) {
  const l = String(livello || '').toLowerCase();
  if (l.startsWith('avanz')) return [12, 20];
  if (l.startsWith('inter')) return [10, 16];
  return [6, 12];
}
