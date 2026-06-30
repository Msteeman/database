# ScoutingHub — Handover voor Cowork
**Datum:** 30 juni 2026
**Branch:** `Testomgeving`
**Gemaakt door:** Claude Code (Anthropic) — samenvatting van twee sessies

---

## 1. Project-overzicht

ScoutingHub is een Nederlandse voetbal-scouting SPA/PWA.

| Onderdeel | Technologie |
|---|---|
| Frontend | Vanilla JS SPA (`app.js`, ~33.000 regels) |
| Backend API | Cloudflare Worker (`worker.js`) |
| Database | Google Firestore (via REST, service account) |
| Authenticatie | Firebase Auth |
| E-mail verzenden | Resend API |
| E-mail ontvangen | IMAP via TransIP (`imap.transip.email:993` SSL) |
| Hosting | Vercel (frontend), Cloudflare Workers (API) |

### Projectregels (VERPLICHT voor Cowork)

- Altijd werken op branch `Testomgeving`, NOOIT op `main`
- NOOIT gedachtestreepje (--) gebruiken in de app of tooltips
- `sw.js` CACHE_VERSION bumpen bij elke wijziging aan `app.js`, `index.html` of `style.css`
- `serviceAccount.json` NOOIT naar GitHub (staat in `.gitignore`)
- Huidige CACHE_VERSION: `sh-v518-mail-fixes` (sw.js regel 3)

### Commits bekijken

```bash
git log --oneline -20
git diff main..Testomgeving --stat
```

---

## 2. Wat gedaan is (chronologisch)

### Sessie 1 — Rittenregistratie km-berekening

**Probleem:** Selecteren van "FC Twente/Heracles Academie" uit de club-dropdown vulde het adres correct in, maar de km-berekening mislukte. Handmatig hetzelfde adres intypen gaf wel het juiste resultaat (108.9 km).

**Root cause:** In `_ritTryAutoKm()` (app.js ~regel 4866) stond de conditie `!isFinite(_aLat)`. Maar `isFinite(0) = true`, dus als de aankomst-lat nog `0` was (standaard hidden field bij een club-suggestie zonder directe coords), werd geocoding overgeslagen. Daarna faalde OSRM omdat `(0, 0)` buiten Nederland ligt.

**Reeks fixes:**
| Commit | Beschrijving |
|---|---|
| `b9f35c2` | Vaste locaties uitgebreid + PDOK eerste geocoder |
| `0759fe9` | Directe clubsleutels in `_RIT_VASTE_LOC` |
| `6293a49` | Postcode-extractie voor PDOK, betere geocode-volgorde |
| `46e8a29` | Coords wissen bij adreswijziging |
| `b057346` | km-veld wissen bij adreswijziging |
| `0eb3c6e` | Club-suggestie: zelfde geocode-pad als handmatig typen |
| `a531374` | Debug: toasts met exacte coords (TIJDELIJK, mag weg) |
| `fe6ef63` | Debug: coords in km-placeholder (TIJDELIJK, mag weg) |
| `1f6265e` | **Echte fix:** `isFinite` vervangen door `_ritCoordsValid` |

**Na de fix:**
```js
// VOOR (fout):
if(!isFinite(_aLat) || !isFinite(_aLon)){

// NA (correct):
if(!_ritCoordsValid(_aLat, _aLon)){
// _ritCoordsValid = lat>=50.5 && lat<=53.7 && lon>=3.2 && lon<=7.4
```

**Status:** Gepusht, nog niet bevestigd getest door gebruiker.

---

### Sessie 2 — Mailcentrum (Admin Center)

Het Mailcentrum in het admin-center heeft drie mailboxen: `admin@`, `contact@`, `info@`. Gebruiker meldde drie bugs.

#### Bug A: Inbox-emails tonen raw MIME (encoding-fouten, boundary-regels zichtbaar)

**Symptoom:** Email-inhoud toonde rauwe MIME-grenzen (`----_NmP-...`), `Â `-tekens (encoding-artefact), en MIME-headers als `Content-Type: text/html`.

**Root causes (worker.js):**

1. **Onflexibele FETCH-regex:** TransIP's IMAP-server stuurt soms `FLAGS (\Seen)` *voor* `BODY[]` in de FETCH-respons. De regex `/\* \d+ FETCH \(BODY\[\] .../` vond de body dan niet.

2. **`\r\n\r\n` vs `\n\n`:** De MIME-part parser gebruikte `indexOf('\r\n\r\n')` om de header/body-scheiding te vinden. Sommige e-mails (via Resend gegenereerd) gebruiken `\n\n` binnenin parts, waardoor het parsen mislukte en de volledige raw body als `text` werd weergegeven.

3. **Charset-blindheid:** `imapDecodeQP` gebruikte altijd UTF-8, ook als de part-header `charset=windows-1252` of iets anders aangaf. Dit veroorzaakte de `Â `-tekens (UTF-8-fout bij Latin-1 bytes).

**Fixes (commit `5eff92c`):**
- FETCH-regex: `\(BODY\[\]` -> `\([\s\S]*?BODY\[\]` (accepteert extra IMAP-attributen ervoor)
- Zowel outer als inner header/body-split valt terug op `\n\n` als `\r\n\r\n` ontbreekt
- `imapDecodeQP(str, charset)` accepteert nu een optionele charset-parameter
- Elke MIME-part extraheert nu zijn eigen `charset=` uit de Content-Type header en geeft die door aan de decoder

#### Bug B: Verstuurd (Sent) map is leeg

**Symptoom:** Verstuurde e-mails verschijnen niet in de Verzonden-map.

**Root cause:** `imapAppendSent()` (worker.js) deed IMAP APPEND naar de Sent-map, maar als die map niet bestond op de TransIP-server (nieuw account, nooit aangemaakt), faalde dit stil (wrapped in `try{}catch(_){}`).

**Fix (commit `5eff92c`):**
- Als `imapPickFolder(names, 'sent')` niets vindt, wordt nu eerst `IMAP CREATE "Sent"` gestuurd
- Daarna APPEND naar de aangemaakte map

#### Bug C: Nieuwsbrief "Abonnees laden mislukt"

**Symptoom:** Klikken op "Nieuwsbrief" in het Mailcentrum toont "Abonnees laden mislukt."

**Root causes:**
1. **Verkeerd sorteerveld:** `handleAdminNewsletterList` sorteerde op `b.timestamp`, maar het veld heet `requestedAt` in `access_requests`. Dit gaf een stille fout maar geen crash.
2. **Mogelijk 403/500:** Onzeker waarom de request faalt. De endpoint IS aanwezig in de router. Admin-check werkt voor inbox. Kan zijn: timing, saToken-probleem, of een andere niet-gevonden bug.

**Fixes (commit `5eff92c`):**
- Sorteerveld gecorrigeerd: `b.timestamp` -> `b.requestedAt`
- Foutmelding in de UI toont nu ook het werkelijke foutdetail uit `j.error`, zodat Cowork de oorzaak kan zien

**Datamodel nieuwsbrief:** Elke `access_requests`-document heeft een `newsletterOptIn: boolean` veld. Bij opt-in (`true`) verschijnt de persoon in de lijst. Historische aanvragen (voor de feature bestond) staan er NIET in tenzij ze het vinkje hadden gezet.

**Status: Nog niet opgelost.** De frontend toont nu wel het foutdetail. Na deployen van de worker moet Cowork kijken wat er feitelijk staat.

---

## 3. Huidige staat van de branch

```
main -----> b589160 (mailbox HTML iframe, stats, feedback, etc.)
              \
Testomgeving -> ... -> 5eff92c (mailcentrum MIME/verzonden/nieuwsbrief)
```

Commits die Testomgeving heeft maar main NIET (nieuwste bovenaan):

| Commit | Beschrijving |
|---|---|
| `5eff92c` | Mailcentrum: MIME parsing, verzonden map, nieuwsbrief fixes |
| `1f6265e` | Ritten: coords-skip fix (isFinite -> _ritCoordsValid) |
| `fe6ef63` | Debug: coords in km-placeholder **[DEBUG, mag weg]** |
| `a531374` | Debug: toasts exacte coords **[DEBUG, mag weg]** |
| `b242483` | Docs: CLAUDE.md aangemaakt |
| `0eb3c6e` | Ritten: club-suggestie geocode-pad fix |
| `b057346` | Ritten: km-veld wissen bij adreswijziging |
| `46e8a29` | Ritten: coords wissen bij adreswijziging |
| `6293a49` | Ritten: postcode-extractie PDOK, geocode-volgorde |
| `0759fe9` | Ritten: directe clubsleutels vaste locaties |
| `b9f35c2` | Ritten: vaste locaties uitgebreid, PDOK eerste geocoder |

---

## 4. Cloudflare Worker deployment — BELANGRIJK

De `wrangler.toml` heeft **geen aparte test-omgeving**. Er is momenteel slechts een Worker: `scoutinghub-toernooi`. Dat betekent:

- `wrangler deploy` vanuit welke branch dan ook = LIVE/PRODUCTIE
- Git-branch `Testomgeving` isoleert alleen de code in git, niet de CF-worker

**Optie A — Veilige test-worker toevoegen (aanbevolen):**

Voeg dit toe aan `wrangler.toml`:
```toml
[env.test]
name = "scoutinghub-toernooi-test"
```
Dan deployen met: `wrangler deploy --env test`

Dit geeft een aparte URL zonder de live omgeving te raken. De frontend kan dan tijdelijk wijzen naar die test-URL (via `_admBase()` in app.js, of via een aparte index.html).

**Optie B — Direct naar productie (acceptabel voor bugfixes):**

De huidige mailcentrum-fixes zijn puur bugfixes zonder nieuwe endpoints of gedragswijzigingen voor de rest van de app. Direct deployen is technisch veilig.

---

## 5. Open items voor Cowork

### Hoge prioriteit

#### 5.1 Cloudflare Worker deployen en mailcentrum testen

Na deployen (`wrangler deploy` of via het CF-dashboard):

1. **Inbox** — Open een email. Rendert hij nu correct als HTML (geen raw MIME-grenzen meer, geen `Â `)?
2. **Verstuurd** — Stuur een test-mail via Opstellen. Verschijnt die daarna in Verzonden?
3. **Nieuwsbrief** — Klik op Nieuwsbrief-tab. Staat er nu een foutdetail in de UI? Zo ja: wat staat er?

Als de nieuwsbrief nog steeds faalt: kijk in de Cloudflare Worker logs (CF dashboard > Workers > `scoutinghub-toernooi` > Logs) voor de exacte exception.

#### 5.2 Debug-code verwijderen uit app.js

Twee commits voegden tijdelijke debug-output toe die nog in app.js staat. Zoeken op `DBG` of `[DEBUG]`:

```bash
grep -n "DBG\|DEBUG" app.js
```

Verwijderen: de km-placeholder toont nu "DBG v=X a=Y" in plaats van een schone waarde. De toasts tonen exacte coordinaten. Dit moet weg zodra de km-fix bevestigd werkt.

#### 5.3 Rittenregistratie km-fix bevestigen

De fix is live (commit `1f6265e`). Testen: ga naar Rittenregistratie, typ in het aankomstveld "FC Twente" of "Heracles Academie", selecteer de suggestie. De km-berekening moet nu ~108.9 km geven (vanuit Amsterdam/Utrecht).

### Middelhoge prioriteit

#### 5.4 Nieuwsbrief-subscribers: historische aanvragen

Aanvragen van voor het `newsletterOptIn`-veld bestaan zijn er NIET in. Wil je die alsnog toevoegen? Dan moet je:
- Via Firestore console alle `access_requests` doorlopen en `newsletterOptIn: true` zetten voor wie destijds interesse had
- OF een admin-scriptje schrijven dat dat automatisch doet

Nieuwe aanvragen worden automatisch correct opgeslagen (het veld zit al in het formulier).

#### 5.5 Nieuwsbrief auto-update bij nieuwe aanvragen

Het Mailcentrum laadt de lijst handmatig (elke keer als je op het tabblad klikt). Er is geen realtime Firestore-listener. Als je wil dat de lijst automatisch bijwerkt bij nieuwe aanvragen, moet een `onSnapshot` op `access_requests` toegevoegd worden in app.js. Dat is optioneel maar simpel.

### Lage prioriteit

#### 5.6 Debug-toasts en placeholder (zie 5.2)

#### 5.7 `_tipPlanWedstrijd` vullt niets voor in

`_tipPlanWedstrijd(id)` in app.js (~regel 30443) navigeert naar het programma-scherm maar vult geen tip-data (speler, club, datum) voor in. "Maak rapport" werkt wel correct. Dit is een bekende beperking, geen bug.

#### 5.8 Club logos fix op website

Staat open, niet bekeken.

#### 5.9 Admin PWA installeerbaar maken

Staat open, niet bekeken.

---

## 6. Architectuur — Mail (voor begrip)

### Hoe inbox werkt (IMAP, read-only)

```
Browser
  └─ POST /api/admin-mail-inbox  {type:'admin', folder:'inbox'}
       └─ handleAdminMailInbox (worker.js)
            └─ imapFetchFolder (worker.js)
                 └─ IMAP CONNECT imap.transip.email:993 (SSL)
                      └─ LOGIN + SELECT INBOX + FETCH 1:20 (BODY[HEADER.FIELDS ...])
                           └─ imapParseFetchHeaders (lijst: from/subject/date/seq)
```

Voor de volledige body van een specifiek bericht:
```
POST /api/admin-mail-read  {type, folder, seq}
  └─ imapFetchBody
       └─ FETCH <seq> BODY.PEEK[]
            └─ imapExtractBody (multipart parser)
                 └─ imapDecodeQP / b64utf8 per MIME-part
```

### Hoe verzenden werkt

```
Browser
  └─ POST /api/admin-mail-send  {type, to, subject, message}
       └─ handleAdminMailSend (worker.js)
            ├─ sendMail (Resend API)            — daadwerkelijk verzenden
            └─ imapAppendSent (IMAP APPEND)    — kopie in Verzonden
```

### Hoe nieuwsbrief werkt

```
Browser
  └─ POST /api/admin-newsletter-list
       └─ handleAdminNewsletterList
            └─ saFsList(saToken, 'access_requests', 500)   — Firestore REST
                 └─ filter: x.newsletterOptIn === true
```

Nieuwsbrief versturen:
```
POST /api/admin-newsletter-send  {subject, message}
  └─ handleAdminNewsletterSend
       └─ saFsList (subscribers ophalen)
            └─ for each subscriber: sendMail (Resend)
```

### IMAP credentials (Cloudflare Secrets)

| Secret | Mailbox |
|---|---|
| `IMAP_PASS_ADMIN` | admin@scoutinghub.nl |
| `IMAP_PASS_CONTACT` | contact@scoutinghub.nl |
| `IMAP_PASS_INFO` | info@scoutinghub.nl |

---

## 7. Sleutellocaties in de code

### worker.js

| Functie | Regel (ca.) | Omschrijving |
|---|---|---|
| `imapMailboxCfg` | 2093 | IMAP config per type (host/port/user/pass) |
| `imapReadUntilTagged` | 2106 | Socket lezen tot IMAP-tag |
| `imapDecodeQP` | 2284 | Quoted-Printable decoding (nu charset-aware) |
| `imapExtractBody` | 2312 | MIME-multipart parser |
| `imapFetchFolder` | 2208 | Folder listing ophalen via IMAP |
| `imapFetchBody` | 2390 | Volledige bericht-body ophalen via IMAP |
| `imapAppendSent` | 1858 | IMAP APPEND naar Verzonden-map |
| `handleAdminMailSend` | 1813 | Verzenden via Resend + APPEND |
| `handleAdminMailInbox` | 2478 | Inbox-lijst handler |
| `handleAdminMailRead` | 2453 | Bericht-body handler |
| `handleAdminNewsletterList` | 2008 | Nieuwsbrief-abonnees handler |
| `handleAdminNewsletterSend` | 2025 | Nieuwsbrief versturen |
| `isCallerAdmin` | 1274 | Admin-check (ADMIN_EMAILS of Firestore role) |
| `saFsList` | 1219 | Firestore collectie ophalen (REST) |

### app.js

| Functie | Regel (ca.) | Omschrijving |
|---|---|---|
| `_admRenderMail` | 32317 | Mailcentrum entry point |
| `_admMbRebuild` | 32335 | Opbouw 3-kolom layout (tabs + sidebar + lijst + detail) |
| `_admMbLoadFolder` | 32572 | Folder laden via API |
| `_admMbOpenMail` | 32592 | Bericht openen via API, renderen in iframe of pre |
| `_admMbRenderNewsletter` | 32488 | Nieuwsbrief-tab renderen |
| `_admMbSend` | 32464 | Verzend-knop handler |
| `_ritTryAutoKm` | 4866 | Km-berekening triggeren |
| `_ritCoordsValid` | 4848 | Coordinaten-validatie (binnen NL) |
| `_RIT_VASTE_LOC` | 4527 | Offline tabel bekende clubs |

---

## 8. Service Worker versies (history)

| Versie | Beschrijving |
|---|---|
| `sh-v514-club-suggest-fix` | Mousedown-handler fix club-suggestie |
| `sh-v515-debug` | Debug coords in placeholder |
| `sh-v516-debug2` | Extra debug |
| `sh-v517-coords-valid-fix` | Echte km-fix (isFinite -> _ritCoordsValid) |
| `sh-v518-mail-fixes` | **Huidig** — Mailcentrum MIME/verzonden/nieuwsbrief |

---

## 9. Hoe verder — aanbevolen volgorde voor Cowork

1. **Worker deployen** (CF dashboard of `wrangler deploy`)
2. **Mailcentrum testen** (inbox rendering, verzonden, nieuwsbrief)
3. **Als nieuwsbrief nog faalt:** CF Worker logs bekijken voor de exacte fout
4. **Debug-code verwijderen** uit app.js (grep op `DBG`)
5. **Km-fix bevestigen** in rittenregistratie
6. **Optioneel:** test-omgeving toevoegen aan `wrangler.toml` voor veilig testen

---

*Gegenereerd door Claude Code op 30 juni 2026*
