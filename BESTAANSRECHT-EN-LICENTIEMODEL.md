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
vooral bij **individuele/vrijwillige scouts, scouts binnen een BVO die hun
eigen dataportabiliteit willen, managementbureaus/zaakwaarnemers, hoger
spelende amateurclubs en regionale opleidingsnetwerken** eerder dan bij de
gemiddelde amateurclub zelf. Een laag-instap, per-scout of per-organisatie
abonnement met een gratis/beperkte laag is de meest realistische route.
Realistische omzet bij bescheiden adoptie ligt in de orde van **€11.500-
€98.000 ARR** na 12-18 maanden — genoeg om als bijverdienste/side-project
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
- Een specifieke, sterke doelgroep binnen die groep: **scouts die bij een
  BVO werken maar hun eigen, opgebouwde spelersdatabase kwijtraken zodra ze
  weggaan** — hun scoutinggeschiedenis hoort bij de club, niet bij hen
  persoonlijk. Een onafhankelijk, eigen platform lost dat direct op en is
  daarmee méér dan een hobby-tool: het is een vorm van
  loopbaan-/dataportabiliteit voor de scout zelf.
- Daarnaast: **managementbureaus en zaakwaarnemers** die spelers volgen
  buiten een clubverband om, en **hoger spelende amateurclubs** die zowel
  interne jeugdscouting als (soms) externe scouting doen. Lagere
  BVO-jeugdopleidingen zijn een mogelijke maar minder zekere doelgroep —
  die hebben vaak al eigen (duurdere, BVO-brede) systemen.
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

## 5. Licentiemodel — vastgesteld

Een **freemium, per-scout/per-organisatie SaaS-abonnement**. Geen
onderscheid naar sportief niveau (hoog spelende amateurclub vs. lagere
BVO-opleiding) — dat onderscheid is instabiel (promotie/degradatie) en
wordt al automatisch opgevangen doordat een grotere/intensievere
organisatie vanzelf meer coördinatoren/scouts nodig heeft en dus al meer
betaalt via de bestaande staffel. BVO-organisaties met een echt aparte
schaal/budget vallen onder de aparte Netwerk/Regio-tier (maatwerk), niet
onder een niveau-toeslag op de standaardtiers.

### Tiers en prijzen

| Tier | Voor wie | Bevat | Prijs |
|---|---|---|---|
| **Tester / vroege gebruiker** | Iedereen die nu al meedraait in de testfase | Volledige functieset | €9,99 / maand, blijvend |
| **Gratis** | Losse scout die wil uitproberen, geen betalende tester | Spelersdatabase tot ~25 spelers, basisrapportage, geen ritten/analyse-modules | €0 |
| **Solo Scout** | Individuele/vrijwillige scout, scout bij een BVO die een eigen onafhankelijke database wil, losse zaakwaarnemer | Onbeperkt spelers, volledige rapportage/observaties, ritten, tips-pipeline — geen teamstructuur nodig | €17,99 / maand |
| **Organisatie / Vereniging (HJO)** | Vereniging met een hoofdjeugdopleiding | HJO-basislicentie (eenmalig per organisatie, ongeacht aantal afdelingen), rolbeheer, toernooien, analysemodules, prioriteitssupport | €29,99 / maand (basislicentie) |
| — coördinator | per coördinator, binnen een vereniging | — | +€22,99 / maand per coördinator |
| — scout | per scout, binnen een vereniging | — | +€14,99 / maand per scout |
| **Managementbureau / zaakwaarnemerskantoor** | Bureau zonder verenigingsstructuur, alleen coördinatoren + scouts in dienst | Zelfde functieset als Organisatie, maar geen HJO-basislicentie nodig | Geen basisprijs |
| — coördinator | per coördinator, binnen een bureau | — | +€24,99 / maand per coördinator |
| — scout | per scout, binnen een bureau | — | +€14,99 / maand per scout |
| **Netwerk/Regio** | Scoutingnetwerk rond een BVO, meerdere clubs | Alles van Organisatie + overkoepelend dashboard over meerdere clubs, export/rapportage naar de BVO | Maatwerk, richting €150-400 / maand |

**Voorbeeld vereniging** met 1 coördinator + 3 scouts:
€29,99 (HJO-basislicentie) + €22,99 (coördinator) + 3×€14,99 (scouts) =
**€97,95 / maand**.

**Voorbeeld grotere jeugdopleiding** met 3 coördinatoren + 9 scouts:
€29,99 + 3×€22,99 + 9×€14,99 = **€233,87 / maand**.

**Voorbeeld managementbureau** met 1 coördinator + 3 scouts (geen
HJO-basislicentie): €24,99 + 3×€14,99 = **€69,96 / maand** — bewust
goedkoper dan het verenigingsequivalent voor hetzelfde aantal personen,
ondanks de iets hogere coördinatorprijs, omdat een bureau geen
HJO-structuur/basislicentie nodig heeft.

Redenen voor deze opzet:

- **Testers krijgen een vast, blijvend tarief (€9,99), geen aflopende
  proefperiode of percentagekorting.** Simpeler te communiceren en te
  administreren, en erkent hun vroege bijdrage zonder gedoe.
- **Solo Scout is bewust hoger geprijsd (€17,99) dan een instap-app**,
  omdat de kernwaarde voor deze doelgroep niet "uitproberen" is maar
  **dataportabiliteit en loopbaancontinuïteit** — vooral relevant voor een
  scout die bij een BVO werkt en zijn eigen scoutinggeschiedenis niet kwijt
  wil raken bij vertrek.
- **Volledig additief per rol (coördinator/scout), geen bundel- of
  afdelingslogica meer.** Dat is eenvoudiger uit te leggen en te
  administreren dan een basisbundel met inbegrepen aantallen, en schaalt
  direct eerlijk mee met de daadwerkelijke omvang van de organisatie.
- **Managementbureaus krijgen een eigen, losse structuur zonder
  HJO-basislicentie** — logisch, want zij hebben geen verenigingsvorm. Dat
  ze per coördinator iets meer betalen (€24,99 t.o.v. €22,99 bij een
  vereniging) is een bewust verschil tussen een commerciële, winstgerichte
  partij en een vrijwilligersorganisatie — in de praktijk valt dat verschil
  in de meeste gevallen alsnog lager uit dan het verenigingstarief, doordat
  de HJO-basislicentie wegvalt.
- **Jaarlijks factureren met korting** (bijv. 2 maanden gratis) past goed
  bij hoe verenigingen begroten (seizoensgebonden, vaak via de
  penningmeester eenmalig per jaar geregeld) en verlaagt churn/administratie.
- **Netwerk-tier blijft de meest kansrijke groeirichting** — een BVO of
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

Uitgangspunt: prijzen zoals hierboven vastgesteld (tester €9,99, Solo Scout
€17,99, organisatie/bureau volledig additief per coördinator/scout).
Gratis-tier draagt niet bij aan omzet maar wel aan naamsbekendheid/instroom
richting betaalde tiers. "Organisaties" hieronder is een gemengde groep van
verenigingen én managementbureaus; de gemiddelde prijs per organisatie
loopt op naarmate er meer/grotere jeugdopleidingen bij komen (meer
coördinatoren/scouts per organisatie).

| Scenario | Betalende eenheden na 12-18 mnd | Gem. prijs/mnd | Jaaromzet (ARR) |
|---|---|---|---|
| **Conservatief** | 20 testers + 15 solo scouts + 5 organisaties (gem. 1 coördinator + 3 scouts) | €9,99 / €17,99 / €98 | ≈ €11.500 |
| **Realistisch** | 50 testers + 40 solo scouts + 20 organisaties (gem. iets groter) | €9,99 / €17,99 / €115 | ≈ €42.200 |
| **Optimistisch** | 80 testers + 70 solo scouts + 40 organisaties (incl. grotere opleidingen/bureaus) + 2 netwerk-deals | €9,99 / €17,99 / €140 + €250 | ≈ €97.900 |

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
- **Start met Solo Scout + Organisatie zoals hierboven vastgesteld**, en
  hou vast aan één as voor prijsdifferentiatie (aantal scouts/coördinatoren),
  niet aan een tweede as zoals sportief niveau — twee assen tegelijk kost
  meer verkoop-/uitlegtijd dan het oplevert bij deze schaal.
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
