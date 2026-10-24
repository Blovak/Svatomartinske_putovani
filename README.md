# Svatomartinské putování

Mobilní webová aplikace zobrazuje zastavení v mapě OpenStreetMap, aktuální polohu účastníka a stav návštěv. Přihlášení probíhá jednorázovým kódem zaslaným na e-mail. Návštěvu lze nabídnout a zapsat, jen když součet vzdálenosti od bodu a udávané přesnosti GPS nepřesáhne 20 m.

## Stav a chybějící údaje

Zdrojovou tabulkou je [Data – GPS body](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit). Obsahuje čtyři místa. Backend z ní čte pouze list `GPS body`; zdrojovou tabulku neupravuje. Uživatelé, jednorázové kódy, relace a návštěvy se ukládají do **Google Cloud Firestore**. Samostatný projekt `svatomartinske-putovani` a databáze `(default)` v regionu `europe-central2` jsou vytvořené na bezplatném tarifu Spark. Pravidla databáze zakazují přímý klientský přístup. K ostrému spuštění zbývá nastavit Apps Script a doplnit veřejnou URL nasazení do `config.js`. Do repozitáře nepatří žádné tajné klíče.

## Zprovoznění

1. Zdrojová tabulka má list `GPS body` se sloupci `Poloha` a `Popis`. Například `49.9699433N, 14.6600078E` / `Na Žlabku 246`. Každý platný neprázdný řádek představuje místo. ID bodu se odvozuje ze souřadnic; změna souřadnic vytvoří z pohledu aplikace nový bod.
2. Projekt `svatomartinske-putovani` a výchozí databáze Firestore jsou již vytvořené. Databáze používá Standard edition v režimu Native a region `europe-central2` (Varšava). Projekt Putování Světice zůstává oddělený.
3. Výchozí produkční pravidla již zakazují veškeré přímé čtení a zápis z webu a odpovídají souboru `firestore.rules`. Apps Script přistupuje přes OAuth a IAM. Účtu, který Apps Script nasazuje, přidělte jen potřebná oprávnění k Firestore dokumentům; typicky roli **Cloud Datastore User** v tomto projektu. Ověřte, že má také právo číst zdrojovou tabulku a posílat e-maily.
4. Vytvořte samostatný projekt Google Apps Script. Nahrajte `apps-script/Code.gs` a manifest `apps-script/appsscript.json`. Má povinné OAuth scope pro čtení Sheets, odesílání e-mailu, Firestore a externí požadavky. Apps Script projekt propojte s odpovídajícím Google Cloud projektem.
5. V nastavení projektu → Script Properties zadejte `POINTS_SPREADSHEET_ID=1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I`, `FIRESTORE_PROJECT_ID=svatomartinske-putovani` a `AUTH_PEPPER` (náhodný tajný řetězec dlouhý nejméně 32 znaků). Pepper nikdy nezapisujte do GitHubu; jeho změna zneplatní uložené kódy a relace.
6. Nasaďte Apps Script jako Web app, spuštění jako vlastník nasazení, přístup „Anyone“. Získejte URL končící `/exec`. Zapište ji do `config.js` jako `apiUrl`. URL je veřejná konfigurace; backend sám ověřuje každý chráněný požadavek.
7. Web hostujte přes HTTPS (geolokace jinak v prohlížeči nefunguje). Pro statický hosting použijte obsah `dist/` po `npm run build`. Při použití GitHub Pages nastavte zdroj publikace zvlášť.

## Ověření

```sh
npm test
npm run build
```

Po nasazení ověřte na telefonu přihlášení, načtení bodů, zobrazení polohy, odmítnutí nepřesné či vzdálené polohy, potvrzení do 20 m a zachování návštěvy po obnovení stránky. Tyto integrační kroky vyžadují skutečné nasazení a GPS.

## Bezpečnost a soukromí

Princip autentizace vychází z projektu [Putovani_Svetice](https://github.com/Blovak/Putovani_Svetice): jednorázový e-mailový kód, omezení opakovaných žádostí a pokusů, serverová relace a serverový zápis návštěv. Nová aplikace má vlastní Apps Script a vlastní Firestore projekt. Kód platí 10 minut, nejvýše pět chybných pokusů; žádost na stejný e-mail lze opakovat nejdříve za minutu. Relace platí 30 dnů a token je v prohlížeči v `sessionStorage`. Ve Firestore se ukládá pouze HMAC hash tokenu a kódu. Přímý přístup klienta k Firestore zakazují pravidla; klient dostává místa a vlastní návštěvy po ověření relace.

Při potvrzení backend znovu kontroluje stáří, souřadnice, přesnost a vzdálenost. Poloha odeslaná z prohlížeče ale může být zfalšována; GPS potvrzení není důkaz fyzické přítomnosti proti úmyslnému podvodu. Backend trvale ukládá ID uživatele, bod, čas, vypočtenou vzdálenost a přesnost, nikoli přesné souřadnice uživatele. Provozovatel má stanovit dobu uchování a postup mazání osobních údajů.

Mapové dlaždice používají veřejný server OSM. Zůstává viditelné uvedení autorů. Pro větší návštěvnost nastavte v `config.js` poskytovatele dlaždic s vhodnou kapacitou a podmínkami; aplikace dlaždice nestahuje předem. Prohlížeč musí posílat běžný Referer.

## Struktura

- `index.html`, `style.css`, `app.js`, `geo.js`: webový klient
- `config.js`: veřejná konfigurace nasazení
- `apps-script/`: serverový backend
- `firestore.rules`: zákaz přímého čtení a zápisu pro samostatný Firestore projekt
- `ZADANI_PRO_CODEX.md`: přesné zadání a akceptační kritéria
