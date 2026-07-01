# ScoutingHub — Bestaansrecht, licentiemodel en prijsindicatie

> Dit document is een inschatting, geen marktonderzoek met externe bronnen.
> Cijfers zijn onderbouwde aannames op basis van wat over de Nederlandse
> amateurvoetbalmarkt algemeen bekend is, niet uit een live databron
> opgehaald. Waar een getal een aanname is, staat dat er expliciet bij.
> Gebruik dit als startpunt voor een beslissing, niet als eindconclusie.

Laatst geschreven: 2026-07-02.

---

## 1. Samenvatting

ScoutingHub lost een reëel, herkenbaar probleem op (spelersvolgend scouten
binnen jeugdopleidingen is nu vooral appjes, Excel en losse WhatsApp-berichten)
voor een markt die groot genoeg is om een nichebedrijf op te bouwen, maar te
versnipperd en prijsgevoelig is om snel te schalen. Er is bestaansrecht,
vooral bij **regionale opleidingen, satellietclubs van BVO's, en
scoutingnetwerken/makelaars** eerder dan bij de gemiddelde amateurclub zelf.
Een laag-instap, per-team of per-club abonnement met een gratis/beperkte
laag is de meest realistische route. Realistische omzet bij bescheiden
adoptie (50-150 betalende clubs/teams) ligt in de orde van **€15.000-
€60.000 ARR** na 12-18 maanden — genoeg om als bijverdienste/side-project
door te ontwikkelen, niet genoeg om zonder externe investering een fulltime
salaris uit te halen, tenzij het opschaalt richting BVO's/regionale
netwerken of een aangrenzende markt (bijv. andere sporten, of
volwassenenscouting).

---

## 2. Wat ScoutingHub nu is

Op basis van de huidige featureset in de codebase:

- Spelersdatabase met carrièreverloop over meerdere seizoenen/clubs
- Wedstrijdrapporten en losse observaties (formeel vs. snel)
- Programma/planning van wedstrijden en toernooien (incl. Tournify-import)
- Rittenregistratie met automatische kilometerberekening (declaraties)
- "Getipte spelers" — een lichte scouting-pipeline
- Analysemodules (elftallen vergelijken, vormtrend, pitch-view)
- Rolgebaseerde toegang (scout, coördinator, hoofdcoördinator, admin)
- PWA — werkt offline-vriendelijk, installeerbaar, geen appstore nodig

Dat is functioneel een **compleet, gespecialiseerd scouting-CRM voor
jeugdopleidingen**, niet een simpel prikbord-appje. Dat is een sterk
uitgangspunt: veel concurrentie in de amateursport-hoek is generieke
teamplanning-software (bijv. TeamGoo, Sportlink-achtige tools) die scouting
niet als kernfunctie heeft. ScoutingHub's smalle focus is tegelijk kracht
(diepgang) en risico (kleinere markt dan "alles-in-1 club-app").

---

## 3. Marktcontext (schatting, geen harde bron)

- Nederland heeft circa 3.000-3.400 aangesloten amateurvoetbalclubs bij de
  KNVB. Een fractie daarvan (schatting: 300-600) heeft een jeugdopleiding
  die serieus genoeg scout om hiervoor te betalen — meestal grotere clubs
  (2e/3e klasse en hoger, of BVO-satellieten/regionale trainingscentra).
- Scouting als functie zit vaak niet bij de club zelf, maar bij
  **individuele scouts/makelaars** en **regionale
  jeugdopleidingsnetwerken** (bijv. rond een BVO). Die groep is kleiner in
  aantal maar heeft een duidelijkere betalingsbereidheid, omdat scouting
  hun kernactiviteit is in plaats van een bijzaak naast trainen.
- Amateurclubs zijn structureel prijsgevoelig: budget komt vaak uit
  vrijwilligersbijdragen/sponsoring, niet uit een IT-budget. Een tool van
  meer dan een paar tientjes per maand per team is voor de gemiddelde
  amateurclub al een drempel, tenzij een sponsor het betaalt.
- Internationaal (België, Duitsland, Scandinavië) bestaat een vergelijkbare
  markt, maar taal/lokalisatie en lokale KNVB-achtige koppelingen
  (Tournify-import is hier al een concreet voorbeeld) maken uitbreiding
  niet triviaal.

**Conclusie markt:** een reële, maar smalle niche. Genoeg voor een
bijverdienste/klein bedrijf op basis van 50-300 betalende klanten
(club/team/scoutingnetwerk), niet voor snelle VC-achtige groei zonder een
duidelijk aangrenzend product.

---

## 4. Waarom bestaansrecht: de kernwaarde

1. **Tijdsbesparing die aantoonbaar is** — automatische kilometer-
   berekening voor declaraties en gestructureerde spelersrapporten
   vervangen handwerk dat scouts nu in Excel/WhatsApp doen. Dat is een
   concreet, uit te leggen "dit bespaart X uur per maand"-verhaal, wat
   nodig is om iemand een abonnement te laten betalen.
2. **Data blijft bij de club/scout, niet versnipperd over app-groepen** —
   spelersvolgend over seizoenen heen is precies het soort continuïteit die
   WhatsApp/Excel structureel niet biedt (mensen vertrekken, chats raken
   kwijt, spreadsheets raken verouderd).
3. **Laag technische instap** — PWA, geen appstore-installatie nodig, werkt
   op een telefoon langs de lijn. Dat verlaagt de adoptiedrempel voor een
   doelgroep (vrijwillige scouts, 40-65 jaar gemiddeld) die niet per se
   technisch onderlegd is.
4. **Risico:** de kernwaarde is grotendeels "georganiseerde data-invoer".
   Dat is waardevol maar niet moeilijk na te bouwen door een concurrent met
   meer budget. Het echte verdedigbare voordeel op langere termijn zit in
   (a) data die opbouwt over tijd (switching cost) en (b) diepte in
   scouting-specifieke workflows die generieke teamapps niet hebben.

---

## 5. Licentiemodel — voorstel

Een **freemium, per-team/per-club SaaS-abonnement** past het beste bij deze
markt: lage instapdrempel voor adoptie, betaald tier zodra een club meer
dan een handjevol scouts/spelers heeft.

### Voorgestelde tiers

| Tier | Voor wie | Bevat | Richtprijs |
|---|---|---|---|
| **Tester / vroege gebruiker** | Iedereen die nu al meedraait in de testfase | Alles uit de Club-tier (dus de volledige functieset), zolang het platform in test-/bètafase zit | €0 tijdens de testfase; daarna blijvend 50% korting op de tier die van toepassing wordt, als dank voor het testen en de feedback die het product gevormd heeft |
| **Gratis** | Losse scout die wil uitproberen, geen betalende tester | Spelersdatabase tot ~25 spelers, basisrapportage, geen ritten/analyse-modules | €0 |
| **Solo Scout** | Eén individuele scout of makelaar, niet gebonden aan één club (bijv. volgt spelers bij meerdere verenigingen) | Onbeperkt spelers, volledige rapportage/observaties, ritten, "getipte spelers"-pipeline — geen teamstructuur nodig | €7-12 / maand |
| **Team** | Eén jeugdteam/leeftijdsgroep binnen een club | Onbeperkt spelers binnen dat team, rapporten, observaties, ritten, programma | €9-15 / maand per team |
| **Club / Organisatie** | Hele jeugdopleiding met hoofdjeugdopleiding, coördinatoren en meerdere scouts | Alle teams onder één club, rolbeheer (scout/coördinator/hoofdcoördinator), toernooien, analysemodules, prioriteitssupport | Vanaf €49 / maand (tot 5 actieve scouts/coördinatoren), daarna +€8 / maand per extra scout of coördinator |
| **Netwerk/Regio** | Scoutingnetwerk rond een BVO, meerdere clubs | Alles van Club + overkoepelend dashboard over meerdere clubs, export/rapportage naar de BVO | Maatwerk, richting €150-400 / maand |

Redenen voor deze opzet:

- **Testers krijgen bewust een blijvend voordeel, geen tijdelijke proefperiode.**
  Zij hebben het product mede gevormd via feedback nog voordat er een
  betaald model was — een eenmalige gratis maand zou dat niet recht doen.
  Een blijvende korting (in plaats van "gratis voor altijd") houdt het
  financieel houdbaar zodra het aantal testers groeit, maar erkent wel hun
  vroege bijdrage.
- **Solo Scout is losgekoppeld van Team**, omdat een zelfstandige scout of
  makelaar geen club/team-structuur heeft om spelers aan op te hangen —
  die groep heeft wel behoefte aan de volledige rapportage/tips-functies,
  maar zou bij de Team-tier onnodig vastzitten aan een teamconcept dat niet
  op hen van toepassing is.
- **Club-tier schaalt met het aantal scouts/coördinatoren, niet met het
  aantal teams.** Bij een hoofdjeugdopleiding is de belasting op het
  platform (rapporten, observaties, beheer) evenredig met hoeveel mensen
  er actief scouten en coördineren, niet met hoeveel losse teams er zijn —
  een organisatie met 3 coördinatoren en 10 scouts over 6 teams gebruikt
  het platform intensiever dan een club met 10 teams maar 2 actieve scouts.
- **Jaarlijks factureren met korting (bijv. 2 maanden gratis bij
  jaarbetaling)** past goed bij hoe verenigingen begroten (seizoen-
  gebonden, vaak via de penningmeester eenmalig per jaar geregeld) en
  verlaagt churn/administratie voor jou.
- **Netwerk-tier is de meest kansrijke groeirichting** — een BVO of
  regionaal opleidingsnetwerk heeft zowel budget als een duidelijke reden
  (talentherkenning is hun corebusiness) om hiervoor te betalen boven wat
  een individuele amateurclub ooit zou doen.

### Alternatief dat ik afraad, met reden

- **Eenmalige licentie (koop it once)**: past niet bij een cloud/Firebase-
  gebaseerd product met doorlopende hostingkosten en onderhoud — je bouwt
  dan geen herhaalinkomsten op terwijl de kosten wel doorlopen.
- **Puur advertentiemodel**: ongepast voor een tool met gevoelige
  jeugdspelersdata; ook een slechte fit met de bestaande privacy-toon van
  het platform (CLAUDE.md/app noemt al expliciet dat scoutdata privé
  blijft).

---

## 6. Omzetscenario's (schattingen, geen voorspelling met zekerheid)

Uitgangspunt: alleen betaalde Solo Scout-, Team- en Club-tiers meegerekend.
Gratis-tier en tester-korting dragen niet (volledig) bij aan omzet maar wel
aan naamsbekendheid/instroom richting betaalde tiers.

| Scenario | Betalende eenheden na 12-18 mnd | Gem. prijs/mnd | Jaaromzet (ARR) |
|---|---|---|---|
| **Conservatief** | 15 solo scouts + 30 teams + 5 clubs | €9 / €12 / €70 | ≈ €10.100 |
| **Realistisch** | 40 solo scouts + 80 teams + 20 clubs | €9 / €12 / €70 | ≈ €33.100 |
| **Optimistisch** | 70 solo scouts + 150 teams + 40 clubs + 2 netwerk-deals | €10 / €13 / €75 + €250 | ≈ €71.400 |

Interpretatie: zelfs het optimistische scenario is geen fulltime-salaris-
vervangend bedrag in Nederland zonder aanvullende inkomsten. Het is wel een
gezond bedrag voor een side-project dat zichzelf ruimschoots
onderhoudt (hosting/tools kosten hierbij, zie hieronder, een fractie
hiervan) en potentieel doorgroeit als er tijd/marketing in gestoken wordt
richting de Netwerk-tier.

---

## 7. Kostenkant (grofweg, huidige stack)

Bij de schaal uit bovenstaande scenario's blijven de technische kosten
laag, omdat de huidige stack grotendeels op gratis/pay-as-you-go tiers
draait:

- **Cloudflare Workers**: gratis tier volstaat ruim tot honderdduizenden
  requests/maand; Workers AI gratis tier (10.000 neurons/dag) is ruim
  voldoende voor AI-gebruik op deze schaal.
- **Firebase/Firestore**: gratis Spark-tier houdt langer stand dan
  verwacht bij honderden clubs met gematigd gebruik, maar bij groei richting
  honderden actieve teams met dagelijks gebruik is een stap naar het
  betaalde Blaze-plan realistisch (richting €10-50/maand bij deze schaal,
  sterk afhankelijk van leesfrequentie).
- **Vercel hosting**: gratis Hobby-tier is voor een niet-commerciële/kleine
  SaaS in de praktijk vaak niet toegestaan zodra er omzet mee gemaakt
  wordt — reken op het Pro-plan (~€20/maand) zodra er echt betalende
  klanten zijn.
- **Resend (e-mail)**: gratis tier (3.000 mails/maand) is ruim genoeg tot
  in het realistische scenario; bij het optimistische scenario mogelijk
  een klein betaald tier nodig (~€20/maand).
- **Betalingen verwerken** (bijv. Mollie/Stripe voor iDEAL/factuur): geen
  vaste kosten, wel transactiekosten (~1-2% + kleine vaste fee per
  transactie).

**Samengevat:** bij de realistische schaal blijven totale technische
kosten waarschijnlijk onder €100/maand — de marge op de hierboven genoemde
omzetscenario's is dus hoog. Het beperkende element is niet
infrastructuurkosten, het is **tijd** (support, doorontwikkeling,
sales/onboarding bij clubs) en **acquisitie** (hoe kom je aan de eerste
30-80 betalende teams).

---

## 8. Grootste risico's

1. **Acquisitiekanaal ontbreekt nog.** Een goed product zonder ingang bij
   clubbesturen/BVO-jeugdopleidingen blijft ongebruikt. De meest kansrijke
   route is waarschijnlijk 1-op-1 via bestaande contacten in het
   amateurvoetbal (testers/netwerk), niet generieke online marketing.
2. **Seizoensgebondenheid.** Verenigingen begroten en beslissen vaak rond
   de zomerstop (nieuw seizoen) — verkoopmomentum concentreert zich in een
   paar maanden per jaar.
3. **Eén-persoons-onderhoudslast.** Support, bugfixes en doorontwikkeling
   leunen nu op één persoon; bij groei naar honderden betalende klanten
   wordt supportvolume een reëel tijdsbeslag.
4. **Concurrentierisico van generieke club-apps** die scouting als los
   modul toevoegen — verdedigbaar door dieper te gaan in scouting-
   specifieke workflows (rapporten, ritten, carrièreverloop) dan een
   generieke speler ooit zal doen.
5. **Privacy/AVG bij minderjarigen.** Spelersdata van jeugdspelers valt
   onder verscherpte AVG-eisen. Een licentiemodel voor een betaald product
   vraagt om een expliciete verwerkersovereenkomst met clubs — dit is nu
   nog geen onderdeel van het platform en moet worden toegevoegd voordat er
   commercieel verkocht wordt.

---

## 9. Advies

- **Bestaansrecht: ja, als bijverdienste/nichebedrijf**, niet als
  snelgroeiend platform zonder extra investering.
- **Start met Team + Club-tiers zoals hierboven**, houd het licentiemodel
  simpel (twee prijzen, geen ingewikkelde add-ons) voor de eerste 12
  maanden — complexiteit in prijzen kost meer verkooptijd dan het oplevert
  bij deze schaal.
- **Richt acquisitie eerst op het eigen netwerk** (huidige testers, hun
  clubs, BVO-contacten) in plaats van brede marketing — bij deze
  marktomvang is warme introductie effectiever dan advertenties.
- **Regel de AVG-verwerkersovereenkomst voordat er daadwerkelijk voor
  betaald wordt** — dit is geen "later oplossen"-punt zodra er sprake is
  van een commerciële relatie met een club.
- **Zie de Netwerk/Regio-tier als de eigenlijke groeirichting** op
  middellange termijn: een handvol BVO-achtige contracten kan meer omzet
  opleveren dan honderden losse teamabonnementen, met minder supportlast
  per euro omzet.
