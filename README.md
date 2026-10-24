# Svatomartinské putování

Veřejný web s mapou OpenStreetMap, polohou účastníka a potvrzováním návštěv. Přihlášení používá jednorázový e-mailový odkaz Firebase Authentication. Body se soukromě synchronizují z Google Sheetu do Firestore; návštěvy ukládá Firestore přímo pod ID přihlášeného uživatele.

## Aktuální služby

- [Zdrojová tabulka](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit), list `GPS body`, sloupce `Poloha` a `Popis`.
- Firebase projekt `svatomartinske-putovani`, Firestore `(default)` v `europe-central2`, hosting `svatomartinske-putovani`.
- Firebase Authentication: povolen e-mailový odkaz; přihlašovací doména `svatomartinske-putovani.web.app`.
- [Soukromý Apps Script](https://script.google.com/home/projects/1-e2rCEVEKx9SaOmn8bmGr2O4By3FZHKUxfRvj2ETRsQv2xqo-fXe2Jo4/edit) je určený pouze pro synchronizaci. **Nenasazujte jej jako veřejnou webovou aplikaci.**

## Zprovoznění a aktualizace

1. V projektu Apps Script nahrajte `apps-script/Code.gs` a `apps-script/appsscript.json`. Script Properties: `POINTS_SPREADSHEET_ID=1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I` a `FIRESTORE_PROJECT_ID=svatomartinske-putovani`. Starý `AUTH_PEPPER` už není potřeba; po migraci jej smažte z vlastností projektu.
2. Účet provádějící synchronizaci musí mít čtení tabulky a právo zápisu dokumentů ve Firestore. V editoru spusťte `syncPoints` a zkontrolujte počet bodů; poté jednou spusťte `installHourlyTrigger`. Skript synchronizuje každou hodinu. Neplatné řádky ignoruje; prázdný či chybně formátovaný zdroj vyvolá chybu a nic nemaže.
3. Firebase webová konfigurace v `config.js` obsahuje pouze veřejné identifikátory projektu. Žádný servisní klíč ani OAuth token do repozitáře nepatří.
4. Nasaďte `firestore.rules`, sestavte statické soubory a nasaďte Firebase Hosting: `npm test`, `npm run build`, `firebase deploy --only firestore:rules,hosting --project svatomartinske-putovani`.
5. Ověřte e-mailový odkaz na telefonu, načtení bodů, přesnou a nepřesnou polohu, potvrzení do 20 m a obnovení stránky. E-mailové odkazy mohou podléhat denní kvótě Firebase.

## Pravidla návštěv

Klient nabídne potvrzení jen při měření mladším než 15 s a při `vzdálenost + udávaná přesnost GPS ≤ 20 m`. Firestore pravidla znovu ověřují přihlášení, vlastní ID uživatele, existující bod, čas měření do 30 s, přesnost nejvýše 20 m a vzdálenost v rovině včetně rezervy na nepřesnost. Návštěvu lze pouze vytvořit; změna a smazání klientem jsou zakázané. Pravidla jsou prototyp produkční politiky a je třeba je před širším provozem zkontrolovat podle skutečného modelu dat a požadavků na ochranu osobních údajů.

Souřadnice poslané pro potvrzení pocházejí z prohlížeče a lze je zfalšovat. Jsou uloženy v soukromém dokumentu návštěvy spolu s časem a přesností; provozovatel musí stanovit dobu uchování a postup mazání. Firestore pravidla brání běžnému zápisu mimo okruh, nemohou dokázat fyzickou přítomnost.

Mapové dlaždice jsou z veřejného serveru OSM s viditelnou atribucí. Pro vyšší návštěvnost nastavte v `config.js` poskytovatele s odpovídající kapacitou.
