# Svatomartinské putování

Mobilní webová aplikace zobrazuje zastavení v mapě OpenStreetMap, aktuální polohu účastníka a stav návštěv. Přihlášení probíhá jednorázovým kódem zaslaným na e-mail. Návštěvu lze nabídnout a zapsat, jen když součet vzdálenosti od bodu a udávané přesnosti GPS nepřesáhne 20 m.

## Stav a chybějící údaje

Zdrojovou tabulkou je [Data – GPS body](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit). Obsahuje čtyři místa. Backend z ní čte pouze list `GPS body`; zdrojovou tabulku neupravuje. K ostrému spuštění je třeba vytvořit **samostatnou provozní tabulku** pro uživatele, kódy, relace a návštěvy, nastavit obě ID v Script Properties a nasadit Apps Script. Je také třeba doplnit veřejnou URL nasazení do `config.js`. Do repozitáře nepatří žádné tajné klíče.

## Zprovoznění

1. Zdrojová tabulka má list `GPS body` se sloupci `Poloha` a `Popis`. Například `49.9699433N, 14.6600078E` / `Na Žlabku 246`. Každý platný neprázdný řádek představuje místo. ID bodu se odvozuje ze souřadnic; změna souřadnic vytvoří z pohledu aplikace nový bod.
2. V Google Drivu vytvořte **novou prázdnou provozní tabulku**. Backend v ní vytvoří listy `Users`, `AuthCodes`, `Sessions`, `Visits`. Zdrojovou tabulku s GPS nepoužívejte k zápisu těchto údajů.
3. Vytvořte samostatný projekt Google Apps Script. Nahrajte `apps-script/Code.gs` a manifest `apps-script/appsscript.json`. Účet, který skript nasazuje, musí mít právo číst zdrojovou tabulku, upravovat provozní tabulku a posílat e-maily.
4. V nastavení projektu → Script Properties zadejte `POINTS_SPREADSHEET_ID=1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I`, `STORAGE_SPREADSHEET_ID` (ID nové provozní tabulky) a `AUTH_PEPPER` (náhodný tajný řetězec dlouhý nejméně 32 znaků). Pepper nikdy nezapisujte do GitHubu; jeho změna zneplatní uložené kódy a relace.
5. Nasaďte Apps Script jako Web app, spuštění jako vlastník nasazení, přístup „Anyone“. Získejte URL končící `/exec`. Zapište ji do `config.js` jako `apiUrl`. URL je veřejná konfigurace; backend sám ověřuje každý chráněný požadavek.
6. Web hostujte přes HTTPS (geolokace jinak v prohlížeči nefunguje). Pro statický hosting použijte obsah `dist/` po `npm run build`. Při použití GitHub Pages nastavte zdroj publikace zvlášť.

## Ověření

```sh
npm test
npm run build
```

Po nasazení ověřte na telefonu přihlášení, načtení bodů, zobrazení polohy, odmítnutí nepřesné či vzdálené polohy, potvrzení do 20 m a zachování návštěvy po obnovení stránky. Tyto integrační kroky vyžadují skutečné nasazení a GPS.

## Bezpečnost a soukromí

Princip autentizace vychází z projektu [Putovani_Svetice](https://github.com/Blovak/Putovani_Svetice): jednorázový e-mailový kód, omezení opakovaných žádostí a pokusů, serverová relace a serverový zápis návštěv. Nová aplikace má vlastní Apps Script a samostatnou provozní tabulku. Kód platí 10 minut, nejvýše pět chybných pokusů; žádost na stejný e-mail lze opakovat nejdříve za minutu. Relace platí 30 dnů a token je v prohlížeči v `sessionStorage`. V provozní tabulce se ukládá pouze HMAC hash tokenu a kódu. OTP a návštěvy nejsou vystaveny klientovi; klient dostává místa a vlastní návštěvy po ověření relace.

Při potvrzení backend znovu kontroluje stáří, souřadnice, přesnost a vzdálenost. Poloha odeslaná z prohlížeče ale může být zfalšována; GPS potvrzení není důkaz fyzické přítomnosti proti úmyslnému podvodu. Backend trvale ukládá ID uživatele, bod, čas, vypočtenou vzdálenost a přesnost, nikoli přesné souřadnice uživatele. Provozovatel má stanovit dobu uchování a postup mazání osobních údajů.

Mapové dlaždice používají veřejný server OSM. Zůstává viditelné uvedení autorů. Pro větší návštěvnost nastavte v `config.js` poskytovatele dlaždic s vhodnou kapacitou a podmínkami; aplikace dlaždice nestahuje předem. Prohlížeč musí posílat běžný Referer.

## Struktura

- `index.html`, `style.css`, `app.js`, `geo.js`: webový klient
- `config.js`: veřejná konfigurace nasazení
- `apps-script/`: serverový backend
- `ZADANI_PRO_CODEX.md`: přesné zadání a akceptační kritéria
