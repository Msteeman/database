# ScoutingHub — Checklist: Testomgeving naar productie overzetten

> ⚠️ **Dit document is alleen referentie.** Niets hierin wordt automatisch
> uitgevoerd. Doorloop dit pas als expliciet besloten is om live te gaan.
>
> ⚠️ **Geen echte secret-waarden in dit document.** Waar een waarde nodig is
> staat die in `C:\Users\marcel.steeman\Scoutinghub\keys.txt` (lokaal, niet
> in git) of moet apart worden opgezocht/aangemaakt.

Laatst bijgewerkt: 2026-07-02 (na de sessie met mailcentrum, nieuwsbrief-editor,
AI-integratie en autonome screenshots).

---

## 0. Uitgangssituatie

| Omgeving | Frontend | Worker (admin/mail) | Screenshot-worker |
|---|---|---|---|
| **Test** | branch `Testomgeving` (Vercel preview) | `scoutinghub-api-test` | `scoutinghub-screenshot-test` |
| **Productie** | branch `main` (scoutinghub.nl) | `scoutinghub-api` (draait **oude** code) | bestaat niet |

De productie-worker `scoutinghub-api` heeft op dit moment **geen** van de
functies uit deze sessie: geen mailcentrum-uitbreidingen, geen nieuwsbrief-
editor, geen AI, geen screenshots. Alleen de originele Tournify-routes
(`/parse`, `/reglement`, `/sync`) werken daar.

---

## 1. Worker.js deployen naar productie

De huidige `worker.js` (test) moet naar de **productie**-workernaam:

```powershell
# Zelfde script als voor test, maar met de PRODUCTIE workernaam.
# Pas WorkerName aan in deploy-test-worker.ps1 of maak een kopie
# deploy-prod-worker.ps1 met:
$WorkerName = "scoutinghub-api"
```

**Let op:** dit overschrijft de huidige (oude) productiecode volledig. Maak
vooraf een back-up van de huidige productie-worker via het Cloudflare-
dashboard (Workers & Pages → scoutinghub-api → "..." → Download).

---

## 2. Secrets controleren/aanvullen op `scoutinghub-api`

| Secret | Status op productie (laatst bekend) | Actie |
|---|---|---|
| `ADMIN_EMAILS` | onbekend, controleren | check op **geen spatie** in de naam (dit was een bug op test) |
| `FB_API_KEY` | bestond al | controleren dat waarde nog klopt |
| `IMAP_PASS_ADMIN` | bestond al | — |
| `IMAP_PASS_CONTACT` | bestond al | — |
| `IMAP_PASS_INFO` | bestond al | — |
| `RESEND_API_KEY` | bestond al ("ScoutingHub Worker" key) | **niet** de test-key gebruiken, productie heeft een eigen Resend-key |
| `SERVICE_ACCOUNT_JSON` | bestond al | controleren dat waarde nog klopt, **geen spatie** in de naam |
| `TURNSTILE_SECRET` | bestond al | — |
| `SELF_URL` | **ontbreekt/moet kloppen** | zetten op `https://scoutinghub-api.marcelsteeman1.workers.dev` (NIET de test-URL — anders wijzen afmeldlinks in nieuwsbrieven naar de verkeerde worker) |
| `GEMINI_API_KEY` | **ontbreekt volledig** | toevoegen, zelfde key als test kan (gratis tier, geen kosten) — of een aparte key aanmaken als je quota's gescheiden wilt houden |

**Belangrijkste valkuil (kwam op test al een keer voor):** controleer bij het
zetten van secrets dat er geen spatie in de naam sluipt (`"ADMIN_EMAILS "`
i.p.v. `"ADMIN_EMAILS"`) — dat breekt admin-login stilletjes.

---

## 3. Screenshot-worker (`scoutinghub-screenshot-test`)

Deze hoeft **niet** verdubbeld te worden naar een aparte productienaam — hij
logt sowieso al in op de **echte** `www.scoutinghub.nl` met het demo-account,
ongeacht welke admin-worker (test of productie) hem aanroept.

**Optioneel**, puur voor nette naamgeving: de worker hernoemen naar
`scoutinghub-screenshot` (zonder `-test`) en in `worker.js` de constante
`NL_SCREENSHOT_WORKER` bijwerken naar de nieuwe URL. Functioneel maakt het
niets uit of dit gebeurt.

Controleer wel:
- Secrets `DEMO_EMAIL` / `DEMO_PASSWORD` staan er nog en het demo-account
  (`demo@scoutinghub.nl`) bestaat nog en is actief.
- De `browser`-binding (`MYBROWSER`) staat nog correct.
- `nodejs_compat` compatibility flag staat nog aan.

---

## 4. Frontend: Testomgeving → main

```bash
git checkout main
git pull origin main
git merge Testomgeving
git push origin main
```

Vercel deployt `main` automatisch naar `scoutinghub.nl` / `www.scoutinghub.nl`.
Geen aparte actie nodig — de frontend routeert zelf automatisch naar de
productie-worker zodra het hostname `scoutinghub.nl` is (staat al in de code,
`TOERNOOI_API_BASE`-logica).

**Voor de merge:** controleer `git log Testomgeving ^main` op wat er precies
meekomt — dit is een grote hoeveelheid wijzigingen in één keer.

---

## 5. Firestore — gedeelde database, geen migratie nodig

Test en productie gebruiken **dezelfde** Firestore (`database-scouting`) —
er is dus geen aparte migratiestap. Wel opruimen vóór/na livegang:

- [ ] Testfeedback-documenten in collectie `feedback` (en bijbehorende
      `feedback_attachments`) die tijdens deze sessie zijn aangemaakt, verwijderen
      als ze er nog staan (eerder al 2x opgeruimd, controleren of er nieuwe bij zijn gekomen)
- [ ] Testadres `marcelsteeman1@gmail.com` in `access_requests`
      (nieuwsbrief-abonnee) — laten staan of verwijderen, jouw keuze
- [ ] Nieuwe collectie `newsletter_sends` (verzendhistorie) — bevat na deze
      sessie nog geen entries (tests loggen we bewust niet), dus niets op te ruimen

---

## 6. End-to-end testen ná de deploy (op productie, met een test-adres!)

- [ ] Inloggen als admin op scoutinghub.nl werkt nog gewoon
- [ ] Mailcentrum: inbox laden, bericht lezen (gelezen-status blijft staan),
      bericht verwijderen
- [ ] Nieuwsbrief: testmail versturen naar jezelf (**niet naar alle
      abonnees** bij de eerste test!) — check opmaak, afmeldlink, contact-
      knoppen (WhatsApp/mail/platform)
- [ ] AI: "alles invullen" en "AI-chat" werken (bevestigt dat
      `GEMINI_API_KEY` goed staat)
- [ ] Screenshot bij een update toevoegen en testen dat die meekomt in de mail
- [ ] Afmeldlink: eenmalig zelf testen dat die echt uit de lijst haalt

---

## 7. Bekende aandachtspunten / nog niet opgelost

- Browser Rendering-limiet (10 min/dag gratis) is **account-breed**, dus
  gedeeld tussen test- en productiegebruik van de screenshot-worker
- Gemini gratis-tier quota is ook account/project-breed — bij zwaar
  gecombineerd test+productie-gebruik kun je in theorie tegen de daglimiet
  aanlopen (zeer onwaarschijnlijk bij normaal gebruik)
- `browser-build/` (lokale esbuild-bundel voor de screenshot-worker) staat
  in de repo maar wordt niet automatisch gedeployed — bij wijzigingen aan
  die worker moet je opnieuw `npx esbuild ...` + curl-deploy draaien vanuit
  die map (zie eerdere sessie-log voor het exacte commando)
