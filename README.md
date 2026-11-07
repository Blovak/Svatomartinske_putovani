# Svatomartinské putování

Veřejný mobilní web s mapou OpenStreetMap, místy putování a aktuální polohou návštěvníka. Aplikace nevyžaduje přihlášení, neeviduje návštěvy a polohu uživatele nikam neodesílá.

## Data

- [Zdroj bodů](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit), list `GPS body`, sloupce `Poloha` a `Popis`.
- Firebase projekt `svatomartinske-putovani`, Firestore `(default)` v `europe-central2`, hosting `svatomartinske-putovani`.
- Apps Script jednou za hodinu synchronizuje body z tabulky do kolekce `points` a poskytuje je veřejnému webu přes `?action=points`.

Firestore není přístupný přímo z prohlížeče. Veřejný klient komunikuje pouze s Apps Scriptem, který vrací názvy, popisy a souřadnice míst. Aktuální poloha se získává pomocí geolokačního API prohlížeče a zůstává jen v zařízení návštěvníka.

## Nasazení

1. V existujícím Apps Script projektu nahrajte `apps-script/Code.gs` a `apps-script/appsscript.json`.
2. Ve Script Properties lze ponechat výchozí hodnoty nebo nastavit `POINTS_SPREADSHEET_ID` a `FIRESTORE_PROJECT_ID`.
3. V editoru jednou spusťte `authorizeApplication`, `syncPoints` a `installHourlyTrigger`.
4. Apps Script nasaďte jako webovou aplikaci: **spustit jako vlastník nasazení**, přístup **kdokoli**. Zkopírujte URL končící `/exec` do `apiUrl` v `config.js`.
5. Ověřte odpověď na adrese `<URL_APPS_SCRIPTU>?action=points`.
6. Spusťte `npm test`, `npm run build` a nasaďte hosting: `firebase deploy --only hosting --project svatomartinske-putovani`.
7. Na telefonu ověřte načtení bodů, udělení přístupu k poloze a tlačítko **Moje poloha**.

Web musí běžet přes HTTPS, aby prohlížeč zpřístupnil přesnou polohu.
