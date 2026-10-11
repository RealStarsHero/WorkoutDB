# WorkoutDB

Web app per l'allenamento in palestra, pensata per lo smartphone.

- **Allenati**: mostra la prossima scheda da fare. Per ogni serie registri kg e ripetizioni, e parte il timer di recupero. Per gli esercizi a tempo c'è un cronometro. L'app suggerisce i carichi in base alla progressione indicata nel CSV.
- **Report**: costanza, volume settimanale, serie per gruppo muscolare, progressione degli esercizi (1RM stimato), record personali, fatica percepita (RPE), peso corporeo e consigli automatici.
- **Scheda**: import del file CSV, visualizzazione degli esercizi con il video ed export.
- **Profilo**: dati personali, misure corporee con data dell'ultimo aggiornamento, fabbisogno calorico stimato e zone di frequenza cardiaca.

Hosting: **GitHub Pages**. Database: **Supabase**.

---

## Configurazione (una sola volta)

### 1. Creare le tabelle su Supabase
1. Apri il progetto **WorkoutDB** su [supabase.com](https://supabase.com/dashboard).
2. Vai su **SQL Editor** → **New query**.
3. Incolla tutto il contenuto di `supabase/schema.sql` e premi **Run**. Deve comparire "Success".

### 2. Impostare il login
In **Authentication → Sign In / Providers → Email**:
- disattiva **Confirm email**. Per un uso personale è più semplice: puoi accedere subito dopo la registrazione.

### 3. Collegare l'app al database
In **Project Settings → API Keys** (oppure **Data API**) copia:
- **Project URL** (es. `https://abcd1234.supabase.co`)
- la chiave **anon public** oppure **publishable** (`sb_publishable_...`)

Incollale in `js/config.js`.
**Non** usare la chiave `service_role` / `secret` e non inserire la password del database: all'app non serve.

### 4. Pubblicare su GitHub Pages
1. Su GitHub: **New repository**, nome `workoutdb`, visibilità **Public**, poi **Create repository**.
2. Clicca **uploading an existing file** e trascina **il contenuto** della cartella `WorkoutDB` (cioè `index.html`, le cartelle `css`, `js`, `icons`, `supabase` e gli altri file), quindi **Commit changes**.
3. Vai su **Settings → Pages**. In "Build and deployment" scegli **Deploy from a branch**, branch **main**, cartella **/ (root)**, poi **Save**.
4. Dopo 1-2 minuti l'app è online su `https://TUO-UTENTE.github.io/workoutdb/`.

### 5. Primo accesso e installazione sul telefono
1. Apri il link dal telefono e scegli **Registrati** con la tua email e una password.
2. Installa l'app:
   - **iPhone (Safari)**: tasto Condividi → **Aggiungi alla schermata Home**.
   - **Android (Chrome)**: menu ⋮ → **Installa app**.
3. Per sicurezza, dopo esserti registrato vai su Supabase, **Authentication → Sign In / Providers**, e disattiva **Allow new users to sign up**. Così nessun altro può creare account.
4. Apri **Scheda** e importa il file CSV.

---

## Buono a sapersi
- **Aggiornare l'app**: modifica o ricarica i file nel repository GitHub. Pages ripubblica da solo in circa un minuto.
- **Piano gratuito di Supabase**: i progetti inattivi per 7 giorni vengono messi in pausa. Usando l'app ogni settimana non succede; se capita, basta premere **Restore** nella dashboard.
- **Reimportare la scheda**: le righe con lo stesso `ID_Riga` vengono aggiornate. Lo storico degli allenamenti non si perde, perché la progressione segue `ID_Esercizio`.
- **Video**: inserisci un link YouTube, Vimeo o .mp4 nella colonna `URL_Video`. Se manca, l'app mostra l'avviso "Video non disponibile".
- **Modalità demo**: aggiungi `?demo` all'indirizzo per provare l'app senza database. I dati restano solo nel browser.
