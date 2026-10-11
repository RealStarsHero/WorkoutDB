import { CONFIG } from './config.js';
import { createDb } from './db.js';
import { icon } from './icons.js';
import { esc, errMsg } from './utils.js';
import { renderAuth, renderSetup } from './views/auth.js';
import * as home from './views/home.js';
import * as workout from './views/workout.js';
import * as report from './views/report.js';
import * as plan from './views/plan.js';
import * as user from './views/user.js';

export const app = {
  db: null,
  user: null,
  demo: false,
  store: { profile: null, measurements: [], plan: [], imports: [], sessions: [], sets: [] },
};

const loaders = {
  profile: async () => { app.store.profile = await app.db.getProfile(); },
  measurements: async () => { app.store.measurements = await app.db.listMeasurements(); },
  plan: async () => { app.store.plan = await app.db.listPlan(); },
  imports: async () => { app.store.imports = await app.db.listImports(); },
  sessions: async () => { app.store.sessions = await app.db.listSessions(); },
  sets: async () => { app.store.sets = await app.db.listSets(); },
};
app.reload = async (...keys) => {
  const ks = keys.length ? keys : Object.keys(loaders);
  await Promise.all(ks.map((k) => loaders[k]()));
};

const root = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const views = { home, workout, report, plan, user };
const TABS = [['home', 'Allenati', 'dumbbell'], ['report', 'Report', 'chart'], ['plan', 'Scheda', 'list'], ['user', 'Profilo', 'user']];
let cleanup = null;

function renderTabbar(active) {
  tabbar.innerHTML = `<div class="tabbar-inner">${TABS.map(([k, l, i]) =>
    `<a href="#/${k}" class="tab ${k === active ? 'active' : ''}" ${k === active ? 'aria-current="page"' : ''}>${icon(i)}<span>${l}</span></a>`).join('')}</div>`;
}

export function errorBox(e) {
  return `<div class="empty"><div class="ic">${icon('alert')}</div><h2 class="h2">Qualcosa non va</h2>
    <p class="muted" style="margin:8px 0 18px">${esc(errMsg(e))}</p>
    <button class="btn btn-primary" onclick="location.reload()">${icon('refresh')} Riprova</button></div>`;
}

async function route() {
  if (!app.user) return;
  const [name = 'home', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const key = views[name] ? name : 'home';
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignora */ } }
  cleanup = null;
  root.onclick = root.oninput = root.onchange = root.onsubmit = null;
  document.body.classList.toggle('in-workout', key === 'workout');
  renderTabbar(key);
  window.scrollTo(0, 0);
  try {
    cleanup = await views[key].render(root, { app, params });
  } catch (e) {
    console.error(e);
    root.innerHTML = errorBox(e);
  }
}
app.route = route;

async function setUser(u) {
  if (u?.id && u.id === app.user?.id) return;
  app.user = u;
  if (!u) {
    document.body.classList.add('auth');
    document.body.classList.remove('in-workout');
    tabbar.innerHTML = '';
    renderAuth(root, app);
    return;
  }
  document.body.classList.remove('auth');
  root.innerHTML = '<div class="spinner" role="status" aria-label="Caricamento"></div>';
  try {
    await app.reload();
  } catch (e) {
    console.error(e);
    root.innerHTML = errorBox(e);
    return;
  }
  route();
}
app.setUser = setUser;

async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.has('demo')) { try { localStorage.setItem('wdb_demo', '1'); } catch { /* ignora */ } }
  let demo = false;
  try { demo = localStorage.getItem('wdb_demo') === '1'; } catch { /* ignora */ }
  app.demo = demo || qs.has('demo');

  const configured = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
  if (!app.demo && !configured) {
    document.body.classList.add('auth');
    renderSetup(root);
    return;
  }
  root.innerHTML = '<div class="spinner" role="status" aria-label="Caricamento"></div>';
  try {
    app.db = await createDb({ demo: app.demo, url: CONFIG.SUPABASE_URL, key: CONFIG.SUPABASE_ANON_KEY });
  } catch (e) {
    root.innerHTML = errorBox(e);
    return;
  }
  app.db.onAuth((event, u) => {
    if (event === 'SIGNED_OUT') setUser(null);
    else if (event === 'SIGNED_IN' && u && !app.user) setUser(u);
  });
  await setUser(await app.db.getUser());
}

window.addEventListener('hashchange', route);
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponibile */ });
}
