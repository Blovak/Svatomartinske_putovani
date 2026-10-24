# Zadání pro Codex: Svatomartinské putování

## Cíl

Udržuj webovou aplikaci „Svatomartinské putování“ v repozitáři `Blovak/Svatomartinske_putovani`. Účastník se ověří e-mailem, vidí zastavení na mapě OpenStreetMap a svou GPS polohu. Návštěvu místa může potvrdit pouze z jeho blízkosti.

## Zdroje a pravidla

- Autentizace se řídí principem `Blovak/Putovani_Svetice`: serverem zaslaný jednorázový e-mailový kód, omezené pokusy, hashované relace, ochrana dat na serveru. Nekopíruj produkční konfiguraci, identitu uživatelů ani tajné údaje původní aplikace.
- Body pocházejí z konfigurovaného Google Sheetu na Drivu. Použij kartu `Points` se sloupci `Id, Name, Description, Latitude, Longitude, Active`. U neplatných a neaktivních řádků nic nevykresluj.
- Na mapě zobraz všechny aktivní body, viditelnou atribuci OSM, polohu uživatele a kruh přesnosti GPS. Po zamítnutí oprávnění ukaž srozumitelný stav.
- Nabídku „Potvrdit návštěvu“ ukaž pouze pro čerstvé měření (max. 15 s), pokud `vzdálenost + přesnost GPS ≤ 20 m`. Backend před zápisem nezávisle přepočítá vzdálenost a zkontroluje stáří měření (max. 30 s), přesnost a relaci. Zabraň duplicitním návštěvám.
- Nezapisuj tajné údaje do repozitáře ani do frontendu. ID tabulky a tajný `AUTH_PEPPER` patří do Script Properties. Veřejná URL Apps Scriptu patří do `config.js`.
- Udrž přístupné formuláře, stavové zprávy a rozvržení pro mobil. Nevyžaduj instalaci aplikace.

## Akceptační kritéria

1. `npm test` a `npm run build` projdou.
2. Nepřihlášený klient nedostane seznam vlastních návštěv ani možnost zápisu.
3. Přesnost nad 20 m, zastaralá poloha nebo `vzdálenost + přesnost > 20 m` skryje nabídku potvrzení a server zápis odmítne.
4. Opakované potvrzení stejného bodu nepřidá druhý záznam.
5. Po doplnění správného Google Sheetu, Script Properties a URL nasazení aplikace funguje přes HTTPS v mobilním prohlížeči.

## Před nasazením

Zjisti správné ID nové tabulky; stávající tabulka „Putovani se školkou“ se pro tuto akci nesmí použít. Nasaď samostatný Apps Script, nastav `SPREADSHEET_ID` a `AUTH_PEPPER`, doplň jeho veřejnou URL do `config.js`, ověř tok e-mailu a průchod skutečnou trasou. Publikování hostingu a Apps Scriptu je samostatný provozní krok.
