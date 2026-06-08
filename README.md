# ScoutingHub

Scoutingplatform voor het Nederlandse jeugdvoetbal. PWA/SPA op GitHub Pages
(domein **scoutinghub.nl**), met een Cloudflare Worker als backend en Firebase
Authentication + Firestore voor auth en data. Transactionele e-mails via Resend.

## Documentatie

- **Projectstatus & beslislog:** [`docs/PROJECT_STATUS_2026-06-08.md`](docs/PROJECT_STATUS_2026-06-08.md)
- **Deploy- en releasechecklist:** [`docs/DEPLOY.md`](docs/DEPLOY.md)
- **Security roadmap (service-account):** [`docs/SECURITY_ROADMAP.md`](docs/SECURITY_ROADMAP.md)
- **Voorbeeldconfig (placeholders):** [`.env.example`](.env.example)

## Publieke pagina's

- `index.html` — app + landingspagina
- `privacy.html` — privacyverklaring
- `voorwaarden.html` — algemene voorwaarden
- `handleiding.html` — gebruikershandleiding (alleen voor scouts/gebruikers)

## ⚠️ Secrets-beleid

**Zet nooit secrets in deze repository.** Geen API-keys, tokens, Resend-key,
Gemini-key, Tournify-key of Firebase service-account-JSON in GitHub.

- Gevoelige waarden horen uitsluitend als **Cloudflare Worker Secrets**.
- Alleen `.env.example` met **placeholders** mag in de repo; een echte `.env`
  hoort in `.gitignore`.
- `worker.js` leest gevoelige waarden uit `env` — er staan geen waarden in de code.
- Raakt een sleutel ooit publiek? **Roteer hem** direct en werk de Secret bij.
