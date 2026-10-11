-- =====================================================================
-- WorkoutDB · Schema database Supabase
-- Esegui TUTTO questo script UNA volta in:
--   Supabase → SQL Editor → New query → incolla → Run
-- Puoi rieseguirlo senza problemi: non cancella dati esistenti.
-- =====================================================================

-- Profilo utente (dati principali)
create table if not exists public.profiles (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  nome             text,
  sesso            text,
  data_nascita     date,
  altezza_cm       numeric,
  obiettivo        text,
  livello          text,
  giorni_settimana int default 3,
  fc_riposo        int,
  programma_attivo text,
  updated_at       timestamptz not null default now()
);

-- Storico misure corporee (peso, % grasso, circonferenze)
create table if not exists public.body_measurements (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data        date not null default current_date,
  peso_kg     numeric,
  grasso_pct  numeric,
  vita_cm     numeric,
  fianchi_cm  numeric,
  petto_cm    numeric,
  braccio_cm  numeric,
  coscia_cm   numeric,
  note        text,
  created_at  timestamptz not null default now()
);

-- Righe della scheda importate dal CSV (una riga = un esercizio di una scheda)
create table if not exists public.plan_rows (
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id_riga             text not null,
  id_programma        text not null,
  nome_programma      text,
  id_scheda           text not null,
  nome_scheda         text,
  ordine_esecuzione   int,
  fase                text,
  id_esercizio        text,
  esercizio           text not null,
  gruppo_muscolare    text,
  muscoli_secondari   text,
  schema_movimento    text,
  attrezzo            text,
  tipo_misura         text,
  serie               int,
  ripetizioni_min     int,
  ripetizioni_max     int,
  durata_secondi      int,
  per_lato            boolean default false,
  recupero_secondi    int,
  carico_kg           numeric,
  rir_target          numeric,
  tempo_esecuzione    text,
  zona_fc             text,
  id_superserie       text,
  metodo_progressione text,
  incremento_kg       numeric,
  note_esecuzione     text,
  url_video           text,
  imported_at         timestamptz not null default now(),
  primary key (user_id, id_riga)
);

-- Registro degli import CSV
create table if not exists public.import_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name  text,
  righe      int,
  programmi  text,
  rimossi    int default 0,
  created_at timestamptz not null default now()
);

-- Sessioni di allenamento
create table if not exists public.workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id_programma   text,
  nome_programma text,
  id_scheda      text,
  nome_scheda    text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  durata_min     int,
  rpe            int check (rpe between 1 and 10),
  note           text
);

-- Serie eseguite
create table if not exists public.set_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id       uuid not null references public.workout_sessions(id) on delete cascade,
  id_riga          text not null,
  id_esercizio     text,
  esercizio        text,
  gruppo_muscolare text,
  fase             text,
  serie_n          int not null,
  reps             int,
  kg               numeric,
  durata_sec       int,
  rir              numeric,
  created_at       timestamptz not null default now(),
  unique (session_id, id_riga, serie_n)
);

create index if not exists set_logs_user_ex_idx  on public.set_logs (user_id, id_esercizio);
create index if not exists set_logs_session_idx  on public.set_logs (session_id);
create index if not exists sessions_user_idx     on public.workout_sessions (user_id, started_at desc);
create index if not exists measurements_user_idx on public.body_measurements (user_id, data);

-- Sicurezza (Row Level Security): ogni utente legge e scrive SOLO i propri dati
do $$
declare t text;
begin
  foreach t in array array['profiles','body_measurements','plan_rows','import_log','workout_sessions','set_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own_data" on public.%I', t);
    execute format('create policy "own_data" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
