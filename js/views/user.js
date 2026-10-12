import { icon } from '../icons.js';
import { esc, num, fmtNum, fmtDate, fmtDateTime, daysSince, relDays, todayISO, toast, confirmDialog, errMsg, getSettings, setSettings, lsDel, sanitizeNum } from '../utils.js';
import { ageFrom, fcMax, ZONES, zoneRange } from '../training.js';

const OBIETTIVI = ['Ipertrofia (massa muscolare)', 'Forza', 'Dimagrimento / ricomposizione', 'Salute e benessere', 'Resistenza'];
const LIVELLI = ['Principiante', 'Intermedio', 'Avanzato'];
const MEASURES = [
  ['peso_kg', 'Peso', 'kg'], ['grasso_pct', 'Massa grassa', '%'], ['vita_cm', 'Vita', 'cm'], ['fianchi_cm', 'Fianchi', 'cm'],
  ['petto_cm', 'Petto', 'cm'], ['braccio_cm', 'Braccio', 'cm'], ['coscia_cm', 'Coscia', 'cm'],
];

function freshness(days) {
  if (days === null) return { cls: 'danger', label: 'Nessun dato' };
  if (days <= 7) return { cls: 'success', label: 'Aggiornato' };
  if (days <= 14) return { cls: 'warn', label: 'Da aggiornare a breve' };
  return { cls: 'danger', label: 'Da aggiornare' };
}
function bmiCat(b) {
  if (b < 18.5) return 'Sottopeso';
  if (b < 25) return 'Normopeso';
  if (b < 30) return 'Sovrappeso';
  return 'Obesità';
}
function whtrCat(x) {
  if (x < 0.4) return 'Basso';
  if (x < 0.5) return 'Ottimale';
  if (x < 0.6) return 'Aumentato';
  return 'Elevato';
}

export async function render(root, { app }) {
  const { store, db } = app;

  function latestOf(field) {
    for (let i = store.measurements.length - 1; i >= 0; i--) if (num(store.measurements[i][field]) !== null) return store.measurements[i];
    return null;
  }

  function draw() {
    const p = store.profile || {};
    const ms = store.measurements;
    const last = ms.at(-1);
    const mDays = daysSince(last?.data);
    const fr = freshness(mDays);
    const pDays = daysSince(p.updated_at);
    const age = ageFrom(p.data_nascita);
    const wRow = latestOf('peso_kg');
    const peso = num(wRow?.peso_kg);
    const prevW = (() => { const ws = ms.filter((m) => num(m.peso_kg) !== null); return ws.length > 1 ? num(ws.at(-2).peso_kg) : null; })();
    const h = num(p.altezza_cm);
    const bmi = peso && h ? peso / ((h / 100) ** 2) : null;
    const vita = num(latestOf('vita_cm')?.vita_cm);
    const whtr = vita && h ? vita / h : null;
    const fmax = fcMax(age);

    // fabbisogno (Mifflin-St Jeor) + attività in base ai giorni di allenamento
    let bmr = null, tdee = null, kcalTarget = null, prot = null;
    if (peso && h && age && (p.sesso === 'M' || p.sesso === 'F')) {
      bmr = 10 * peso + 6.25 * h - 5 * age + (p.sesso === 'M' ? 5 : -161);
      const g = p.giorni_settimana || 3;
      const f = g <= 1 ? 1.2 : g <= 3 ? 1.375 : g <= 5 ? 1.55 : 1.725;
      tdee = bmr * f;
      const ob = String(p.obiettivo || '');
      kcalTarget = /dimagr/i.test(ob) ? tdee * 0.85 : /ipertrof/i.test(ob) ? tdee * 1.08 : tdee;
      prot = /dimagr|ipertrof|forza/i.test(ob) ? [1.8, 2.2] : [1.4, 1.8];
    }

    let html = `<header class="page-head"><div><div class="eyebrow">${esc(app.user?.email || '')}</div><h1 class="h1">Il tuo <span class="accent">profilo</span></h1></div>
      <button class="icon-btn" data-act="logout" aria-label="Esci">${icon('logout')}</button></header>`;

    // stato aggiornamento dati
    html += `<section class="card fresh fresh-${fr.cls}">
      <div class="row between"><div class="eyebrow">Ultimo aggiornamento misure</div><span class="chip chip-${fr.cls}"><i class="dot"></i>${fr.label}</span></div>
      <div class="fresh-date">${last ? esc(fmtDate(last.data, { day: 'numeric', month: 'long', year: 'numeric' })) : '—'}</div>
      <div class="small muted">${last ? `${relDays(mDays)} · consigliato ogni 7 giorni, stesso orario e a digiuno` : 'Inserisci la tua prima misurazione qui sotto.'}</div>
      <div class="small muted" style="margin-top:6px">Dati personali aggiornati: <b>${p.updated_at ? `${esc(fmtDateTime(p.updated_at))} (${relDays(pDays)})` : 'mai'}</b></div>
    </section>`;

    // indicatori
    html += `<section class="kpis" style="margin-top:12px">
      <div class="kpi"><div class="kpi-v">${peso ? fmtNum(peso, 1) : '—'}<small> kg</small></div><div class="kpi-l">Peso attuale</div>
        ${peso && prevW !== null ? `<div class="kpi-d ${peso - prevW > 0 ? 'up-n' : peso - prevW < 0 ? 'down-n' : ''}">${peso - prevW > 0 ? '+' : ''}${fmtNum(peso - prevW, 1)} kg dalla precedente</div>` : ''}</div>
      <div class="kpi"><div class="kpi-v">${bmi ? fmtNum(bmi, 1) : '—'}</div><div class="kpi-l">BMI${bmi ? ` · ${bmiCat(bmi)}` : ''}</div></div>
      <div class="kpi"><div class="kpi-v">${age ?? '—'}</div><div class="kpi-l">Età</div></div>
      <div class="kpi"><div class="kpi-v">${fmax ?? '—'}<small> bpm</small></div><div class="kpi-l">FC max stimata</div></div>
    </section>`;

    // nuova misurazione
    html += `<section class="section"><div class="section-title"><h2 class="h2">Nuova misurazione</h2></div>
      <form class="card stack" id="f-meas">
        <label class="field"><span>Data</span><input type="date" name="data" value="${todayISO()}" max="${todayISO()}" required></label>
        <div class="grid2">${MEASURES.map(([k, l, u]) => {
          const prev = latestOf(k);
          return `<label class="field"><span>${l} (${u})</span><input name="${k}" inputmode="decimal" data-num="dec" maxlength="6" placeholder="${prev ? esc(fmtNum(prev[k], 1)) : ''}"></label>`;
        }).join('')}</div>
        <label class="field"><span>Note</span><input name="note" placeholder="Es. dopo una settimana di scarico"></label>
        <button class="btn btn-primary btn-block" type="submit">${icon('plus')} Salva misurazione</button>
      </form></section>`;

    // dati personali
    html += `<section class="section"><div class="section-title"><h2 class="h2">Dati personali</h2></div>
      <form class="card stack" id="f-prof">
        <label class="field"><span>Nome</span><input name="nome" value="${esc(p.nome || '')}" autocomplete="given-name"></label>
        <div class="grid2">
          <label class="field"><span>Sesso</span><select name="sesso">
            <option value="">—</option><option value="M" ${p.sesso === 'M' ? 'selected' : ''}>Uomo</option><option value="F" ${p.sesso === 'F' ? 'selected' : ''}>Donna</option></select></label>
          <label class="field"><span>Data di nascita</span><input type="date" name="data_nascita" value="${esc(p.data_nascita || '')}"></label>
          <label class="field"><span>Altezza (cm)</span><input name="altezza_cm" inputmode="decimal" data-num="dec" maxlength="6" value="${esc(p.altezza_cm ?? '')}"></label>
          <label class="field"><span>FC a riposo (bpm)</span><input name="fc_riposo" inputmode="numeric" data-num="int" maxlength="3" value="${esc(p.fc_riposo ?? '')}" placeholder="facoltativa"></label>
        </div>
        <label class="field"><span>Obiettivo</span><select name="obiettivo"><option value="">—</option>${OBIETTIVI.map((o) => `<option ${p.obiettivo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <div class="grid2">
          <label class="field"><span>Livello</span><select name="livello"><option value="">—</option>${LIVELLI.map((o) => `<option ${p.livello === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
          <label class="field"><span>Allenamenti / settimana</span><select name="giorni_settimana">${[1, 2, 3, 4, 5, 6, 7].map((g) => `<option ${(p.giorni_settimana || 3) === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        </div>
        <button class="btn btn-primary btn-block" type="submit">${icon('check')} Salva dati</button>
      </form></section>`;

    // indicazioni del coach
    html += `<section class="section"><div class="section-title"><h2 class="h2">Indicazioni</h2></div><div class="card">
      ${whtr ? `<div class="kv"><span class="muted">Rapporto vita/altezza</span><span><b>${fmtNum(whtr, 2)}</b> · ${whtrCat(whtr)}</span></div>` : ''}
      ${bmr ? `<div class="kv"><span class="muted">Metabolismo basale</span><span><b>${fmtNum(bmr, 0)}</b> kcal</span></div>
        <div class="kv"><span class="muted">Fabbisogno giornaliero stimato</span><span><b>${fmtNum(tdee, 0)}</b> kcal</span></div>
        <div class="kv"><span class="muted">Calorie per il tuo obiettivo</span><span class="accent"><b>~${fmtNum(Math.round(kcalTarget / 50) * 50, 0)}</b> kcal</span></div>
        <div class="kv"><span class="muted">Proteine consigliate</span><span><b>${fmtNum(peso * prot[0], 0)}–${fmtNum(peso * prot[1], 0)}</b> g/giorno</span></div>`
        : `<p class="small muted">Completa sesso, data di nascita, altezza e peso per vedere fabbisogno calorico e proteico.</p>`}
      ${fmax ? `<div class="eyebrow" style="margin:16px 0 8px">Zone di frequenza cardiaca</div>
        ${Object.entries(ZONES).map(([z, v]) => { const r = zoneRange(z, age); return `<div class="zone"><span class="zone-n z${z}">Z${z}</span><span class="grow">${v[2]}</span><b>${r[0]}–${r[1]}</b><span class="small muted">bpm</span></div>`; }).join('')}` : ''}
      <p class="small muted" style="margin-top:12px">Stime indicative, non sostituiscono il parere di un medico o di un nutrizionista.</p>
    </div></section>`;

    // storico misure
    if (ms.length) {
      html += `<section class="section"><div class="section-title"><h2 class="h2">Storico misure</h2><span class="small muted">${ms.length} registrazioni</span></div><div class="card">
        ${[...ms].reverse().slice(0, 30).map((m) => `<div class="list-item">
          <span class="grow"><b>${esc(fmtDate(m.data))}</b>
          <span class="small muted">${MEASURES.filter(([k]) => num(m[k]) !== null).map(([k, l, u]) => `${l} ${fmtNum(m[k], 1)}${u === '%' ? '%' : ` ${u}`}`).join(' · ') || '—'}${m.note ? ` · ${esc(m.note)}` : ''}</span></span>
          <button class="icon-btn sm" data-del="${esc(m.id)}" aria-label="Elimina misurazione del ${esc(fmtDate(m.data))}">${icon('trash')}</button></div>`).join('')}
      </div></section>`;
    }

    // preferenze
    const s = getSettings();
    html += `<section class="section"><div class="section-title"><h2 class="h2">Preferenze</h2><span class="small muted">su questo dispositivo</span></div><div class="card">
      <label class="switch-row"><span><b>Un esercizio aperto alla volta</b><span class="small muted">Aprendo un esercizio si chiudono gli altri</span></span><input type="checkbox" class="switch" data-set="singleOpen" ${s.singleOpen ? 'checked' : ''}></label>
      <label class="switch-row"><span><b>Suono fine recupero</b><span class="small muted">Beep quando il timer arriva a zero</span></span><input type="checkbox" class="switch" data-set="sound" ${s.sound ? 'checked' : ''}></label>
      <label class="switch-row"><span><b>Vibrazione</b><span class="small muted">Solo su Android</span></span><input type="checkbox" class="switch" data-set="vibrate" ${s.vibrate ? 'checked' : ''}></label>
      <label class="switch-row"><span><b>Schermo sempre acceso</b><span class="small muted">Durante l'allenamento</span></span><input type="checkbox" class="switch" data-set="wakelock" ${s.wakelock ? 'checked' : ''}></label>
    </div></section>`;

    html += `<section class="section stack">
      <button class="btn btn-ghost btn-block" data-act="logout">${icon('logout')} Esci dall'account</button>
      ${app.demo ? `<button class="btn btn-danger btn-block" data-act="exit-demo">${icon('trash')} Esci dalla demo e cancella i dati demo</button>` : ''}
    </section>`;

    root.innerHTML = html;
  }

  root.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type=submit]');
    const fd = new FormData(f);
    btn.disabled = true;
    try {
      if (f.id === 'f-meas') {
        const m = { data: fd.get('data') || todayISO(), note: String(fd.get('note') || '').trim() || null };
        let any = false;
        for (const [k] of MEASURES) { const v = num(fd.get(k)); m[k] = v; if (v !== null) any = true; }
        if (!any) { toast('Inserisci almeno un valore (es. il peso)', 'error'); return; }
        if (m.peso_kg !== null && (m.peso_kg < 25 || m.peso_kg > 350)) { toast('Peso non valido', 'error'); return; }
        const saved = await db.addMeasurement(m);
        store.measurements.push(saved);
        store.measurements.sort((a, b) => String(a.data).localeCompare(String(b.data)));
        toast('Misurazione salvata', 'success');
      } else if (f.id === 'f-prof') {
        const p = {
          nome: String(fd.get('nome') || '').trim() || null,
          sesso: fd.get('sesso') || null,
          data_nascita: fd.get('data_nascita') || null,
          altezza_cm: num(fd.get('altezza_cm')),
          fc_riposo: num(fd.get('fc_riposo')),
          obiettivo: fd.get('obiettivo') || null,
          livello: fd.get('livello') || null,
          giorni_settimana: num(fd.get('giorni_settimana')) || 3,
        };
        if (p.altezza_cm !== null && (p.altezza_cm < 100 || p.altezza_cm > 250)) { toast('Altezza in cm non valida (es. 178)', 'error'); return; }
        store.profile = await db.saveProfile(p);
        toast('Dati salvati', 'success');
      }
      draw();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      btn.disabled = false;
    }
  };

  root.oninput = (e) => { if (e.target.dataset?.num) sanitizeNum(e.target); };

  root.onchange = (e) => {
    const k = e.target.dataset.set;
    if (k) { setSettings({ [k]: e.target.checked }); toast('Preferenza salvata'); }
  };

  root.onclick = async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!(await confirmDialog('Eliminare la misurazione?', 'L\'operazione non è reversibile.', 'Elimina', true))) return;
      const id = store.measurements.find((m) => String(m.id) === del.dataset.del)?.id;
      try { await db.deleteMeasurement(id); store.measurements = store.measurements.filter((m) => m.id !== id); draw(); } catch (err) { toast(errMsg(err), 'error'); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'logout') {
      if (!(await confirmDialog('Uscire?', 'Dovrai inserire di nuovo email e password.', 'Esci'))) return;
      await db.signOut();
      app.setUser(null);
    } else if (act === 'exit-demo') {
      if (!(await confirmDialog('Uscire dalla demo?', 'Tutti i dati inseriti in modalità demo verranno cancellati da questo browser.', 'Esci e cancella', true))) return;
      db.resetDemo?.();
      lsDel('wdb_demo');
      location.href = location.pathname;
    }
  };

  draw();
}
