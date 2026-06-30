# ScoutingHub — Handover document voor Cowork
**Datum:** 29 juni 2026  
**Branch:** `Testomgeving`  
**Gemaakt door:** Claude Code (Anthropic)

---

## Wat Cowork kan zien in de repo

Cowork kan alle wijzigingen zien via git. Handig om te runnen:

```bash
git log --oneline -15
git diff main..Testomgeving --stat
git diff main..Testomgeving -- app.js
```

De branch `Testomgeving` loopt vooruit op `main` met de onderstaande commits. De grote bestanden zijn `app.js` (+1563 regels gewijzigd) en `sw.js` (versie-bump).

---

## Commits in deze sessie (nieuwste bovenaan)

| Commit | Beschrijving |
|---|---|
| `1f6265e` | **Echte fix:** coords-skip conditie gewijzigd van `isFinite` naar `_ritCoordsValid` |
| `fe6ef63` | Debug: coords zichtbaar in km-placeholder (kan verwijderd worden) |
| `a531374` | Debug: toasts met exacte coords bij km-berekening (kan verwijderd worden) |
| `b242483` | Docs: CLAUDE.md aangemaakt |
| `0eb3c6e` | Ritten: club-suggestie gebruikt zelfde geocode-pad als handmatig typen |
| `b057346` | Ritten: km-veld wissen bij adreswijziging |
| `46e8a29` | Ritten: coords wissen bij adreswijziging |
| `6293a49` | Ritten: postcode-extractie voor PDOK, verbeterde `_geocode` volgorde |
| `0759fe9` | Ritten: directe clubsleutels in `_RIT_VASTE_LOC` (ajax/psv/feyenoord etc.) |
| `b9f35c2` | Ritten: vaste locaties uitgebreid (Twente/Heracles etc.), PDOK eerste geocoder |

> **Let op:** commits `fe6ef63` en `a531374` zijn debug-commits die debug-output toevoegen aan de km-placeholder en als toasts. Die mogen weg als de fix bevestigd werkt.

---

## Hoofdprobleem dat opgelost is: Rittenregistratie km-berekening

### Symptoom
Bij het selecteren van "FC Twente/Heracles Academie" uit de autocomplete-dropdown werd het adres correct ingevuld ("Kuipersdijk 40, 7552 BJ, Hengelo"), maar de km-berekening mislukte. Handmatig hetzelfde adres intypen gaf wel het goede resultaat (108.9 km).

### Root cause
In `_ritTryAutoKm()` (app.js) werd de conditie om geocoding te doen gecheckt met `!isFinite(_aLat)`. Het probleem:

- `isFinite(0) = true` — dus als de aankomst-lat `0` was (default hidden field), werd geocoding overgeslagen
- Vervolgens deed `_ritCoordsValid(0, 0)` → `false` (buiten NL), dus OSRM-aanroep mislukte
- Resultaat: "Kon afstand niet berekenen"

### De fix (commit `1f6265e`)
In `_ritTryAutoKm()` zijn beide geocoding-condities gewijzigd:

```js
// VOOR (fout — isFinite(0) = true, geocoding werd overgeslagen):
if(!isFinite(_vLat) || !isFinite(_vLon)){
if(!isFinite(_aLat) || !isFinite(_aLon)){

// NA (correct — 0,0 of andere waarden buiten NL triggeren altijd geocoding):
if(!_ritCoordsValid(_vLat, _vLon)){
if(!_ritCoordsValid(_aLat, _aLon)){
```

`_ritCoordsValid(lat, lon)` controleert: `lat >= 50.5 && lat <= 53.7 && lon >= 3.2 && lon <= 7.4`

### Locatie in app.js
- `_ritTryAutoKm(force)` — rond **regel 4866**
- `_ritCoordsValid(lat, lon)` — rond **regel 4848**
- `_ritRouteKm(lat1, lon1, lat2, lon2)` — rond **regel 4857** (OSRM + haversine fallback)
- `_ritVasteLoc(txt)` — rond **regel 4609** (offline tabel bekende clubs)
- `_RIT_VASTE_LOC` — rond **regel 4527** (hardcoded coordinaten)
- `_ritSetupSuggest()` — rond **regel 4725** (autocomplete dropdown)

### Hoe geocoding werkt (`_geocode` functie, binnen `_ritTryAutoKm`)
De geocoder probeert in volgorde:
1. **Vaste loc** — offline tabel `_RIT_VASTE_LOC` (bijv. "kuipersdijk" → lat/lon)
2. **PDOK met postcode** — `api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=postcode`
3. **PDOK volledig adres**
4. **Nominatim** (OpenStreetMap)
5. **Photon**
6. **Voor de komma** (adresgedeelte)
7. **Na de komma** (plaatsgedeelte)

PDOK response-formaat: `centroide_ll: "POINT(lon lat)"` (WKT, lon eerst!)

### Eerder gedane fix die niet genoeg was (commit `0eb3c6e`)
De mousedown-handler in `_ritSetupSuggest()` was vereenvoudigd: bij klikken op een suggestie met alleen adres (geen directe lat/lon) worden de hidden velden gewist en `_ritTryAutoKm(true)` aangeroepen. Dit was correct, maar de root cause (isFinite-bug) bleef.

---

## Service Worker versies

| Versie | Beschrijving |
|---|---|
| `sh-v514-club-suggest-fix` | mousedown-handler fix |
| `sh-v515-debug` | debug coords in placeholder |
| `sh-v516-debug2` | extra debug |
| `sh-v517-coords-valid-fix` | **Huidige versie** — echte fix |

**sw.js regel 3:** `const CACHE_VERSION = 'sh-v517-coords-valid-fix';`

---

## Feature onderzocht maar niet gewijzigd: Getipte spelers

We hebben de getipte spelers feature in kaart gebracht. Niets is hier gewijzigd.

### Data model (Firestore via `tipsCol()`)
```js
{
  id,               // 't_' + timestamp + random
  datum,            // ISO datum string
  tipgever,         // VERPLICHT
  tipgever_contact,
  speler,           // VERPLICHT
  elftal,
  leeftijd,
  positie,
  regio,
  prioriteit,       // 'Hoog' | 'Midden' | 'Laag'
  status,           // 'Nog te bekijken' | andere opties
  bijzonderheden,   // VERPLICHT
  created_at,
  updated_at
}
```

### Relevante functies
| Functie | Regel ca. | Beschrijving |
|---|---|---|
| `renderTips()` | 5745 | Rendert lijst met zoek/sort/filter op status |
| `openTipModal(id)` | 5849 | Opent bewerk-modal (id=null = nieuwe tip) |
| `submitTipForm(e)` | 5881 | Formulier validatie + opslaan |
| `saveTip(tip)` | 3709 | Firestore `setDoc` |
| `deleteTip(id)` | 3722 | Firestore `deleteDoc` |
| `_tipMaakRapport(id)` | 30424 | Navigeert naar rapport, vult naam/elftal/positie/leeftijd in |
| `_tipPlanWedstrijd(id)` | 30443 | Navigeert naar programma, maar vult NIETS voor in |
| `tipsCache` | 732 | Array, gevuld via Firestore `onSnapshot` (realtime) |

### Bekend knelpunt
`_tipPlanWedstrijd(id)` navigeert alleen naar het programma-scherm en toont een toast. Er wordt geen data vanuit de tip (speler, club, datum) vooringevuld in het programmaformulier. "Maak rapport" werkt wel correct.

---

## Open items (nog te doen)

1. **Rittenregistratie km-fix bevestigen** — commit `1f6265e` gepusht, testen of FC Twente/Heracles Academie nu 108.9 km geeft na hard refresh (Ctrl+Shift+R)
2. **Debug-code verwijderen** — commits `fe6ef63` en `a531374` voegden debug-output toe aan de km-placeholder en als toasts. Verwijderen zodra fix bevestigd werkt. Zoek in app.js op `DBG` of `[DEBUG]` om ze te vinden.
3. **`_tipPlanWedstrijd` verbeteren** — bij klikken "Plan wedstrijd" ook tip-data voorinvullen in programmaformulier
4. **Club logos** — fix op de website (niet bekeken)
5. **Admin PWA installeerbaar maken** — niet bekeken

---

## Projectregels (verplicht)

- **Branch:** altijd `Testomgeving`, NOOIT op `main`
- **Push:** `git add <bestanden>` → `git commit -m "beschrijving"` → `git push origin Testomgeving`
- **NOOIT** gedachtestreepje (—) gebruiken, nergens in de app of tooltips
- **`sw.js` CACHE_VERSION bumpen** bij elke wijziging aan `app.js`, `index.html` of `style.css`
- **`serviceAccount.json`** NOOIT naar GitHub (staat in `.gitignore`)

## Huisstijl
- Achtergrond: `#10151e`
- Primary: `#e30613` (rood)
- Secondary: `#f5c518` (geel)
- Accent: `#4ea1ff` (blauw)
- Font: Inter

---

*Gegenereerd door Claude Code op 29 juni 2026*
