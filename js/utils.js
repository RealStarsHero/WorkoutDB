import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Numeri e date ----------
export function num(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const fmtNum = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('it-IT', { maximumFractionDigits: d });
export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => d ? new Date(d).toLocaleDateString('it-IT', opts) : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export function fmtSec(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
export function parseSec(str) {
  str = String(str ?? '').trim();
  if (!str) return null;
  if (str.includes(':')) { const [m, s] = str.split(':'); return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0); }
  const n = num(str);
  return n === null ? null : Math.round(n);
}
export const dateKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const todayISO = () => dateKey(new Date());
export function daysSince(d) {
  if (!d) return null;
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}
export function relDays(n) {
  if (n === null || n === undefined) return 'mai';
  if (n <= 0) return 'oggi';
  if (n === 1) return 'ieri';
  return `${n} giorni fa`;
}
export function weekStart(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Filtra i campi numerici mentre si scrive (data-num = "int" | "dec" | "time").
// int: max 3 cifre · dec: max 3 cifre intere + 2 decimali (virgola o punto) · time: mm:ss
export function sanitizeNum(inp) {
  const v = inp.value;
  let nv = v;
  if (inp.dataset.num === 'int') nv = v.replace(/\D/g, '').slice(0, 3);
  else if (inp.dataset.num === 'dec') {
    const m = v.replace(/[^\d.,]/g, '').match(/^(\d{0,3})\d*([.,]\d{0,2})?/);
    nv = m ? m[1] + (m[2] || '') : '';
  } else if (inp.dataset.num === 'time') nv = v.replace(/[^\d:]/g, '').slice(0, 5);
  if (nv !== v) inp.value = nv;
}

// ---------- UI: toast, modali ----------
export function toast(msg, type = 'info', ms = 2800) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

export function openModal({ title = '', body = '', actions = [], onMount, dismissible = true, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3>${dismissible ? `<button class="icon-btn" data-close aria-label="Chiudi">${icon('x')}</button>` : ''}</div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.class || 'btn-ghost'}" data-action="${i}">${a.label}</button>`).join('')}</div>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    wrap.classList.remove('show');
    setTimeout(() => {
      wrap.remove();
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('no-scroll');
    }, 200);
    onClose?.();
  };
  wrap.addEventListener('click', async (e) => {
    if (dismissible && (e.target === wrap || e.target.closest('[data-close]'))) return close();
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = actions[+b.dataset.action];
    b.disabled = true;
    try {
      const r = a.onClick ? await a.onClick(wrap) : undefined;
      if (r !== false) close();
    } finally { b.disabled = false; }
  });
  onMount?.(wrap, close);
  return { el: wrap, close };
}

export function confirmDialog(title, text, okLabel = 'Conferma', danger = false) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title,
      body: `<p class="muted">${esc(text)}</p>`,
      actions: [
        { label: 'Annulla' },
        { label: esc(okLabel), class: danger ? 'btn-danger-solid' : 'btn-primary', onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

// ---------- Video ----------
export function parseVideo(url) {
  if (!url) return null;
  url = String(url).trim();
  if (!/^https?:\/\//i.test(url)) return null;
  let m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
  if (m) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1`, url };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}`, url };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) return { kind: 'video', src: url, url };
  return { kind: 'link', src: url, url };
}

// ---------- Preferenze del dispositivo ----------
const SKEY = 'wdb_settings';
export function getSettings() {
  const def = { sound: true, vibrate: true, wakelock: true, singleOpen: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch { return def; }
}
export function setSettings(p) {
  try { localStorage.setItem(SKEY, JSON.stringify({ ...getSettings(), ...p })); } catch { /* storage non disponibile */ }
}
export function lsGet(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch { return def; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage non disponibile */ } }
export function lsDel(k) { try { localStorage.removeItem(k); } catch { /* storage non disponibile */ } }

// ---------- Suoni / vibrazione ----------
let actx = null;
export function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch { /* audio non supportato */ }
}
export function alarm() {
  const s = getSettings();
  if (s.vibrate && navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
  if (!s.sound || !actx) return;
  try {
    [0, 0.28, 0.56].forEach((t, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      const at = actx.currentTime + t;
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.45, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(g).connect(actx.destination);
      o.start(at); o.stop(at + 0.24);
    });
  } catch { /* ignora */ }
}

// ---------- Errori ----------
export function errMsg(e) {
  const m = e?.message || String(e);
  if (/schema cache|does not exist|relation .* not exist/i.test(m)) return 'Tabelle non trovate: esegui lo script supabase/schema.sql nel SQL Editor di Supabase.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connessione assente: controlla la rete e riprova.';
  if (/JWT|refresh token/i.test(m)) return 'Sessione scaduta: esci e accedi di nuovo.';
  if (/row-level security/i.test(m)) return 'Permesso negato dal database (RLS): riesegui lo script schema.sql.';
  return m;
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
