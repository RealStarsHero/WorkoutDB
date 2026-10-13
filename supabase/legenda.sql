-- =====================================================================
-- WorkoutDB · Legenda dei termini tecnici (pagina Scheda → "Legenda")
-- Esegui questo script UNA volta in: Supabase → SQL Editor → New query → Run
--
-- Per gestire i termini in futuro: Supabase → Table Editor → tabella "legenda"
--   • aggiungi una riga  → il termine compare nell'app
--   • elimina una riga   → il termine sparisce dall'app
--   • "ordine" decide la posizione, "categoria" il gruppo in cui appare
-- Rieseguire lo script non sovrascrive le modifiche fatte a mano
-- (i termini già presenti vengono saltati).
-- =====================================================================

create table if not exists public.legenda (
  id          bigint generated always as identity primary key,
  ordine      int  not null default 100,
  categoria   text not null default 'Generale',
  termine     text not null unique,
  descrizione text not null,
  esempio     text,
  created_at  timestamptz not null default now()
);

-- Tabella in sola lettura per l'app: si modifica solo dalla dashboard di Supabase
alter table public.legenda enable row level security;
drop policy if exists "legenda_lettura" on public.legenda;
create policy "legenda_lettura" on public.legenda for select to authenticated using (true);
revoke all on public.legenda from anon;
grant select on public.legenda to authenticated;

insert into public.legenda (ordine, categoria, termine, descrizione, esempio) values
-- ---------------- Struttura dell'allenamento ----------------
(10, 'Struttura dell''allenamento', 'Serie',
 'Un blocco di ripetizioni eseguite di fila, senza pausa. Nella scheda il numero di serie si riferisce solo alle serie allenanti, cioè quelle impegnative: le eventuali serie di avvicinamento non sono conteggiate.',
 '"3 × 10–12" significa 3 serie, ciascuna da 10–12 ripetizioni.'),
(11, 'Struttura dell''allenamento', 'Ripetizione (rip)',
 'Un singolo movimento completo, dall''inizio alla fine: una discesa e una risalita nello squat, una spinta completa alla chest press. Ogni ripetizione va eseguita con tecnica corretta: una ripetizione "sporca" non conta.',
 'Nel curl, portare il manubrio dalla coscia alla spalla e tornare giù = 1 ripetizione.'),
(12, 'Struttura dell''allenamento', 'Range di ripetizioni',
 'L''intervallo tra il numero minimo e massimo di ripetizioni da fare in ogni serie. Si sceglie un carico che permetta di stare dentro il range: se non arrivi al minimo il carico è troppo alto, quando raggiungi il massimo su tutte le serie è il momento di aumentarlo.',
 '10–12: almeno 10 ripetizioni, al massimo 12. Se ne fai 15 facilmente, il peso è troppo leggero.'),
(13, 'Struttura dell''allenamento', 'Recupero',
 'La pausa tra una serie e la successiva. Serve a ricaricare l''energia del muscolo per eseguire bene la serie dopo. Gli esercizi multiarticolari pesanti richiedono recuperi più lunghi (90–180 s), quelli di isolamento più brevi (45–75 s). Nell''app il timer di recupero parte da solo quando confermi una serie.',
 'Rec 90s: dopo la serie aspetti 1 minuto e mezzo prima della successiva.'),
(14, 'Struttura dell''allenamento', 'Per lato',
 'Indica un esercizio unilaterale, eseguito con un lato del corpo alla volta. Le ripetizioni (o la durata) indicate vanno fatte per ciascun lato: completi un lato, poi l''altro, e insieme formano una serie.',
 '"8 rip per lato" negli affondi: 8 con la gamba destra avanti + 8 con la sinistra = 1 serie.'),
(15, 'Struttura dell''allenamento', 'Serie di avvicinamento',
 'Serie leggere eseguite prima delle serie allenanti di un esercizio, per preparare articolazioni e muscoli al carico e "provare" il movimento. Non devono affaticare e non si registrano nell''app.',
 'Prima della Leg Press: 1 serie da 10 ripetizioni al 50% del carico di lavoro.'),
(16, 'Struttura dell''allenamento', 'Superserie',
 'Due o più esercizi eseguiti uno dopo l''altro senza pausa; il recupero si fa solo alla fine del giro. Permette di risparmiare tempo e aumentare l''intensità. Nell''app gli esercizi in superserie hanno lo stesso badge e il timer di recupero parte solo dopo l''ultimo esercizio del gruppo.',
 'S1: curl bicipiti → subito push down tricipiti → recupero → si ripete.'),
(17, 'Struttura dell''allenamento', 'AMRAP',
 'Dall''inglese "As Many Reps As Possible": esegui il massimo numero di ripetizioni possibile con tecnica corretta. Se è indicato un RIR, fermati lasciando quelle ripetizioni "in canna". Si usa spesso negli esercizi a corpo libero.',
 'Piegamenti AMRAP con RIR 1: fai tutte le ripetizioni pulite che riesci, fermandoti quando ne avresti ancora 1.'),
(18, 'Struttura dell''allenamento', 'Riscaldamento, Allenamento, Defaticamento',
 'Le tre fasi della seduta. Riscaldamento: alza la temperatura corporea e prepara articolazioni e muscoli (cardio leggero, mobilità, prevenzione). Allenamento: la parte principale, quella che conta per volume e progressi. Defaticamento: ritorno graduale alla calma con attività leggera.',
 'Giorno A: 10 min cardio + mobilità → esercizi con i pesi → 15 min cardio in Zona 2.'),
(19, 'Struttura dell''allenamento', 'Carico',
 'Il peso utilizzato in un esercizio, in kg. Ai macchinari è il valore della pila di pesi; con i manubri si indica di solito il peso di un singolo manubrio. Va scelto in base al range di ripetizioni e al RIR, non "a sensazione".',
 'Leg Press 60 kg × 12: hai spinto 60 kg per 12 ripetizioni.'),

-- ---------------- Intensità e fatica ----------------
(30, 'Intensità e fatica', 'RIR (Ripetizioni In Riserva)',
 'Quante ripetizioni pulite saresti ancora in grado di fare quando termini la serie. È il modo più semplice per regolare l''intensità: con RIR 2 ti fermi quando ne avresti ancora 2. RIR 0 significa arrivare al cedimento. Per chi inizia, RIR 2–3 è ideale: abbastanza intenso per migliorare, lontano dal cedimento e dagli errori tecnici.',
 'Target 10–12 rip con RIR 2: scegli un peso con cui alla 12ª ripetizione potresti farne ancora 2.'),
(31, 'Intensità e fatica', 'Cedimento muscolare',
 'Il punto in cui non riesci a completare un''altra ripetizione con tecnica corretta (equivale a RIR 0). Raggiungerlo spesso aumenta la fatica e il rischio di infortuni senza dare più risultati: per i principianti è sconsigliato.',
 NULL),
(32, 'Intensità e fatica', 'RPE (sforzo percepito)',
 'Dall''inglese "Rate of Perceived Exertion": una scala da 1 a 10 di quanto è stato faticoso uno sforzo. Nell''app lo indichi a fine allenamento per l''intera seduta: 5–6 moderata, 7–8 impegnativa, 9–10 al limite. Se le sedute sono spesso a 9–10, serve più recupero.',
 'RPE 7: allenamento impegnativo ma gestibile, avresti potuto fare ancora qualcosa.'),
(33, 'Intensità e fatica', 'Tempo di esecuzione (cadenza)',
 'Quattro numeri che indicano la durata in secondi di ogni parte della ripetizione, in quest''ordine: discesa (fase eccentrica) – pausa in basso – salita (fase concentrica) – pausa in alto. Controllare la velocità, soprattutto in discesa, aumenta lo stimolo sul muscolo e riduce il rischio di infortuni.',
 '3-0-1-0: scendi in 3 secondi, nessuna pausa in basso, sali in 1 secondo, riparti subito.'),
(34, 'Intensità e fatica', 'Fase eccentrica e concentrica',
 'Fase eccentrica: il muscolo si allunga mentre controlla il peso (di solito la discesa). Fase concentrica: il muscolo si accorcia per vincere il carico (di solito la salita o la spinta). La fase eccentrica va sempre controllata, mai "lasciata cadere".',
 'Nel curl: abbassare il manubrio = eccentrica, sollevarlo = concentrica.'),

-- ---------------- Progressione ----------------
(50, 'Progressione', 'Sovraccarico progressivo',
 'Il principio base dell''allenamento: per continuare a migliorare bisogna aumentare gradualmente lo stimolo nel tempo, con più carico, più ripetizioni, più secondi o una tecnica migliore. L''app ti suggerisce ogni volta il passo successivo.',
 NULL),
(51, 'Progressione', 'Doppia progressione',
 'Si progredisce prima con le ripetizioni e poi con il carico. Lavori nel range (es. 10–12) con lo stesso peso; quando completi TUTTE le serie al numero massimo di ripetizioni rispettando il RIR, alla seduta successiva aumenti il carico dell''incremento previsto e riparti dal minimo del range.',
 'Leg Press 3 × 10–12 con 60 kg: 12-11-10 → 12-12-11 → 12-12-12 → seduta successiva 65 kg × 10.'),
(52, 'Progressione', 'Progressione a ripetizioni',
 'Usata negli esercizi a corpo libero e per il core: aggiungi 1–2 ripetizioni per serie a settimana. Superato il range (o 15 ripetizioni nell''AMRAP) passa a una variante più difficile dello stesso esercizio.',
 'Piegamenti sulle ginocchia: oltre 15 rip per serie → passa ai piegamenti sulle punte.'),
(53, 'Progressione', 'Progressione a tempo',
 'Per gli esercizi misurati in secondi (es. plank): aggiungi 5 secondi per serie quando riesci a tenere tutte le serie attuali con tecnica pulita fino alla fine.',
 'Plank 3 × 40s tenuti bene → la volta successiva 3 × 45s.'),
(54, 'Progressione', 'Nessuna progressione',
 'Riscaldamento, prevenzione (prehab) e cardio non servono ad aumentare i carichi ma a preparare e proteggere il corpo: si mantiene lo stesso standard a ogni seduta.',
 NULL),
(55, 'Progressione', 'Incremento',
 'L''aumento di carico da applicare quando la regola di progressione è soddisfatta. Di solito 2,5–5 kg ai macchinari e per gli esercizi delle gambe, 1–2 kg con i manubri e negli esercizi di isolamento.',
 'Incremento 2,5 kg: da 30 kg passi a 32,5 kg.'),
(56, 'Progressione', 'Scarico (deload)',
 'Una settimana in cui si riducono carichi o volume del 30–40% mantenendo gli stessi esercizi. Permette a muscoli, articolazioni e sistema nervoso di recuperare la fatica accumulata. Si fa ogni 6–8 settimane o quando la fatica è alta e i progressi si fermano.',
 NULL),
(57, 'Progressione', 'Stallo',
 'Quando un esercizio non migliora per più sedute consecutive (nell''app: 3 sedute senza aumento del 1RM stimato). Le cause più comuni sono poco recupero, sonno o alimentazione insufficienti. Si risolve con un piccolo scarico del 10% e una nuova risalita, o cambiando variante.',
 NULL),

-- ---------------- Cardio ----------------
(70, 'Cardio', 'FC max (frequenza cardiaca massima)',
 'Il numero massimo di battiti al minuto che il cuore può raggiungere sotto sforzo. L''app la stima con la formula di Tanaka (208 − 0,7 × età) ed è la base per calcolare le zone cardio. È una stima: il valore reale può variare di qualche battito.',
 '30 anni → 208 − 21 = 187 bpm circa.'),
(71, 'Cardio', 'Zone di frequenza cardiaca',
 'Intervalli di intensità calcolati in percentuale sulla FC max. Zona 1 (50–60%): molto leggera, respiri dal naso e potresti cantare. Zona 2 (60–70%): moderata, riesci a parlare a frasi brevi; ideale per resistenza e consumo di grassi. Zona 3 (70–80%): media, parlare diventa faticoso. Zona 4 (80–90%): intensa, solo poche parole. Zona 5 (90–100%): massimale, sostenibile per pochi secondi.',
 'Nell''app accanto alla zona trovi i battiti calcolati sulla tua età (se l''hai inserita nel Profilo).'),

-- ---------------- Esercizi e movimenti ----------------
(90, 'Esercizi e movimenti', 'Schema di movimento',
 'Il tipo di gesto che un esercizio allena (spinta, tirata, squat…). Esercizi con lo stesso schema allenano muscoli simili e sono in genere intercambiabili: utile se un macchinario è occupato.',
 'Leg Press e Goblet Squat sono entrambi schema "Squat".'),
(91, 'Esercizi e movimenti', 'Esercizio multiarticolare',
 'Un esercizio che muove più articolazioni e coinvolge diversi gruppi muscolari insieme. Sono la base della scheda perché permettono di usare carichi maggiori e allenano molti muscoli in poco tempo.',
 'Leg Press, Chest Press, Lat Machine, Stacco rumeno.'),
(92, 'Esercizi e movimenti', 'Isolamento',
 'Esercizio che muove una sola articolazione per concentrare il lavoro su un muscolo specifico. Completa i multiarticolari; si usano carichi più bassi e recuperi più brevi.',
 'Curl bicipiti, Leg Curl, Push down tricipiti.'),
(93, 'Esercizi e movimenti', 'Squat',
 'Schema in cui si piegano insieme anche e ginocchia mantenendo il busto relativamente dritto. Allena soprattutto quadricipiti e glutei.',
 'Leg Press, Goblet Squat.'),
(94, 'Esercizi e movimenti', 'Affondo',
 'Schema eseguito in posizione divaricata, una gamba avanti e una dietro, con il lavoro concentrato su una gamba alla volta. Allena gambe e glutei e migliora equilibrio e stabilità.',
 'Affondi sul posto (split squat).'),
(95, 'Esercizi e movimenti', 'Hinge (cerniera d''anca)',
 'Schema in cui il busto si piega in avanti spingendo il bacino indietro, con le ginocchia quasi ferme e la schiena sempre dritta. Allena femorali, glutei e muscoli lombari.',
 'Stacco rumeno con manubri, Ponte glutei.'),
(96, 'Esercizi e movimenti', 'Spinta orizzontale',
 'Spingere un carico davanti a sé, lontano dal petto. Allena petto, tricipiti e la parte anteriore delle spalle.',
 'Chest Press, Piegamenti, Panca piana.'),
(97, 'Esercizi e movimenti', 'Spinta verticale',
 'Spingere un carico sopra la testa. Allena spalle e tricipiti.',
 'Shoulder Press, Lento avanti con manubri.'),
(98, 'Esercizi e movimenti', 'Tirata orizzontale',
 'Tirare un carico verso il busto partendo da davanti a sé. Allena la parte centrale della schiena (dorsali, romboidi), deltoidi posteriori e bicipiti; importante per la postura.',
 'Rematore al Pulley basso, Rematore con manubrio.'),
(99, 'Esercizi e movimenti', 'Tirata verticale',
 'Tirare un carico dall''alto verso il basso (o il corpo verso l''alto). Allena soprattutto i dorsali, oltre a bicipiti e muscoli delle scapole.',
 'Lat Machine, Trazioni alla sbarra.'),
(100, 'Esercizi e movimenti', 'Core',
 'L''insieme dei muscoli del tronco (addominali, obliqui, lombari, glutei) che stabilizzano colonna e bacino. Un core forte protegge la schiena e rende più efficaci tutti gli altri esercizi.',
 'Plank, Dead Bug, Crunch.'),
(101, 'Esercizi e movimenti', 'Prehab (prevenzione)',
 'Esercizi di prevenzione degli infortuni: rinforzano le strutture più delicate, come la cuffia dei rotatori della spalla. Si eseguono con carichi leggeri e senza arrivare a fatica.',
 'Extrarotazioni con manubrio o al cavo.'),
(102, 'Esercizi e movimenti', 'Mobilità',
 'Esercizi che migliorano l''ampiezza di movimento delle articolazioni, così da eseguire gli esercizi nella posizione corretta. Si fanno soprattutto nel riscaldamento.',
 'World''s Greatest Stretch.'),
(103, 'Esercizi e movimenti', 'Muscolo primario e secondari',
 'Il muscolo primario (gruppo muscolare) è quello allenato principalmente dall''esercizio ed è quello usato per contare le serie settimanali. I muscoli secondari partecipano aiutando il movimento.',
 'Chest Press: primario Petto, secondari Tricipiti e Deltoide anteriore.'),
(104, 'Esercizi e movimenti', 'Cuffia dei rotatori',
 'Gruppo di quattro piccoli muscoli che stabilizzano l''articolazione della spalla. È spesso soggetta a sovraccarichi: per questo la scheda include esercizi di prevenzione dedicati.',
 NULL),

-- ---------------- Report e statistiche ----------------
(120, 'Report e statistiche', 'Volume (tonnellaggio)',
 'La somma di carico × ripetizioni di tutte le serie allenanti. È un indicatore del lavoro totale svolto: se cresce nel tempo, stai facendo progressi.',
 '3 serie da 10 rip con 50 kg = 3 × 10 × 50 = 1.500 kg.'),
(121, 'Report e statistiche', 'Serie settimanali per muscolo',
 'Il numero di serie allenanti fatte in una settimana per ciascun gruppo muscolare. È uno dei fattori principali per la crescita muscolare. Indicativamente: principianti 6–12, intermedi 10–16, avanzati 12–20 serie a settimana.',
 NULL),
(122, 'Report e statistiche', '1RM stimato',
 'Il carico massimo che potresti sollevare per una sola ripetizione, stimato dalle tue serie con la formula di Epley (kg × (1 + rip/30)). Non va testato: serve a confrontare i progressi anche se cambi peso o numero di ripetizioni.',
 '50 kg × 10 rip → 1RM stimato ≈ 66,7 kg.'),
(123, 'Report e statistiche', 'Record personale (PR)',
 'La tua migliore prestazione in un esercizio (nell''app: il 1RM stimato più alto). A fine allenamento l''app ti segnala i nuovi record.',
 NULL)
on conflict (termine) do nothing;
