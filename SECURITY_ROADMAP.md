# ScoutingHub — Security roadmap (service-account)

> ⚠️ **Geen keywaarden in dit document of in de repo.** Een service-account-sleutel
> is een Cloudflare Secret en hoort **nooit** in GitHub.

Dit document beschrijft waarom en hoe ScoutingHub naar een Firebase Admin SDK /
service-account-aanpak migreert, en welke beveiligingswinst dat oplevert.

---

## 0. Status & besluit (13 juni 2026) — UITGESTELD, OPTIONEEL

**Besluit:** het service-account is **niet vereist** voor de gewenste werkwijze en is
bewust **uitgesteld**. De huidige situatie blijft staan.

**Reden / context:**
- Het **aanvraagformulier** (iedereen mag toegang *aanvragen*, de eigenaar beslist) staat
  hier **los** van — dat blijft bewust open en werkt zonder service-account.
- Het service-account lost twee zaken op die nu géén blokkade vormen:
  1. Het sluiten van de Firebase "Enable sign-up"-schakelaar (het kleine, theoretische
     risico van rommel-Auth-accounts die buiten het formulier om worden aangemaakt — zo'n
     account heeft geen `users`-doc/rol/goedkeuring en komt niet zinvol in de app).
  2. Échte permanente verwijdering (hard-delete) i.p.v. de huidige soft-delete + login-gate.
- Voor de huidige fase zijn beide acceptabel.

**Wanneer alsnog oppakken (triggers):**
- Er ontstaat daadwerkelijk last van junk-/rommel-accounts in de Auth-lijst, **of**
- Er moet een AVG-"verwijder al mijn gegevens"-verzoek waterdicht permanent worden afgehandeld.

Tot een van die triggers zich voordoet: **geen actie nodig.** De rest van dit document
beschrijft de uitvoering voor als/zodra dat moment komt.

---

## 1. Waarom nodig?

De huidige account-flows draaien op de **publieke Firebase web-key** (Browser key)
plus de instelling **Firebase Auth → "Enable create (sign-up)" = AAN**. Dat werkt,
maar:

- Publieke sign-up is technisch mogelijk → **theoretisch vervuilingsrisico**
  (ongewenste accounts).
- Een **ander** Auth-account verwijderen kan niet met alleen de web-key.
- Scout-subcollecties kunnen niet client-side worden opgeruimd, omdat een admin ze
  volgens de rules niet mag **listen** (geen blanket admin-read — bewust).

Een **service-account met admin-rechten in de Worker / een Cloud Function** lost
dit op zonder het strikte isolatiemodel te verzwakken.

---

## 2. Account-creatie zonder publieke sign-up

- Account-aanmaak verloopt via een **server-side Admin-call** (Admin SDK /
  service-account), niet via de publieke `accounts:signUp`.
- De Worker blijft de admin-identiteit verifiëren vóór het aanmaken (zoals nu).
- **Resultaat:** "Enable create (sign-up)" kan daarna **uit** (zie §5).

---

## 3. Echte hard-delete / anonymize

Bij **verwijderen** van een account moet, met admin-rechten:

1. het **Firebase Auth-account** worden verwijderd;
2. alle **subcollecties** onder `users/{uid}/…` recursief worden verwijderd of
   geanonimiseerd (players, match_reports, live_match_notes, report_drafts,
   programma, analyses, contacts, tips, ritten, wedstrijden, toernooien,
   tournaments + hun subcollecties);
3. de bijbehorende **`access_request`** worden opgeschoond/geanonimiseerd.

Dit kan **niet** client-side (admin mag subcollecties niet listen). Het hoort in
een server-side fase met service-account-rechten, met een audit-record van de
verwijdering. Tot die fase er is, blijft de UI bij "verwijderen" een **soft-delete
+ login-gate** en toont géén misleidende "alles is definitief verwijderd"-claim.

---

## 4. Privacy-consistentie

Zodra de hard-delete/anonymize-fase live is, sluit het verwijderbeleid in
`privacy.html` en `voorwaarden.html` volledig aan op de techniek. Tot die tijd
blijft de formulering "verwijderen of anonimiseren **volgens het verwijderbeleid**"
correct (geen overclaim).

---

## 5. Sign-up later weer UIT

Na ingebruikname van de service-account-aanpak:

- [ ] Account-creatie loopt volledig via de server-side Admin-call.
- [ ] Zet Firebase Auth **"Enable create (sign-up)" weer UIT**.
- [ ] (Optioneel) Browser-key-restricties opnieuw aanscherpen waar mogelijk,
      zonder de werkende flows te breken.
- [ ] Resultaat: het vervuilingsrisico van publieke sign-up is weg.

---

## 6. Service-account alleen als secret

- De service-account-JSON wordt een **Cloudflare Worker Secret**
  (placeholder-naam: `SERVICE_ACCOUNT_JSON`).
- **Nooit** in de repo, nooit in client-code, nooit in logs.
- In de Worker wordt er een kortlevende OAuth2-token mee gemaakt voor de
  Admin-calls; tokens worden niet gelogd of teruggegeven aan de client.
- Bij verdenking van lekken: **sleutel roteren** in Google Cloud + de Cloudflare
  Secret bijwerken.

---

## 7. Volgorde van uitrol (voorstel)

1. Service-account aanmaken in Google Cloud (juiste, minimale rollen).
2. `SERVICE_ACCOUNT_JSON` als Cloudflare Secret toevoegen.
3. Worker-endpoint voor server-side account-creatie (Admin) bouwen + testen.
4. Worker-endpoint voor hard-delete/anonymize bouwen + testen op een
   wegwerp-testaccount.
5. App-flows (Beheer) omzetten naar de nieuwe endpoints.
6. "Enable sign-up" uitzetten.
7. Privacy/voorwaarden definitief afstemmen op de gerealiseerde techniek.
