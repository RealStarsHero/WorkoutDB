// Accesso ai dati. Due implementazioni con la stessa interfaccia:
//  - cloud: Supabase (uso reale)
//  - demo:  localStorage del browser (per provare l'app senza configurare nulla)

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.50.0/+esm';

export async function createDb({ demo, url, key }) {
  if (demo) return localDb();
  const { createClient } = await import(SUPABASE_ESM);
  return supaDb(createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }));
}

function supaDb(sb) {
  let uid = null;
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  async function all(table, order, ascending = true) {
    const out = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const data = ok(await sb.from(table).select('*').order(order, { ascending }).range(from, from + size - 1));
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }
  const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  return {
    mode: 'cloud',
    async getUser() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id ?? null;
      return data.session?.user ?? null;
    },
    onAuth(cb) {
      sb.auth.onAuthStateChange((event, session) => {
        uid = session?.user?.id ?? null;
        // fuori dal callback: evita blocchi interni di supabase-js
        setTimeout(() => cb(event, session?.user ?? null), 0);
      });
    },
    async signIn(email, password) {
      const d = ok(await sb.auth.signInWithPassword({ email, password }));
      uid = d.user?.id ?? null;
      return d;
    },
    async signUp(email, password) {
      return ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
    },
    async signOut() { await sb.auth.signOut(); uid = null; },

    getProfile: async () => ok(await sb.from('profiles').select('*').maybeSingle()),
    saveProfile: async (p) => ok(await sb.from('profiles').upsert({ ...p, user_id: uid, updated_at: new Date().toISOString() }).select().single()),

    listMeasurements: () => all('body_measurements', 'data'),
    addMeasurement: async (m) => ok(await sb.from('body_measurements').insert({ ...m, user_id: uid }).select().single()),
    deleteMeasurement: async (id) => ok(await sb.from('body_measurements').delete().eq('id', id)),

    listPlan: () => all('plan_rows', 'id_riga'),
    async upsertPlan(rows) {
      const now = new Date().toISOString();
      for (const c of chunks(rows, 500)) {
        ok(await sb.from('plan_rows').upsert(c.map((r) => ({ ...r, user_id: uid, imported_at: now })), { onConflict: 'user_id,id_riga' }));
      }
    },
    async deletePlanRows(ids) {
      for (const c of chunks(ids, 200)) ok(await sb.from('plan_rows').delete().in('id_riga', c));
    },
    deleteProgram: async (idProgramma) => ok(await sb.from('plan_rows').delete().eq('id_programma', idProgramma)),

    listImports: () => all('import_log', 'created_at', false),
    addImport: async (r) => ok(await sb.from('import_log').insert({ ...r, user_id: uid }).select().single()),

    listLegenda: async () => ok(await sb.from('legenda').select('*').order('ordine').order('termine')),

    listSessions: () => all('workout_sessions', 'started_at', false),
    createSession: async (s) => ok(await sb.from('workout_sessions').insert({ ...s, user_id: uid }).select().single()),
    updateSession: async (id, patch) => ok(await sb.from('workout_sessions').update(patch).eq('id', id).select().single()),
    deleteSession: async (id) => ok(await sb.from('workout_sessions').delete().eq('id', id)),

    listSets: () => all('set_logs', 'created_at'),
    upsertSet: async (l) => ok(await sb.from('set_logs').upsert({ ...l, user_id: uid }, { onConflict: 'session_id,id_riga,serie_n' }).select().single()),
    deleteSet: async (sessionId, idRiga, serieN) => ok(await sb.from('set_logs').delete().match({ session_id: sessionId, id_riga: idRiga, serie_n: serieN })),
  };
}

function localDb() {
  const KEY = 'wdb_demo_data';
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { d = {}; }
  d = { user: null, profile: null, measurements: [], plan: [], imports: [], sessions: [], sets: [], ...d };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota/privato */ } };
  const now = () => new Date().toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  let seq = d.measurements.reduce((m, x) => Math.max(m, +x.id || 0), 0);

  return {
    mode: 'demo',
    async getUser() { return d.user; },
    onAuth() { /* nessun evento esterno in demo */ },
    async signIn(email) { d.user = { id: 'demo-user', email }; save(); return { user: d.user }; },
    async signUp(email) { d.user = { id: 'demo-user', email }; save(); return { user: d.user, session: {} }; },
    async signOut() { d.user = null; save(); },

    async getProfile() { return clone(d.profile); },
    async saveProfile(p) { d.profile = { ...d.profile, ...p, updated_at: now() }; save(); return clone(d.profile); },

    async listMeasurements() { return clone(d.measurements).sort((a, b) => String(a.data).localeCompare(String(b.data))); },
    async addMeasurement(m) { const r = { ...m, id: ++seq, created_at: now() }; d.measurements.push(r); save(); return clone(r); },
    async deleteMeasurement(id) { d.measurements = d.measurements.filter((m) => m.id !== id); save(); },

    async listPlan() { return clone(d.plan); },
    async upsertPlan(rows) {
      const map = new Map(d.plan.map((r) => [r.id_riga, r]));
      const t = now();
      rows.forEach((r) => map.set(r.id_riga, { ...r, imported_at: t }));
      d.plan = [...map.values()]; save();
    },
    async deletePlanRows(ids) { const s = new Set(ids); d.plan = d.plan.filter((r) => !s.has(r.id_riga)); save(); },
    async deleteProgram(p) { d.plan = d.plan.filter((r) => r.id_programma !== p); save(); },

    async listImports() { return clone(d.imports).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async addImport(r) { const x = { ...r, id: uuid(), created_at: now() }; d.imports.push(x); save(); return clone(x); },

    async listLegenda() { return clone(d.legenda || []).sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)); },

    async listSessions() { return clone(d.sessions).sort((a, b) => b.started_at.localeCompare(a.started_at)); },
    async createSession(s) { const x = { started_at: now(), ...s, id: uuid() }; d.sessions.push(x); save(); return clone(x); },
    async updateSession(id, patch) { const x = d.sessions.find((s) => s.id === id); Object.assign(x, patch); save(); return clone(x); },
    async deleteSession(id) { d.sessions = d.sessions.filter((s) => s.id !== id); d.sets = d.sets.filter((l) => l.session_id !== id); save(); },

    async listSets() { return clone(d.sets); },
    async upsertSet(l) {
      let x = d.sets.find((s) => s.session_id === l.session_id && s.id_riga === l.id_riga && s.serie_n === l.serie_n);
      if (x) Object.assign(x, l);
      else { x = { ...l, id: uuid(), created_at: now() }; d.sets.push(x); }
      save(); return clone(x);
    },
    async deleteSet(sid, riga, n) { d.sets = d.sets.filter((s) => !(s.session_id === sid && s.id_riga === riga && s.serie_n === n)); save(); },

    resetDemo() { try { localStorage.removeItem(KEY); } catch { /* ignora */ } },
  };
}
