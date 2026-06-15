# ScoutingHub — Projectstatus en beslislog

**Datum:** 8 juni 2026
**Versie/context:** sh-v279 t/m sh-v301

> ⚠️ **Geen secrets in dit document.** API-keys, tokens, service-account-JSON en
> Cloudflare Secrets worden alleen bij naam genoemd, nooit met hun waarde.

---

## 1. Doel van dit document

Dit document legt de actuele projectstatus, gemaakte beslissingen,
security- en privacy-afspraken, bekende workarounds en de roadmap van
ScoutingHub vast. Het dient als naslag/beslislog voor toekomstige
ontwikkeling, zodat keuzes en context niet verloren gaan.

---

## 2. Architectuur in het kort

- **Frontend:** GitHub Pages, single-page app (SPA) + PWA.
- **Backend:** Cloudflare Worker (`worker.js`).
- **Auth/data:** Firebase Authentication + Firestore.
- **Mail:** Resend (transactionele e-mails).
- **Hostingdomein:** `scoutinghub.nl` (custom domain op GitHub Pages).
- **Admin-PWA:** `/admin/` is een apart installeerbare PWA ("ScoutingHub Beheer",
  eigen manifest/icoon/service-worker, scope `/admin/`). Draait dezelfde
  `app.js`/`style.css`/`clubs-data.js` (via `<base href="/">`). Alleen
  beheerders mogen hierin inloggen (`window.SH_ADMIN_PWA`-gate); landt direct
  in de Beheerconsole zonder "Scout-app"-knop. Placeholder-iconen, later te
  vervangen.
- **Geen secrets in frontend of in de GitHub-repo.** Gevoelige waarden staan
  uitsluitend als Cloudflare Worker Secrets.

---

## 3. Belangrijke security- en privacyprincipes

- **uid-gescheiden data:** alles staat onder `users/{uid}/…`.
- **Scouts zien alleen eigen data.** Lezen via `canReadOwned` = eigenaar óf een
  actieve support-grant.
- **Admin = accountbeheer, geen standaard inzage in scoutdata.** Admin mag het
  root-doc `users/{uid}` (metadata: naam, e-mail, rol, createdAt) lezen voor het
  Beheer-dashboard, maar **niet** de scout-subcollecties.
- **Supporttoegang** is tijdelijk, read-only, alleen met toestemming van de
  doelgebruiker (die maakt zelf de `support_grant` aan) en auditbaar.
- **Geen secrets in de repo.** Cloudflare Secrets voor gevoelige waarden.

---

## 4. Account- en toegangsflow

1. Bezoeker vraagt toegang aan via een **publiek formulier**.
2. Aanvraag wordt opgeslagen in collectie **`access_requests`** (o.a. `email`,
   `name`, `club`, `message`, `functie`, `acceptedTerms`, `acceptedTermsAt`,
   `newsletterOptIn`, `status:'pending'`, `source:'public_request_form'`).
   - De Firestore-rule gebruikt `keys().hasOnly([...])`; bij **nieuwe velden moet
     die allowlist worden uitgebreid**, anders weigert de create (stille faal
     terwijl de mails wél worden verstuurd).
3. **Admin** keurt goed als `scout` of `coordinator`.
4. De Worker maakt een **Firebase Auth-account** aan en schrijft `users/{uid}`.
5. **users-doc** krijgt: `role`, `isActive:true`, `createdAt`, `createdBy`,
   `source:'admin_approved'`, `onboardingCompleted:false`.
6. **Rollen:** uitsluitend `scout` / `coordinator` / `admin`.
7. **Mails:** welkomstmail naar de gebruiker + admin-notificatie.

---

## 5. Mail- en DNS-status

- **Resend** verzorgt de transactionele e-mails.
- **DNS:** SPF / DKIM / DMARC zijn ingericht.
- **Spam/domeinreputatie:** een jong domein kan in het begin in de spam belanden;
  dit is een reputatiekwestie, los van de code.
- **Mailbox-routing:**
  - `admin@scoutinghub.nl` → auth, aanvragen, accountbeheer.
  - `contact@scoutinghub.nl` → support en contact (ook `reply_to`).
  - `info@scoutinghub.nl` → algemene informatie / nieuws.
  - `marcelsteeman1@gmail.com` → monitoring / forwarding.
- **Let op:** e-mail-**onderwerpregels** zijn platte tekst — gebruik echte tekens
  (—), geen HTML-entiteiten (`&#8212;` blijft anders letterlijk staan).

*(Geen API-keys of mailbox-wachtwoorden in dit document.)*

---

## 5b. Mailcentrum-inbox (IMAP, alleen-lezen)

- Beheer → Mailcentrum toont nu per mailbox (admin@/contact@/info@scoutinghub.nl)
  een **"Inbox laden"**-knop met de laatste ~10 berichten (van/onderwerp/datum,
  ongelezen gemarkeerd).
- **Werking:** de Worker (`/api/admin-mail-inbox`, admin-only) verbindt direct via
  **IMAP over TLS** (`cloudflare:sockets`) met de mailbox-provider, doet
  `LOGIN` → `SELECT INBOX` → `FETCH ... BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)]`
  → `LOGOUT`. `BODY.PEEK` zodat niets als gelezen wordt gemarkeerd; er wordt niets
  verstuurd, verwijderd of gewijzigd.
- **Vereiste Cloudflare Secrets** (nog instellen, anders meldt de knop "secret
  ontbreekt"):
  - `IMAP_PASS_ADMIN`, `IMAP_PASS_CONTACT`, `IMAP_PASS_INFO` — mailbox-wachtwoorden
    (gebruikersnaam = het mailadres zelf, bijv. `admin@scoutinghub.nl`).
  - Optioneel (hebben standaardwaarden): `IMAP_HOST` (default `imap.transip.email`),
    `IMAP_PORT` (default `993`), `IMAP_USER_ADMIN`/`IMAP_USER_CONTACT`/`IMAP_USER_INFO`
    (default = de mailadressen zelf).
- **Geen DNS/MX-wijzigingen, geen impact op bestaande mailflow** (Resend-verzending
  en TransIP-forwarding blijven ongewijzigd).

---

## 6. Admin-goedkeuring: probleem en oplossing

- **Probleem:** goedkeuren faalde met 403, door een combinatie van de
  HTTP-referrer-restrictie op de Firebase Browser-webkey, de Identity-Toolkit-call
  en de Firebase-Auth sign-up-instelling.
- **Werkende situatie:**
  - Browser key (publieke Firebase web key) → **Application restrictions: None**.
  - **API restrictions:** Cloud Firestore + Identity Toolkit + Token Service.
  - De Worker stuurt een `Referer`-header mee bij Google-API-calls.
  - Firebase Auth **"Enable create (sign-up)" staat AAN**.
- **Security-nuance:** sign-up AAN + key op None **werkt**, maar geeft een
  theoretisch vervuilingsrisico (publieke sign-up technisch mogelijk). Dit wordt
  in de roadmap weggenomen (zie §7).

---

## 7. Roadmap: Firebase Admin SDK / service-account

> **Update 13 juni 2026 (zie `SECURITY_ROADMAP.md`):** het service-account is er
> inmiddels (`SERVICE_ACCOUNT_JSON` Cloudflare Secret) en wordt al gebruikt voor
> account-creatie/hard-delete/(de)activeren en de Beheer-statusendpoints. De
> **resterende** stappen hieronder (recursieve data-delete/anonymize en "Enable
> sign-up" uitzetten) zijn bewust **UITGESTELD/OPTIONEEL** — pas oppakken bij
> concrete trigger (junk-accounts of een AVG-verwijderverzoek). Geen actie nodig
> tot dan.

- ~~**Account-creatie zonder publieke sign-up:** via Admin SDK / service-account in
  de Worker of een Cloud Function.~~ — service-account is aanwezig; "Enable
  sign-up" staat nog AAN (zie §6), uitzetten is uitgesteld.
- ~~**Echte Auth hard-delete:**~~ — **gereed**: `/api/delete-account` verwijdert het
  Firebase Auth-account via het service-account.
- **Recursieve data-delete / anonymize:** alle subcollecties onder `users/{uid}`
  + de bijbehorende `access_request` opruimen — **uitgesteld/optioneel**, zie
  `SECURITY_ROADMAP.md` §0/§3.
- **"Enable sign-up" weer UIT** → vervuilingsrisico verdwijnt — **uitgesteld**,
  hangt samen met bovenstaand punt.
- De **service-account-sleutel** staat als Cloudflare Secret (`SERVICE_ACCOUNT_JSON`)
  en hoort **nooit** in GitHub.

---

## 8. Deactiveren vs verwijderen

- **Deactiveren:** `isActive:false`. Gebruiker kan niet inloggen, **data blijft
  bewaard**, account kan later worden gereactiveerd.
- **Verwijderen (soft-delete, huidige fase):** `status:'deleted'`,
  `isActive:false`, `deletedAt`, `deletedBy`. De gebruiker verdwijnt uit het
  Beheer-overzicht. **Uitgangspunt:** gekoppelde persoonsgegevens/gebruikersdata
  worden verwijderd of geanonimiseerd volgens het verwijderbeleid.
- Beide acties gebeuren nu **client-side** via `updateDoc` (admin mag dit volgens
  de rules; zelfde patroon als rolwijziging). Admin-accounts en het eigen account
  zijn beschermd.
- **Echte recursieve hard-delete is nog NIET gebouwd** (aparte service-account-
  fase). Daarom **mag de UI geen misleidende "alles is definitief verwijderd"-
  claim tonen.**
- **Login-gate aanwezig** (zie hieronder): voorkomt dat een gedeactiveerd/
  verwijderd account na inloggen de app in komt.

**Login-gate:** in `onAuthStateChanged` wordt — vóór het laden van data — het
users-doc gelezen. Bij `status:'deleted'` of `isActive===false` wordt geen data
geladen, een passende melding getoond (verschilt voor gedeactiveerd vs verwijderd),
de gebruiker uitgelogd en teruggestuurd naar het loginscherm. Admins worden nooit
geblokkeerd; bij twijfel/leesfout wordt **niet** geblokkeerd (fail-open).

---

## 9. Privacy en voorwaarden

- **Publieke pagina's:** `privacy.html` en `voorwaarden.html` (dark theme, juni 2026).
- **Geen 404:** alle publieke links (landingsfooter, login-footer, aanvraag-
  checkbox) wijzen relatief naar deze bestanden.
- **Geen absolute claims** zoals "wij kunnen nooit data inzien". Wel: scoutinhoud
  wordt **niet standaard inzichtelijk** voor anderen en **niet** gebruikt voor
  verkoop, marketing, commerciële analyse of zelfstandige spelerbeoordeling.
- **EU-opslagregio wordt (nog) niet geclaimd** zolang dat niet bevestigd is.
- **Gebruiker** is verantwoordelijk voor juistheid, relevantie, zorgvuldigheid en
  rechtmatigheid van ingevoerde scoutinginhoud; **ScoutingHub** is verantwoordelijk
  voor platformbeveiliging, transparantie, toegangscontrole en correcte verwerking.
- Teksten zijn praktisch bedoeld, **geen juridisch advies** — laat ze juridisch
  controleren vóór formeel gebruik.

---

## 10. Landingspagina

- **PWA vs browser:** browserbezoekers zien de publieke landingspagina; een
  geïnstalleerde PWA (standalone) slaat de landing over en gaat direct naar
  login/dashboard.
- **Loader-flash opgelost:** geen "Verbinden met cloud…" meer vóór de landing voor
  browserbezoekers (inline script toont de landing direct).
- **Manifest:** `manifest.webmanifest` heeft relatieve `start_url`/`scope` (`"./"`)
  en geen github.io-verwijzing. Een eventuele URL-flash naar github.io komt van
  oude cache/installatie/snelkoppeling, niet uit de code — PWA opnieuw installeren
  lost dat op.
- **Media-richtlijnen:** scherp, goed gecropt (sidebar + "DEMO-OMGEVING"-balk
  volledig weg, geen sliver), **geen placeholder** "Screenshot — binnenkort".
- **Screenshots vs MP4:** **geen GIF's**. MP4 alleen als **content-only**
  aangeleverd én verifieerbaar; in de buildomgeving is geen video-tooling
  beschikbaar, dus CSS-gecropte full-window MP4's gaven een zwarte balk en zijn
  vervangen door **scherpe screenshots** (Pillow-crop op native resolutie, visueel
  geverifieerd).
- **4-stappen-sectie** is vervangen door een **compacte icoon-flow**
  (Plan → Scout → Rapporteer → Deel) i.p.v. grote kaarten met screenshots.

---

## 11. Handleiding

`handleiding.html` is **uitsluitend voor scouts/gebruikers**:

- **GEEN** admin-sectie.
- **GEEN** uitleg over automatische mailflows.
- **GEEN** beheer/goedkeuren/verwijderen/admin-onderwerpen.
- **WEL** gebruikersgericht: toegang aanvragen, eerste keer inloggen ("Wachtwoord
  vergeten"), scoutingflows, toernooi-module, PWA/offline gebruik.

---

## 12. Belangrijke versies/batches

> Alleen wat met zekerheid bekend is.

| Versie | Inhoud |
|---|---|
| sh-v279 | MatchLiveForm live |
| sh-v285 | Onboarding |
| sh-v286 | Dashboard-filtering |
| sh-v287 | Chips / prefill / omzetten |
| sh-v288–v290 | Wedstrijden-tab reset |
| sh-v293 | Beheer: aanmaakdatum + (de)activeren/verwijderen |
| sh-v294 | Landingspagina redesign |
| sh-v295 | Landingspagina media (screenshots) |
| sh-v296 | Landingspagina video (CSS-crop — later afgekeurd) |
| sh-v297 | Delete/deactivate client-side |
| sh-v298 | Login-gate |
| sh-v299 | Privacy/voorwaarden + gate-teksten + delete-tekst |
| sh-v300 | Loader-flash + scherpere screenshots (tussenslag) |
| sh-v301 | Scherpe screenshots i.p.v. video + compacte flow |

---

## 13. Openstaande punten / roadmap

- [x] Service-account / Admin SDK aanwezig (account-creatie, hard-delete, (de)activeren).
- [x] `/api/admin-status` en `/api/admin-mail-test` endpoints gebouwd (Beheer:
      Instellingen + Mailcentrum).
- [x] `/api/admin-mail-inbox` (IMAP, alleen-lezen) gebouwd — zie §5b. Werkt pas
      zodra `IMAP_PASS_ADMIN`/`IMAP_PASS_CONTACT`/`IMAP_PASS_INFO` secrets gezet zijn.
- [x] Support "volledige bediening" (E4d) uitgebreid: alle 14 views (navigeren +
      aanwijzen) en 4 formulieren (rapport/contact/tip/rit) voor openen/voorstellen,
      met opslag-bevestiging voor rapport/rit/tip. Verwijderen/account/instellingen/
      mail/admin blijven uitgesloten.
- [ ] Recursieve data-delete/anonymize-fase — **uitgesteld/optioneel**, zie
      `SECURITY_ROADMAP.md` §0/§3 (alleen bij concrete trigger).
- [ ] Firebase Auth "Enable sign-up" weer **uit** — **uitgesteld**, hangt samen
      met vorig punt.
- [ ] Landingspagina live testen op desktop én mobiel (geen horizontale scroll,
      carousel-hoogte, entrance).
- [ ] PWA/cache/manifest testen (oude installatie verwijderen + opnieuw installeren).
- [ ] Handleiding actualiseren zodra de landing definitief is.
- [ ] Eventueel MP4-video's opnieuw aanleveren **content-only** (sidebar + demo-balk
      al eruit) als eyecatcher.

---

## 14. Wat NIET in GitHub bewaren

- API-keywaarden (Google/Firebase Browser key).
- Resend-key, Gemini-key, Tournify-key.
- Firebase service-account-JSON.
- Cloudflare Secrets (in welke vorm dan ook).
- Private tokens / id-tokens.
- Mailbox-wachtwoorden.
- Ruwe logs met tokens of persoonsgegevens.
- Testdata met echte persoonsgegevens (tenzij geanonimiseerd en functioneel nodig).

---

## 15. Wat WEL in GitHub bewaren

- Dit statusdocument (`PROJECT_STATUS.md`).
- `privacy.html`, `voorwaarden.html`, `handleiding.html`.
- README / DEPLOY-docs **zonder secrets**.
- Deploychecklists **zonder secrets**.
- Voorbeeldconfig met **placeholders** (bijv. `.env.example`).
- Changelog / release notes.
- Security/roadmap-document **zonder keys**.
- Publieke assets (scherpe screenshots, iconen).
- `firestore.rules`.
- `worker.js` **zonder secrets** (waarden uit `env`/Secrets).
- `app.js`, `index.html`, `style.css`, `sw.js`.

---

*Dit document bevat bewust geen sleutelwaarden of persoonsgegevens. Werk het bij
bij elke significante beslissing of versie-bump.*
