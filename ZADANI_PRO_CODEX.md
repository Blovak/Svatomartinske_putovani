# Zadání pro Codex: Svatomartinské putování

Udržuj mobilní web v repozitáři `Blovak/Svatomartinske_putovani`. Uživatel se ověří jednorázovým e-mailovým odkazem Firebase Authentication, vidí místa na mapě OpenStreetMap a svou polohu. Přihlašovací princip navazuje na ověření vlastnictví e-mailu v `Putovani_Svetice`, ale nepřebírá jeho účty, tajné údaje ani backend.

## Data a chování

- Zdroj GPS je [Google Sheet](https://docs.google.com/spreadsheets/d/1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I/edit), list `GPS body`, sloupce `Poloha` a `Popis`. Soukromý Apps Script načítá platné řádky a synchronizuje `points/{id}` do Firestore každou hodinu. Zdroj je pouze pro čtení. Apps Script nemá veřejný webový endpoint.
- Mapa zobrazuje všechna synchronizovaná místa, aktuální polohu a kruh přesnosti. U odmítnuté geolokace zobrazuje srozumitelnou zprávu.
- Tlačítko potvrzení je dostupné jen pro polohu mladší než 15 sekund, když `vzdálenost + přesnost ≤ 20 m`. Firestore pravidla nezávisle kontrolují přihlášení, vlastnictví, bod, stáří do 30 s a vzdálenost s přesností. Opakovaný zápis a změnu návštěvy odmítají.
- Návštěvy jsou v `users/{uid}/visits/{pointId}`. Jiný uživatel je nesmí číst. Přesné souřadnice návštěvy jsou citlivé osobní údaje; dokumentujte uchování a mazání.
- Firebase web config jsou veřejné identifikátory. Nikdy neukládej soukromé klíče, tokeny nebo oprávnění správce do webu či repozitáře.

## Akceptace

1. `npm test` a `npm run build` projdou.
2. E-mailový odkaz dokončí přihlášení i na jiném zařízení po opětovném zadání e-mailu.
3. Nepřihlášený uživatel nečte body ani návštěvy. Přihlášený čte jen vlastní návštěvy.
4. Vzdálenou, nepřesnou, zastaralou a duplicitní návštěvu Firestore odmítne.
5. Veřejný web běží na Firebase Hosting přes HTTPS a načítá skutečné body.

Viz `README.md` pro provozní postup. GPS z prohlížeče lze zfalšovat; systém není důkazem fyzické přítomnosti.
