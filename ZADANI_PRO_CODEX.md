# Zadání pro Codex: Svatomartinské putování

## Cíl

Udržuj webovou aplikaci „Svatomartinské putování“ v repozitáři `Blovak/Svatomartinske_putovani`. Účastník se ověří e-mailem, vidí zastavení na mapě OpenStreetMap a svou GPS polohu. Návštěvu místa může potvrdit pouze z jeho blízkosti.

## Zdroje a pravidla

- Autentizace se řídí principem `Blovak/Putovani_Svetice`: serverem zaslaný jednorázový e-mailový kód, omezené pokusy, hashované relace, ochrana dat na serveru. Nekopíruj produkční konfiguraci, identitu uživatelů ani tajné údaje původní aplikace.
- Body pocházejí z [tabulky Data](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit), list `GPS body`, sloupce `Poloha` a `Popis`. Souřadnice mají tvar `49.9699433N, 14.6600078E`. Neplatné a prázdné řádky nevykresluj. Zdrojová tabulka je jen pro čtení.
- Na mapě zobraz všechny platné neprázdné řádky zdrojové tabulky, viditelnou atribuci OSM, polohu uživatele a kruh přesnosti GPS. Po zamítnutí oprávnění ukaž srozumitelný stav.
- Nabídku „Potvrdit návštěvu“ ukaž pouze pro čerstvé měření (max. 15 s), pokud `vzdálenost + přesnost GPS ≤ 20 m`. Backend před zápisem nezávisle přepočítá vzdálenost a zkontroluje stáří měření (max. 30 s), přesnost a relaci. Zabraň duplicitním návštěvám.
- Uživatelé, kódy, relace a návštěvy patří do samostatného Google Cloud Firestore projektu, nikoli do zdrojového Google Sheetu. Přímý přístup klienta do Firestore zakaž pravidly; server používá OAuth/IAM.
- Nezapisuj tajné údaje do repozitáře ani do frontendu. `POINTS_SPREADSHEET_ID`, `FIRESTORE_PROJECT_ID` a tajný `AUTH_PEPPER` patří do Script Properties. Veřejná URL Apps Scriptu patří do `config.js`.
- Udrž přístupné formuláře, stavové zprávy a rozvržení pro mobil. Nevyžaduj instalaci aplikace.

## Akceptační kritéria

1. `npm test` a `npm run build` projdou.
2. Nepřihlášený klient nedostane seznam vlastních návštěv ani možnost zápisu.
3. Přesnost nad 20 m, zastaralá poloha nebo `vzdálenost + přesnost > 20 m` skryje nabídku potvrzení a server zápis odmítne.
4. Opakované potvrzení stejného bodu nepřidá druhý záznam.
5. Po doplnění správného Google Sheetu, Script Properties a URL nasazení aplikace funguje přes HTTPS v mobilním prohlížeči.

## Před nasazením

Zdrojové ID je `1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I`. Vytvoř samostatný Firestore projekt, nasaď pravidla a Apps Script, nastav `FIRESTORE_PROJECT_ID` a `AUTH_PEPPER`, doplň veřejnou URL do `config.js`, ověř tok e-mailu a průchod skutečnou trasou. Publikování hostingu a Apps Scriptu je samostatný provozní krok.
