# ScoutingHub — Deploy- en releasechecklist

> ⚠️ **Geen secrets in dit document of in de repo.** API-keys, tokens en
> service-account-JSON staan uitsluitend als Cloudflare Worker Secrets.

Dit document beschrijft hoe je een nieuwe versie van ScoutingHub veilig uitrolt.
Doorloop de checklists in volgorde. Niet alle onderdelen zijn elke release nodig
(zie "Wanneer nodig" per blok).

---

## 0. Vooraf — wat is er gewijzigd?

| Gewijzigd bestand | Actie nodig |
|---|---|
| `index.html`, `app.js`, `style.css`, assets | GitHub Pages upload + **SW-bump** |
| `sw.js` (`CACHE_VERSION`) | GitHub Pages upload |
| `worker.js` | **Cloudflare Worker deploy** |
| `firestore.rules` | **Firestore rules publish** |
| `manifest.webmanifest`, iconen | GitHub Pages upload |
| alleen docs (`/docs`, README) | geen app-impact |

> Wijzig je `app.js` / `index.html` / `style.css` / assets, **bump dan altijd**
> `CACHE_VERSION` in `sw.js` (zie blok 4), anders blijven gebruikers op de oude
> versie hangen.

---

## 1. GitHub Pages — upload/checklist

- [ ] Controleer dat **geen** secrets in de te uploaden bestanden staan
      (zie blok 5 — secret-scan).
- [ ] Upload de gewijzigde bestanden naar de repo (`main`):
      `index.html`, `app.js`, `style.css`, `sw.js`, en gewijzigde assets/pagina's
      (`privacy.html`, `voorwaarden.html`, `handleiding.html`).
- [ ] Upload nieuwe/gewijzigde **media** (scherpe screenshots). Verwijder media
      die niet meer gerefereerd wordt (oude GIF's, ongebruikte MP4's).
- [ ] Controleer dat `manifest.webmanifest` live staat met relatieve
      `start_url`/`scope` (`"./"`) — geen absolute github.io-URL.
- [ ] Controleer dat `CNAME` (`scoutinghub.nl`) intact is en "Enforce HTTPS" aan
      staat in de Pages-instellingen.
- [ ] Wacht tot de Pages-build groen is.
- [ ] Open **https://www.scoutinghub.nl/** (niet via een oude github.io-link) en
      controleer: landingspagina laadt, geen "Verbinden met cloud…"-flash in de
      browser, privacy/voorwaarden geven geen 404.

---

## 2. Cloudflare Worker — deploy checklist

> Alleen nodig als `worker.js` is gewijzigd (bijv. mail, account-creatie,
> endpoints).

- [ ] Controleer dat `worker.js` **geen** hardcoded keys bevat — alle gevoelige
      waarden komen uit `env` (Cloudflare Secrets).
- [ ] Controleer dat de benodigde **Secrets** bestaan in de Worker-omgeving
      (alleen namen, geen waarden hier): `GOOGLE_API_KEY`, `RESEND_API_KEY`,
      `GEMINI_API_KEY`, `TOURNIFY_API_KEY` (en later `SERVICE_ACCOUNT_JSON`).
- [ ] Deploy de Worker (dashboard "Quick edit"/"Deploy", of `wrangler deploy`).
- [ ] Rooktest de endpoints (zonder gevoelige data te loggen):
      `GET /` (status), `POST /api/request-access`, `POST /api/create-account`,
      `POST /api/gemini`, `POST /api/support-notify`.
- [ ] Controleer dat een nieuwe **toegangsaanvraag** een doc in `access_requests`
      aanmaakt én de mails verzendt.

---

## 3. Firestore rules — publish checklist

> Alleen nodig als `firestore.rules` is gewijzigd.

- [ ] Open Firebase Console → Firestore → **Rules**.
- [ ] Plak de inhoud van `firestore.rules`.
- [ ] Gebruik de **Rules Playground** voor een snelle sanity-check (eigen data
      lezen = toegestaan; andermans subcollectie lezen als niet-eigenaar =
      geweigerd; admin mag `users/{uid}` root lezen).
- [ ] **Publish**.
- [ ] Let op de `access_requests`-create-rule: de `keys().hasOnly([...])`-lijst
      moet **exact** overeenkomen met de velden die de Worker/app schrijft. Voeg
      je een veld toe aan het aanvraagformulier, breid dan de allowlist uit —
      anders weigert de create stil (mails gaan wél, doc wordt niet opgeslagen).

---

## 4. Service Worker — bump / cache / PWA-herinstall

- [ ] Verhoog `CACHE_VERSION` in `sw.js` (bijv. `sh-v301-...` → `sh-v302-...`)
      bij elke wijziging aan `index.html` / `app.js` / `style.css` / assets.
- [ ] Controleer dat nieuwe te-precachen bestanden in `CORE_ASSETS` staan
      (bijv. `privacy.html`, `voorwaarden.html`).
- [ ] Na upload: open de site in de browser → de nieuwe SW installeert en activeert
      (network-first voor HTML/JS/CSS rolt updates direct uit).
- [ ] **PWA-test:** verwijder de geïnstalleerde PWA en installeer opnieuw om oude
      manifest-/SW-cache uit te sluiten. Controleer daarna dat de PWA direct naar
      login/dashboard gaat (landing wordt overgeslagen) en er geen oude URL flitst.

---

## 5. Secret-scan vóór elke push

Voer een snelle scan uit op de te uploaden bestanden. Niets mag matchen:

```
grep -rEi "AIza[0-9A-Za-z_-]{10}|re_[0-9A-Za-z]{10}|-----BEGIN|private_key|service_account|Bearer [A-Za-z0-9]" .
```

- [ ] Geen API-keywaarden, tokens of service-account-JSON in de repo.
- [ ] `.env` staat in `.gitignore` (alleen `.env.example` met placeholders mag in
      de repo).
- [ ] Geen ruwe logs met tokens of persoonsgegevens.

---

## 6. Post-deploy controle

- [ ] Landingspagina desktop + mobiel (geen horizontale scroll, media scherp).
- [ ] Login werkt; gedeactiveerd/verwijderd testaccount komt **niet** binnen
      (login-gate).
- [ ] Privacy/voorwaarden links werken (geen 404).
- [ ] Aanvraag → goedkeuren → welkomstmail → eerste login ("Wachtwoord vergeten").
