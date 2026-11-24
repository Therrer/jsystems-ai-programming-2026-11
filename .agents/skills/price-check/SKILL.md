---
name: price-check
description: Check the current promo and regular price of a grocery product (default "Pomidor malinowy") in Polish retail chains (default Dino, Biedronka, Lidl, Kaufland, Delikatesy Centrum) from their current flyers (gazetki), and append the results to an append-only CSV in `weryfikacja_cen/<Product>/`. Use when the user asks for a market/price analysis, "sprawdź ceny", "ceny w gazetkach", "promocja do kiedy", or to refresh an existing price CSV.
---

# Price check from retail flyers

One subagent per chain, in parallel. The coordinator writes the CSV and never invents prices:
an empty field is better than a guess.

## Phase 0. Setup (only ask what the prompt leaves open)

- **Product and chains.** Defaults: `Pomidor malinowy`; Dino, Biedronka, Lidl, Kaufland, Delikatesy Centrum.
- **Data file.** `weryfikacja_cen/<Product>/ceny_<product_slug>.csv` (e.g.
  `weryfikacja_cen/Pomidor/ceny_pomidor_malinowy.csv`). If it exists, read its header and
  last rows: you **append**, never rewrite. If not, create it with the header below and a `README.md`
  copied from `weryfikacja_cen/Pomidor/README.md`.
- **Git.** Run `git branch --show-current` and `git status --short` first: another session may have
  switched branches. Commit only on the user's request, on branch `weryfikacja_cen`.
- **Tools.** Check whether `curl`/`pdftotext` and the Playwright MCP work. Without them, flyer
  PDFs (>10 MB) and JS-rendered shop pages cannot be read; say so in the `uwagi` column.

## Phase 1. Research (parallel, one message)

Launch one `general-purpose` agent per chain in ONE message. Prompt template:

```
Today is <DATE> (<weekday>). Find the CURRENT price of "<PRODUCT>" in the Polish chain **<CHAIN>**,
based on the flyer (gazetka) valid on <DATE> and the chain's website. Use WebSearch and WebFetch.
Sources, best first: tanszykoszyk.pl/cena/<category>/<chain> (parsed flyer prices with conditions),
blix.pl/szukaj/?szukaj=<product> (which flyers contain it this week), blix.pl/sklep/<chain>/,
gazetkipromocyjne.net/<chain>/ (flyer dates), gazetki.pl/oferty/<category>/<chain>, ding.pl,
the official site (<OFFICIAL_URL>).
Report exactly: chain; product_name (as in flyer); unit (kg / opak. 500 g / szt.); promo_price_pln;
regular_price_pln + its type (przekreslona / najnizsza_30_dni); promo_conditions (app, "tylko pn.",
"przy zakupie 2"); promo_valid_from; promo_valid_to (YYYY-MM-DD); flyer name + validity; next flyer
start date; source_urls actually read; confidence (high/medium/low) + notes.
If the product is NOT in the current flyer, say so explicitly and give the latest older offer
with its dates, marked as not current. Say which flyer pages you could not read. Never invent prices.
Keep the report short.
```

Official sites: marketdino.pl, biedronka.pl/pl/gazetki, lidl.pl, kaufland.pl, delikatesy.pl/gazetki.

## Phase 2. Write the CSV

Separator `;`, UTF-8, decimal dot, dates `YYYY-MM-DD`, no `;` inside fields, URLs joined with ` | `.
Header (17 columns):

```
data_sprawdzenia;siec;produkt;jednostka;cena_promocyjna_pln;cena_regularna_pln;typ_ceny_regularnej;warunki_promocji;promocja_od;promocja_do;gazetka;gazetka_od;gazetka_do;status;pewnosc;zrodla;uwagi
```

- One row per chain per check. `status`: `promocja_aktywna` / `brak_w_gazetce` /
  `promocja_wygasla` (promo exists but not valid today, e.g. Monday-only) / `historyczna`
  (an older offer, added once for trend context; don't repeat rows already in the file).
- `pewnosc` honestly reflects how much of the flyer was read.
- Append with `cat >> file <<'EOF'`, then verify every row has 17 fields:
  `awk -F';' 'NF!=17{print "bad row " NR}' <file>`.

## Phase 3. Summary (user's language)

A table per chain: flyer + validity, promo price/unit, regular price, promo end date, confidence.
Then: suspicious values, unread flyer parts, the next flyer start dates (best moment to re-run),
and the price change versus previous rows in the CSV.

## Lessons from the first run (24.11.2026)

| What happened | Rule |
|---|---|
| blix.pl flyer pages are images; text covers only a few products | Use tanszykoszyk.pl / blix search first; mark partial reads in `uwagi` |
| kaufland.pl 403, lidl.pl "Header overflow", JS-only prices on delikatesy.pl | Regular prices usually need a real browser (Playwright) — report as missing |
| Flyer PDFs >10 MB, `curl` denied | Check permissions in Phase 0 |
| Biedronka 18,99 zł/kg came from one aggregator, Monday only | Single-source or unusual values get `pewnosc=niska` and a note |
| Branch was switched by another session before `git switch -c` | Check the current branch right before creating a branch or committing |
