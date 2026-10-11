import { LOGO, icon } from '../icons.js';
import { errMsg } from '../utils.js';

const brand = `<div class="brand">
  <div class="logo">${LOGO}</div>
  <h1>Workout<span>DB</span></h1>
  <p class="muted">Il tuo allenamento, serie dopo serie.</p>
</div>`;

function translate(e) {
  const m = e?.message || String(e);
  if (/invalid login credentials/i.test(m)) return 'Email o password errati.';
  if (/email not confirmed/i.test(m)) return 'Email non ancora confermata: apri il link che ti è arrivato via mail.';
  if (/already registered|already exists/i.test(m)) return 'Esiste già un account con questa email: usa "Accedi".';
  if (/password should be at least/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
  if (/signups not allowed|signup is disabled/i.test(m)) return 'Le nuove registrazioni sono disattivate su questo progetto.';
  if (/rate limit/i.test(m)) return 'Troppi tentativi: attendi qualche minuto e riprova.';
  return errMsg(e);
}

export function renderAuth(root, app) {
  let mode = 'in';
  root.innerHTML = `<div class="auth">
    ${brand}
    <form class="card auth-card stack" novalidate>
      <div class="seg" role="tablist">
        <button type="button" class="active" data-mode="in" role="tab">Accedi</button>
        <button type="button" data-mode="up" role="tab">Registrati</button>
      </div>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" minlength="6" required></label>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Accedi</button>
      <p class="small muted" id="auth-msg" role="status"></p>
    </form>
    ${app.demo ? `<p class="small muted center">Modalità demo: i dati restano solo su questo dispositivo.</p>` : ''}
  </div>`;
  const form = root.querySelector('form');
  const msg = root.querySelector('#auth-msg');
  const submit = form.querySelector('[type=submit]');
  form.querySelector('.seg').onclick = (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    form.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('active', x === b));
    submit.textContent = mode === 'in' ? 'Accedi' : 'Crea account';
    form.password.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    msg.textContent = '';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || password.length < 6) { msg.textContent = 'Inserisci email e una password di almeno 6 caratteri.'; return; }
    submit.disabled = true;
    msg.textContent = '';
    try {
      if (mode === 'in') {
        await app.db.signIn(email, password);
        await app.setUser(await app.db.getUser());
      } else {
        const d = await app.db.signUp(email, password);
        if (d?.session) await app.setUser(await app.db.getUser());
        else msg.innerHTML = `${icon('info')} Account creato. Ti abbiamo inviato una mail: apri il link di conferma, poi accedi qui.`;
      }
    } catch (err) {
      msg.textContent = translate(err);
    } finally {
      submit.disabled = false;
    }
  };
}

export function renderSetup(root) {
  root.innerHTML = `<div class="auth">
    ${brand}
    <div class="card stack">
      <h2 class="h2">Configurazione mancante</h2>
      <p class="muted">L'app non è ancora collegata al database. Apri il file <b>js/config.js</b> e inserisci
      <b>Project URL</b> e chiave <b>anon / publishable</b> del tuo progetto Supabase.</p>
      <button class="btn btn-primary btn-block" id="demo">${icon('play')} Prova in modalità demo</button>
      <p class="small muted">In demo i dati vengono salvati solo in questo browser.</p>
    </div>
  </div>`;
  root.querySelector('#demo').onclick = () => {
    try { localStorage.setItem('wdb_demo', '1'); } catch { /* ignora */ }
    location.reload();
  };
}
