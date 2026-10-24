# Svatomartinské putování

Mobilní webová aplikace zobrazuje zastavení v mapě OpenStreetMap, aktuální polohu účastníka a stav návštěv. Přihlášení probíhá jednorázovým kódem zaslaným na e-mail. Návštěvu lze nabídnout a zapsat, jen když součet vzdálenosti od bodu a udávané přesnosti GPS nepřesáhne 20 m.

## Stav a chybějící údaje

Zdrojová tabulka pro **Svatomartinské putování** nebyla na připojeném Google Drivu nalezena. Dostupná tabulka „Putovani se školkou ver. 2.0 2026“ patří jiné akci, proto ji aplikace nepoužívá. K ostrému spuštění je třeba dodat nebo vytvořit správný Google Sheet, vyplnit jeho ID do Script Properties a nasadit Apps Script. Je také třeba doplnit veřejnou URL nasazení do `config.js`. Do repozitáře nepatří žádné tajné klíče.

## Zprovoznění

1. V Google Drivu vytvořte tabulku. Na kartě `Points` vložte záhlaví přesně v tomto pořadí: `Id, Name, Description, Latitude, Longitude, Active`. `Id` musí být jedinečné a stálé. Souřadnice jsou WGS84 v desetinných stupních (např. `49.9123`, `14.7234`); `Active` je `TRUE`, `ano` nebo `1`. Další karty `Users`, `AuthCodes`, `Sessions`, `Visits` vytvoří backend automaticky.
2. Vytvořte samostatný projekt Google Apps Script. Nahrajte `apps-script/Code.gs` a manifest `apps-script/appsscript.json`. Účet, který skript nasazuje, musí mít právo upravovat tabulku a posílat e-maily.
3. V nastavení projektu → Script Properties zadejte `SPREADSHEET_ID` (ID této tabulky) a `AUTH_PEPPER` (náhodný tajný řetězec dlouhý nejméně 32 znaků). Pepper nikdy nezapisujte do GitHubu; jeho změna zneplatní uložené kódy a relace.
4. Nasaďte Apps Script jako Web app, spuštění jako vlastník nasazení, přístup „Anyone“. Získejte URL končící `/exec`. Zapište ji do `config.js` jako `apiUrl`. URL je veřejná konfigurace; backend sám ověřuje každý chráněný požadavek.
5. Web hostujte přes HTTPS (geolokace jinak v prohlížeči nefunguje). Pro statický hosting použijte obsah `dist/` po `npm run build`. Při použití GitHub Pages nastavte zdroj publikace zvlášť.

## Ověření

```sh
npm test
npm run build
```

Po nasazení ověřte na telefonu přihlášení, načtení bodů, zobrazení polohy, odmítnutí nepřesné či vzdálené polohy, potvrzení do 20 m a zachování návštěvy po obnovení stránky. Tyto integrační kroky vyžadují skutečné nasazení a GPS.

## Bezpečnost a soukromí

Princip autentizace vychází z projektu [Putovani_Svetice](https://github.com/Blovak/Putovani_Svetice): jednorázový e-mailový kód, omezení opakovaných žádostí a pokusů, serverová relace a serverový zápis návštěv. Nová aplikace má vlastní Apps Script a tabulku. Kód platí 10 minut, nejvýše pět chybných pokusů; žádost na stejný e-mail lze opakovat nejdříve za minutu. Relace platí 30 dnů a token je v prohlížeči v `sessionStorage`. V tabulce se ukládá pouze HMAC hash tokenu a kódu. Google Sheets, OTP a návštěvy nejsou vystaveny klientovi; veřejný klient dostává jen aktivní body a vlastní návštěvy po ověření relace.

Při potvrzení backend znovu kontroluje stáří, souřadnice, přesnost a vzdálenost. Poloha odeslaná z prohlížeče ale může být zfalšována; GPS potvrzení není důkaz fyzické přítomnosti proti úmyslnému podvodu. Backend trvale ukládá ID uživatele, bod, čas, vypočtenou vzdálenost a přesnost, nikoli přesné souřadnice uživatele. Provozovatel má stanovit dobu uchování a postup mazání osobních údajů.

Mapové dlaždice používají veřejný server OSM. Zůstává viditelné uvedení autorů. Pro větší návštěvnost nastavte v `config.js` poskytovatele dlaždic s vhodnou kapacitou a podmínkami; aplikace dlaždice nestahuje předem. Prohlížeč musí posílat běžný Referer.

## Struktura

- `index.html`, `style.css`, `app.js`, `geo.js`: webový klient
- `config.js`: veřejná konfigurace nasazení
- `apps-script/`: serverový backend
- `ZADANI_PRO_CODEX.md`: přesné zadání a akceptační kritéria
