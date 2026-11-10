# AGENTS.md – Ozvena (helpdesk, alternatíva k LiveAgent)

Toto je zadanie pre kódovacieho agenta. Postav funkčnú webovú aplikáciu podľa návrhov
v priečinku `design/`. Celé UI je **v slovenčine**.

## Návrhy (zdroj pravdy pre vzhľad)

Súbory `design/*.dc.html` sú interaktívne makety. Formát `.dc.html` je vlastný formát
nástroja na dizajn: neber ho ako kód na spustenie. Ber z neho rozloženie, texty, farby,
rozmery a správanie (v `<script data-dc-script>` je logika prototypu a ukážkové dáta).
`{{nieco}}` sú hodnoty z `renderVals()`, `<sc-for>` je cyklus, `<sc-if>` je podmienka.

| Súbor | Obrazovka |
|---|---|
| `Main.dc.html` | Zdieľaná schránka tiketov: zobrazenia, zoznam, vlákno, odpoveď/interná poznámka, detail zákazníka |
| `Chat.dc.html` | Chat widget na webe zákazníka |
| `ChatWidgets.dc.html` | Nastavenia: viac chat widgetov pre rôzne weby, editor farieb a vzhľadu, kód na vloženie |
| `Mailboxes.dc.html` | Nastavenia: pripojenie e-mailových schránok a filtre, podľa ktorých vznikajú tikety |
| `Automation.dc.html` | Automatizačné pravidlá KEĎ → AK → POTOM |
| `Reports.dc.html` | Reporty a SLA |
| `Knowledge.dc.html` | Verejná báza znalostí / zákaznícky portál |
| `Calls.dc.html` | Call centrum (front, aktívny hovor, číselník, história) |
| `Mobile.dc.html` | Mobilné rozhranie pre agentov (riešiť ako responzívne PWA) |

Dizajnové tokeny: písmo Manrope, text `#111827`, sekundárny text `#4B5563`, pozadie
`#F5F6F8`, panely `#FFFFFF`, okraje `#E5E7EB`, akcent `#0E7C66`, horná lišta `#111827`.
Farby kanálov a stavov sú v `renderVals()` v `Main.dc.html`. Klikateľné prvky min. 44 px,
kontrast textu min. 4.5:1, všetko ovládateľné klávesnicou.

## Odporúčaný stack

- TypeScript, Next.js (App Router), Tailwind CSS
- PostgreSQL + Prisma
- Real-time (chat, nové tikety): WebSocket (Socket.IO alebo ws) – samostatný proces alebo route
- Fronta úloh (sťahovanie pošty, pravidlá, SLA časovače): BullMQ + Redis
- E-mail: `imapflow` (IMAP IDLE), `mailparser`, `nodemailer` (SMTP); Gmail API a Microsoft Graph cez OAuth2
- Autentifikácia agentov: Auth.js (e-mail + heslo, neskôr SSO)
- Testy: Vitest (jednotkové), Playwright (E2E)
- `docker-compose.yml` s Postgres a Redis pre lokálny vývoj

Ak máš dobrý dôvod iný stack, napíš ho do README a drž sa ho konzistentne.

## Dátový model (minimum)

- `Workspace` (firma), `User` (agent, rola admin/agent), `Team`
- `Customer` (meno, e-maily, telefóny, štítky, vlastné polia)
- `Ticket` (číslo, predmet, stav: nové / otvorené / čaká na zákazníka / vyriešené, priorita,
  kanál, tím, riešiteľ, štítky, SLA termíny, zdrojová schránka alebo widget)
- `Message` (tiket, smer in/out, typ: verejná / interná poznámka, telo HTML+text,
  prílohy, Message-ID, In-Reply-To, References)
- `Mailbox` (adresa, typ: imap / gmail / m365 / forward, šifrované prístupové údaje,
  predvolený tím, stav synchronizácie)
- `MailFilter` (schránka, poradie, zapnutý, podmienky JSON, akcia JSON)
- `ChatWidget` (doména, verejné ID, farba, nadpis, poloha, tvar tlačidla, téma, avatary,
  tím, jazyk, offline správanie, proaktívna výzva, povolené domény)
- `ChatSession` (widget, návštevník, zákazník, tiket)
- `AutomationRule` (spúšťač, podmienky, akcie, poradie, zapnuté)
- `KbCategory`, `KbArticle` (verejné, slug, fulltext)
- `Call` (neskôr; viď fáza 5)

Citlivé údaje (heslá schránok, OAuth tokeny) šifruj (AES-GCM, kľúč z env premennej).

## Fázy – rob ich v tomto poradí, každá musí byť funkčná a otestovaná

### Fáza 1 – Tikety a e-mail (najvyššia priorita)
1. Prihlásenie agentov, tímy, roly.
2. Schránka tiketov podľa `Main.dc.html`: zobrazenia (Všetky otvorené, Moje, Nepriradené,
   Čaká na zákazníka, Vyriešené), triedenie podľa SLA, vlákno, odpoveď a interná poznámka
   (@zmienky), priradenie riešiteľa, zmena stavu, štítky, detail zákazníka s históriou.
3. Pripojenie schránok podľa `Mailboxes.dc.html`:
   - IMAP/SMTP formulár s tlačidlom „Otestovať pripojenie“,
   - Gmail a Microsoft 365 cez OAuth2,
   - presmerovanie: unikátna prijímacia adresa (inbound webhook / vlastný SMTP príjem).
4. Spracovanie prichádzajúcej pošty:
   - odpoveď sa pridá do existujúceho tiketu podľa `[#číslo]` v predmete alebo podľa
     `In-Reply-To` / `References`,
   - inak sa filtre schránky vyhodnotia **zhora nadol, použije sa prvý zhodný**,
   - ak nesedí žiadny, vznikne tiket pre predvolený tím schránky.
5. Filtre: podmienky (odosielateľ / doména, predmet, text, hlavička napr. `List-Unsubscribe`,
   štítok zákazníka, spam skóre, príloha) s operátormi obsahuje / je / končí na / regex;
   akcie: vytvoriť tiket (tím, priorita, štítky, SLA), pridať do existujúceho tiketu,
   nevytvárať tiket / archivovať, presunúť do spamu.
   Funkcia „Otestovať filtre na ukážkovom e-maile“ ukáže, ktorý filter sa použije.
   Logiku filtrov drž ako čistú funkciu s jednotkovými testami.
6. Odosielanie odpovedí cez SMTP / API so správnymi hlavičkami vlákna, podpis,
   automatické potvrdenie prijatia (šablóna).

### Fáza 2 – Chat widgety pre viac webov
1. Správa widgetov podľa `ChatWidgets.dc.html`: viac widgetov, každý pre inú doménu,
   vlastná farba (paleta aj vlastná hex), nadpis, poloha, tvar tlačidla, svetlá/tmavá téma,
   avatary, tím, jazyk, offline správanie, proaktívna výzva. Živý náhľad.
2. Vkladací skript `<script src=".../widget.js" data-widget="ID" async>`. Konfiguráciu
   načíta zo servera (zmena vzhľadu nevyžaduje zmenu kódu). Bež v Shadow DOM alebo iframe,
   aby štýly webu neovplyvnili widget. Kontroluj povolené domény (Origin).
3. Widget podľa `Chat.dc.html`: rýchle odpovede, prílohy, indikátor písania, offline
   formulár, ktorý vytvorí tiket. Chaty sa agentom zobrazia v schránke ako tikety kanála Chat.

### Fáza 3 – Automatizácia
Pravidlá podľa `Automation.dc.html` (spúšťače: tiket vytvorený, zákazník odpovedal,
tiket vyriešený, uplynul čas, zmeškaný hovor). Akcie: priorita, tím, riešiteľ, štítok,
SLA, odpoveď zo šablóny, prieskum spokojnosti, uzavretie. Časové pravidlá cez frontu úloh.

### Fáza 4 – Reporty a báza znalostí
- `Reports.dc.html`: nové tikety, medián prvej odpovede, dodržané SLA, CSAT, objem podľa dňa
  a kanála, výkon agentov, export CSV. Počítaj z reálnych dát.
- `Knowledge.dc.html`: verejný portál, kategórie, články (editor pre agentov), vyhľadávanie
  bez ohľadu na diakritiku, odkaz z odpovede na článok.

### Fáza 5 – Hovory (neskôr)
`Calls.dc.html` – integrácia cez poskytovateľa VoIP (napr. Twilio Voice / WebRTC), front,
IVR, nahrávky, zmeškané hovory ako tikety. Najprv priprav rozhranie a dátový model,
integráciu až po potvrdení poskytovateľa.

### Mobil
Všetky obrazovky agentov musia fungovať na šírke 390 px (`Mobile.dc.html`), aplikácia
ako PWA s push notifikáciami na nové tikety.

## Pravidlá práce
- Žiadne vymyslené dáta v produkcii; seed skript s ukážkovými dátami z návrhov je OK.
- Údaje firmy používateľa nechaj ako konfiguráciu (`[VÁŠ OBCHOD]` v návrhoch = názov workspace).
- Každá fáza: migrácie, testy, aktualizovaný README s návodom na spustenie.
- `npm run lint`, `npm test` a `npm run build` musia prejsť pred každým commitom.
