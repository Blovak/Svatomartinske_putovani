# Zadání pro Codex: Svatomartinské putování

Udržuj veřejný mobilní web v repozitáři `Blovak/Svatomartinske_putovani`. Web bez přihlášení zobrazuje místa na mapě OpenStreetMap a aktuální polohu návštěvníka.

## Data a chování

- Body pocházejí z Google Sheetu `1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I`, list `GPS body`.
- Apps Script synchronizuje body do Firestore a veřejně je vrací přes `?action=points`.
- Firestore není dostupný přímo z veřejného klienta; pravidla zakazují klientské čtení i zápis.
- Aplikace neobsahuje uživatelské účty, přihlášení, role ani potvrzování návštěv.
- Poloha uživatele se zobrazuje pouze lokálně a neodesílá se na server.

## Akceptace

1. `npm test` a `npm run build` projdou.
2. Mapa zobrazí všechny platné body z veřejného API.
3. Po udělení oprávnění se zobrazí aktuální poloha a kruh její přesnosti.
4. Tlačítko **Moje poloha** vystředí mapu na uživatele.
5. Web neobsahuje přihlášení, relace, návštěvy ani odesílání polohy.
6. Veřejný web běží přes HTTPS a používá pouze URL Apps Scriptu jako veřejnou konfiguraci.
