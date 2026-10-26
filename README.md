# Svatomartinské putování

Veřejný web s mapou OpenStreetMap, polohou účastníka a potvrzováním návštěv. Přihlášení používá šestimístný jednorázový kód zaslaný e-mailem přes Google Apps Script. Firebase Authentication se nepoužívá.

## Data a role

- [Zdroj bodů](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit), list `GPS body`, sloupce `Poloha` a `Popis`.
- [Registr uživatelů](https://docs.google.com/spreadsheets/d/1TEfbxeO5gwPBgJc2N9VTGpBcZAAzKwCmS1UcWcLJ-pI/edit), list `Users`, sloupce `email`, `datum registrace`, `typ uctu`.
- Firebase projekt `svatomartinske-putovani`, Firestore `(default)` v `europe-central2`, hosting `svatomartinske-putovani`.
- Návštěvy se každých pět minut zálohují do listu `Navstevy` v tabulce `Data`. List má záhlaví `User`, `Popis bodu`, `Datum a cas navstevy`.

Po prvním úspěšném ověření se e-mail doplní do registru s aktuálním datem a rolí `user`. Správce může ve třetím sloupci změnit roli na `admin`. Jiné nebo prázdné hodnoty se bezpečně vyhodnotí jako `user`. Role se z tabulky znovu čte při každém ověření relace a serverovém požadavku.

## Přihlášení a bezpečnost

Apps Script přijímá e-mail, vytvoří šestimístný kód s platností 10 minut a odešle jej pomocí `MailApp`. Další kód lze pro stejný e-mail poslat nejdříve za minutu a ověření dovolí nejvýše pět chybných pokusů. Kódy i tokeny relací jsou ve Firestore pouze jako SHA-256 hashe doplněné tajným `AUTH_PEPPER` uloženým ve Script Properties. Relace platí 90 dní a lze ji odhlášením zneplatnit.

Veškeré čtení bodů, vlastních návštěv a zápis návštěvy probíhá přes Apps Script s ověřenou relací. Firestore pravidla proto zakazují veškerý přímý klientský přístup. Server znovu kontroluje stáří měření do 30 sekund, přesnost nejvýše 20 metrů a podmínku `vzdálenost + přesnost ≤ 20 m`. Přesná poloha návštěvy je osobní údaj; provozovatel musí určit dobu uchování a mazání. GPS z prohlížeče lze zfalšovat.

## Nasazení

1. V existujícím Apps Script projektu nahrajte `apps-script/Code.gs` a `apps-script/appsscript.json`.
2. Ve Script Properties lze ponechat výchozí hodnoty nebo nastavit `POINTS_SPREADSHEET_ID`, `USERS_SPREADSHEET_ID` a `FIRESTORE_PROJECT_ID`. `AUTH_PEPPER` nevkládejte ručně; vytvoří se při prvním spuštění.
3. V editoru jednou spusťte `authorizeApplication`, potom `syncPoints`, `installHourlyTrigger`, `syncVisitsBackup` a `installVisitsBackupTrigger`. Účet nasazení musí mít přístup k oběma tabulkám a k Firestore projektu.
4. Apps Script nasaďte jako webovou aplikaci: **spustit jako vlastník nasazení**, přístup **kdokoli**. Zkopírujte URL končící `/exec` do `apiUrl` v `config.js`.
5. Nasaďte uzavřená Firestore pravidla a hosting: `npm test`, `npm run build`, `firebase deploy --only firestore:rules,hosting --project svatomartinske-putovani`.
6. Ověřte na telefonu odeslání kódu, přihlášení, zápis nového uživatele do tabulky, změnu role, načtení bodů, potvrzení návštěvy a odhlášení.

Apps Script má denní kvótu odeslaných e-mailů. Veřejná URL webové aplikace není tajemství; oprávnění stojí na jednorázovém kódu a serverové relaci.
