# Zadání pro Codex: Svatomartinské putování

Udržuj mobilní web v repozitáři `Blovak/Svatomartinske_putovani`. Uživatel se ověřuje šestimístným jednorázovým kódem zaslaným e-mailem přes Apps Script, vidí místa na mapě OpenStreetMap a svou polohu.

## Data a chování

- Body pocházejí z Google Sheetu `1jG4mLIO_Suk0x8Kqk-eZRIJ7nGcxXwtzfFzl-RUCE0I`, list `GPS body`.
- Uživatelé jsou v Google Sheetu `1TEfbxeO5gwPBgJc2N9VTGpBcZAAzKwCmS1UcWcLJ-pI`, list `Users`, ve sloupcích `email`, `datum registrace`, `typ uctu`. První ověření doplní roli `user`; jediná privilegovaná role je `admin`.
- Apps Script spravuje OTP, serverové relace, čtení bodů i vlastních návštěv a zápis návštěvy. Tajný `AUTH_PEPPER` zůstává ve Script Properties.
- Firestore není dostupný přímo z veřejného klienta. Pravidla zakazují veškeré klientské čtení a zápis.
- Tlačítko potvrzení je dostupné jen pro polohu mladší než 15 sekund, když `vzdálenost + přesnost ≤ 20 m`. Server nezávisle kontroluje stáří do 30 sekund, přesnost a vzdálenost.
- Návštěvy jsou v `users/{emailHash}/visits/{pointId}`. Přesné souřadnice návštěvy jsou citlivé osobní údaje.

## Akceptace

1. `npm test` a `npm run build` projdou.
2. Kód je šestimístný, platí 10 minut, má omezení opakovaného odeslání a počtu pokusů.
3. Nový uživatel se po ověření zapíše do určené tabulky jako `user`; hodnota `admin` se bezpečně načte ze stejné tabulky.
4. Nepřihlášený klient nečte body ani návštěvy. Přihlášený dostane jen vlastní návštěvy.
5. Vzdálenou, nepřesnou, zastaralou a duplicitní návštěvu server odmítne.
6. Veřejný web běží přes HTTPS a používá pouze URL Apps Scriptu jako veřejnou konfiguraci.
