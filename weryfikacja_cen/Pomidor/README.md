# Monitoring cen: Pomidor malinowy

Dane w `ceny_pomidor_malinowy.csv`. Każdy wiersz to jeden pomiar dla jednej sieci w danym dniu. Kolejne uruchomienia **dopisują nowe wiersze na końcu pliku** (nie nadpisują istniejących), dzięki czemu powstaje historia cen.

## Format
- Separator: `;` · kodowanie: UTF-8 · liczby z kropką dziesiętną (`3.99`) · daty `YYYY-MM-DD`
- Puste pole oznacza brak danych. Cen nigdy nie zgadujemy.

| Kolumna | Opis |
|---|---|
| data_sprawdzenia | dzień pomiaru |
| siec | Dino / Biedronka / Lidl / Kaufland / Delikatesy Centrum |
| produkt, jednostka | nazwa z gazetki, `kg` / `opak. 500 g` / `szt.` |
| cena_promocyjna_pln | aktualna cena sprzedaży w promocji |
| cena_regularna_pln, typ_ceny_regularnej | cena regularna, np. `przekreslona` lub `najnizsza_30_dni` |
| warunki_promocji | np. aplikacja, „przy zakupie 2”, „tylko pn.” |
| promocja_od, promocja_do | okres obowiązywania promocji |
| gazetka, gazetka_od, gazetka_do | gazetka, którą sprawdzono |
| status | `promocja_aktywna` / `brak_w_gazetce` / `promocja_wygasla` / `historyczna` (starsza oferta, tylko kontekst) |
| pewnosc | wysoka / srednia / niska |
| zrodla | URL-e rozdzielone ` \| ` |
| uwagi | ograniczenia pomiaru |

Szybki podgląd aktualnych promocji:
```bash
awk -F';' 'NR==1 || $14=="promocja_aktywna"' ceny_pomidor_malinowy.csv
```
