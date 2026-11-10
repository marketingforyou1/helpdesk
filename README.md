# Ozvena – helpdesk

Zákaznícka podpora: zdieľaná schránka tiketov, e-mailové schránky s filtrami, (neskôr) chat widgety,
automatizácia, reporty, báza znalostí a hovory. Zadanie a fázy sú v [`AGENTS.md`](AGENTS.md),
návrhy obrazoviek v [`design/`](design).

## Stav

**Fáza 1 – tikety a e-mail** (hotové):

- prihlásenie agentov (admin / agent), tímy
- schránka tiketov: zobrazenia Všetky otvorené / Moje / Nepriradené / Čaká na zákazníka / Vyriešené,
  hľadanie, triedenie podľa SLA, vlákno, odpoveď zákazníkovi a interná poznámka, priradenie agentovi
  alebo tímu, zmena stavu, štítky a história zákazníka
- e-mailové schránky:
  - **IMAP/SMTP** – pri uložení sa overí pripojenie, heslá sú šifrované (AES-256-GCM),
    poštu sťahuje worker (`npm run worker`) alebo tlačidlo „Stiahnuť poštu teraz“
  - **presmerovanie** – každá schránka má tajnú adresu `/api/inbound/<token>`, na ktorú poskytovateľ
    pošty (Mailgun, Postmark, SendGrid Inbound Parse…) posiela surový e-mail (MIME) metódou POST
  - Gmail a Microsoft 365 cez OAuth – zatiaľ nie (dá sa použiť IMAP s heslom aplikácie)
- spracovanie prichádzajúcej pošty:
  1. duplicitné správy (rovnaké Message-ID) sa ignorujú
  2. odpoveď sa pridá do existujúceho tiketu podľa `In-Reply-To`/`References` alebo `[#číslo]`
     v predmete (číslo platí len pre e-mail od zákazníka daného tiketu)
  3. inak sa filtre schránky vyhodnotia zhora nadol, použije sa prvý zhodný:
     vytvoriť tiket (tím, priorita, štítky, SLA), nevytvárať tiket, spam
  4. ak nesedí žiadny filter, vznikne tiket pre predvolený tím schránky
- tester filtrov na ukážkovom e-maile, poradie, zapínanie a mazanie filtrov
- odpovede odchádzajú cez SMTP schránky (alebo `SMTP_URL`) so správnymi hlavičkami vlákna
  a `[#číslo]` v predmete; voliteľné automatické potvrdenie prijatia

## Spustenie lokálne

Potrebujete Node.js 22 a PostgreSQL 16 (napr. `docker compose up -d`).

```bash
cp .env.example .env      # doplňte ENCRYPTION_KEY a SESSION_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate deploy
npm run db:seed           # ukážkové dáta, prihlásenie admin@ozvena.local / ozvena123
npm run dev               # http://localhost:3000
npm run worker            # v druhom termináli: sťahovanie pošty z IMAP schránok
```

Odosielanie pre schránky bez vlastného SMTP: nastavte `SMTP_URL`, napr.
`smtps://pouzivatel:heslo@smtp.vasadomena.sk:465`.

## Testy a kontroly

```bash
npm test          # Vitest – filtre, parsovanie e-mailov, spracovanie a spájanie do tiketov (potrebuje DB ozvena_test)
npm run lint
npm run typecheck
npm run build
```

Testovacia databáza: `createdb -O ozvena ozvena_test` (alebo nastavte `TEST_DATABASE_URL`).

## Ďalej

Fáza 2 – chat widgety pre viac webov, Fáza 3 – automatizácia, Fáza 4 – reporty a báza znalostí,
Fáza 5 – hovory. Podrobne v `AGENTS.md`.
