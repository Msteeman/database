# ScoutingHub — toernooi-backend op Cloudflare Workers (gratis, geen creditcard)

De drie toernooi-functies draaien nu als **één Cloudflare Worker**. Gratis plan:
100.000 verzoeken per dag, ruim genoeg. Geen Blaze, geen bankgegevens.

| Endpoint (pad achter de Worker-URL) | Doel |
|---|---|
| `/parseToernooiUrl` | Tournify-URL importeren (teams, wedstrijden, spelers) |
| `/syncTournamentResults` | Scores + standen ophalen |
| `/parseToernooiReglement` | Reglement-**URL** → regels (zie let op: PDF) |

---

## Deploy via het Cloudflare-dashboard (geen installatie nodig)

1. Ga naar **dash.cloudflare.com** → maak gratis een account (alleen e-mail + wachtwoord).
2. Links in het menu: **Workers & Pages** → **Create** → **Create Worker**.
3. Geef de Worker de naam **`scoutinghub-toernooi`** → **Deploy** (je krijgt een tijdelijke voorbeeld-Worker).
4. Klik **Edit code**. Wis de voorbeeldcode volledig.
5. Open `worker.js` (uit deze map), kopieer **alles**, plak het in de editor.
6. Klik rechtsboven **Deploy**.
7. Bovenaan staat nu je Worker-URL, bijv.:
   `https://scoutinghub-toernooi.jouwnaam.workers.dev`
   **Noteer die URL** — die heb je zo nodig.

## Deploy via de terminal (als je wrangler wilt)

```bash
npm i -g wrangler
wrangler login
cd cloudflare
wrangler deploy
```
`wrangler deploy` print de definitieve URL.

---

## Stap 2 — app.js naar je eigen Worker laten wijzen

In `app.js` staat bovenaan de toernooi-sectie één regel:

```js
const TOERNOOI_API_BASE = 'https://scoutinghub-toernooi.<JOUW-SUBDOMEIN>.workers.dev';
```

Vervang `<JOUW-SUBDOMEIN>` door het stukje uit jouw Worker-URL.
Voorbeeld: is je URL `https://scoutinghub-toernooi.jouwnaam.workers.dev`,
dan wordt de regel:

```js
const TOERNOOI_API_BASE = 'https://scoutinghub-toernooi.jouwnaam.workers.dev';
```

Sla op en upload **app.js** opnieuw naar GitHub (zoals je eerder deed). Klaar.

---

## Snelle rooktest (na deploy)

Open in je browser (vervang de URL door die van jou), of via curl:

```bash
curl -s -X POST https://scoutinghub-toernooi.<JOUW-SUBDOMEIN>.workers.dev/parseToernooiUrl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://tournifyapp.com/live/itt2026"}'
```

Verwacht: HTTP 200 met JSON. Bij een client-side gerenderd toernooi zijn `teams`/`matches`
leeg met een `warnings`-melding — geen fout, dat is hetzelfde gedrag als de Firebase-versie.

---

## Eén verschil t.o.v. de Firebase-versie — eerlijk

- **Reglement via URL** → werkt volledig (de webpagina met het reglement wordt gelezen).
- **Reglement via PDF-upload** → **niet** op het gratis Cloudflare-plan. De Worker draait in
  een browser-achtige omgeving zonder Node, dus de PDF-lezer (`pdf-parse`) kan daar niet draaien.
  De functie geeft dan een nette melding: *"plak de reglement-URL in plaats van een PDF"*.
  In de praktijk staan toernooireglementen bijna altijd ook als webpagina online — plak die link.

Alle andere onderdelen (import, scores, standen, regels via URL) zijn **één-op-één** identiek
aan de Firebase-versie.

---

## Veiligheid

- De Worker leest alleen **openbare** Tournify-pagina's en geeft JSON terug.
- Hij schrijft **niets** naar je database — dat doet je app zelf, en je Firestore-rules
  blijven de poortwachter.
- Geen secrets, geen bankgegevens, geen verrassingsrekening.
