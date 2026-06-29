# ScoutingHub - Context voor Claude Code

## Project
Dutch youth-football scouting SPA/PWA. Firebase/Firestore backend, Cloudflare Worker, Vercel hosting.

## Branch
Altijd werken op **Testomgeving** branch, NOOIT op main.

## Push
```
git add <bestanden>
git commit -m "beschrijving"
git push origin Testomgeving
```

## Regels
- NOOIT gedachtestreepje gebruiken, nergens in de app of tooltips
- sw.js CACHE_VERSION bumpen bij elke wijziging aan app.js/index.html/style.css
- Huidige CACHE_VERSION: sh-v514-club-suggest-fix
- serviceAccount.json NOOIT naar GitHub (staat in .gitignore)

## Open items (per 2026-06-29)
- Rittenregistratie: club-suggestie km-fix gepusht (0eb3c6e), testen of het nu werkt
- Club logos: fix op website
- Admin PWA installeerbaar maken

## Wat recentelijk gedaan is
- ritten km-berekening: reeks bugfixes (stale coords, km-veld blokkeerde herberekening, PDOK prioriteit)
- ritten club-suggestie: mousedown-handler vereenvoudigd - gebruikt nu zelfde geocode-pad als handmatig typen
- sw.js gebumpt naar sh-v514-club-suggest-fix
- Gepusht naar Testomgeving (commit 0eb3c6e)

## Huisstijl
- bg: #10151e, primary: #e30613, secondary: #f5c518, accent: #4ea1ff
- Font: Inter
