# Czy język promptu zmienia jakość pracy LLM? Polski, języki słowiańskie i angielski

*Raport badawczy, stan na 24.11.2026. English version: [report-en.md](report-en.md).*

## TL;DR

1. **Źródło artykułu cryps.pl** to praca *One ruler to measure them all* (OneRuler; Kim, Russell, Karpińska, Iyyer; University of Maryland, Microsoft, UMass Amherst; arXiv 2503.01996, zaprezentowana na COLM 2025).
2. **Polski wygrał tylko w jednym, wąskim teście:** w wyszukiwaniu „igły w stogu siana” w kontekście 64K–128K tokenów, ze średnią ze wszystkich modeli. Polski uzyskał 88%, a angielski 83,9% (6. miejsce na 26 języków).
3. **Autorzy sami dementują nagłówki.** Marzena Karpińska (PAP, 27.11.2025): na podstawie badania „nie można stwierdzić, że polski jest najlepszym językiem do promptowania”. Według PAP różnice PL–EN nie były istotne statystycznie. Badanie w ogóle nie dotyczyło promptowania.
4. **Nowsze dane (2025–2026) nie potwierdzają ogólnej przewagi polskiego.** W porównaniach tego samego modelu na tym samym zadaniu najmocniejsze modele (GPT-4o, GPT-5, Gemini 2.5) radzą sobie w językach słowiańskich prawie tak samo jak po angielsku, różnica wynosi zwykle ±3 pkt. Słabsze i mniejsze modele tracą wyraźnie: do 13 pkt dla polskiego i 8 pkt dla rosyjskiego.
5. **Język wpływa na rozumowanie, ale głównie przez *rozumienie* wejścia, a nie przez samą logikę.** Modele rozumujące domyślnie „myślą” po angielsku lub chińsku. Wymuszenie rozumowania w języku natywnym obniża wynik z matematyki (do 26,8% w jednym z modeli). Przetłumaczenie trudnych ~20% wejść odzyskuje prawie cały dystans.
6. **Polski jest droższy w tokenach.** Popularne tokenizery potrzebują 2,2–2,8 tokena na polskie słowo wobec ~1,2 dla angielskiego. Okno kontekstu mieści więc mniej polskiego tekstu, a ta sama treść kosztuje więcej.

## 1. Źródło artykułu i co naprawdę zmierzono

| Element | Artykuł cryps.pl (25.10.2025) | Publikacja źródłowa (zweryfikowane) |
|---|---|---|
| Zadanie | „AI mówi po polsku”, ogólna przewaga | 5 wariantów NIAH (wyszukiwanie) i 2 zadania agregacji (CWE) w długim kontekście |
| Wynik PL | 88% | 88%, średnia ze wszystkich modeli dla 64K i 128K, tylko zadania NIAH |
| Wynik EN | „niespełna 84%” | 83,9%, 6. miejsce na 26 |
| Chiński | 62,1% | 62,1%, 4. miejsce od końca |
| Modele | Gemini 1.5 Flash, „Llama 3”, „Qwen2.5” | Qwen 2.5 (7B, 72B), Llama 3.1 8B, Llama 3.3 70B, Gemini 1.5 Flash, o3-mini-high (DeepSeek-R1 tylko w EN) |
| Zastrzeżenia | brak | różne tokenizery, dobór książek per język, opcja „brak odpowiedzi” |

**Inne zweryfikowane liczby z OneRuler:**

- **o3-mini-high przy 128K:** 92% po polsku, 89% po ukraińsku, tylko 67% po angielsku.
- **Rozjazd między 5 najlepszymi i 5 najsłabszymi językami (według rozmiaru Wikipedii)** rośnie z 11% przy 8K do 34% przy 128K.
- **Dodanie do promptu możliwości odpowiedzi „brak igły”** obniża S-NIAH po angielsku o 32% przy 128K.
- **Język instrukcji** zmienia wynik nawet o 20%. Instrukcja po angielsku przy kontekście koreańskim podnosi wynik z 61% do 77% (128K). Instrukcja po koreańsku przy kontekście angielskim obniża go z 91% do 71% (64K).

**Rozbieżności w artykule cryps.pl:**

- Nagłówek uogólnia 4-punktową różnicę w jednym typie zadania na „AI mówi po polsku”.
- Pominięto o3-mini-high, czyli model, w którym różnica jest największa.
- Wersje modeli są podane nieprecyzyjnie.
- Brakuje zastrzeżeń autorów.
- Wyjaśnienie „bo polska gramatyka jest złożona” to spekulacja dziennikarza, nie wniosek autorów.

Autorzy sami piszą, że nie wiadomo, czemu chiński wypada tak słabo, i spekulują o braku danych niskozasobowych przy rozszerzaniu kontekstu. PAP wskazuje dodatkowo, że każdy język miał inną książkę jako „stóg siana”: po polsku *Noce i dnie*, po angielsku *Little Women*.

## 2. Długi kontekst i RAG: nowsze badania 2025–2026

| Badanie | Modele | Wynik dotyczący języka |
|---|---|---|
| **Linguistic Nepotism** (Ki i in., arXiv 2509.13930, 2025) | Llama 3.1/3.3, Qwen3, Gemma 3, Aya23 | W RAG modele „często cytują angielskie dokumenty, nawet gdy są nieistotne”. Llama 3.3 70B, trafność cytowania: EN 85,9, RU 74,5 (−11,4), AR 67,3. Suahili traci średnio −23,9 pkt. |
| **Language Bias under Conflicting Information** (Östling, Kurfalı, arXiv 2604.07123, VI 2026) | 12 modeli, w tym GPT-5.2 | Przy sprzecznych informacjach w kontekście informacja po rosyjsku jest „silnie dyskryminowana” względem pozostałych języków (EN, ZH, DE, TR). |
| **DELTA** (Park i in., arXiv 2601.02956, I 2026) | Qwen3-235B, DeepSeek-V3.1, Gemini 2.5 Flash | Preferencja angielskiego w wielojęzycznym RAG to „w dużej mierze efekt rozkładu dowodów”: 73,29% pytań z MKQA ma złotą odpowiedź po angielsku. Nie jest to wrodzona cecha modelu. |
| **MLRBench** (Hengle i in., EACL 2026) | modele wielojęzyczne, 7 języków | Modele efektywnie wykorzystują mniej niż 30% deklarowanego okna kontekstu. |

**Wniosek:** brak badania z 2026 r., które powtórzyłoby wynik „polski > angielski” na nowych modelach (GPT-5.x, Gemini 3, Claude 4.x/5). Nowsze prace o RAG wskazują raczej na preferencję angielskiego oraz na karę dla rosyjskiego. Polski nie był w nich testowany.

## 3. Wiedza i QA: ten sam model, ta sama treść, różne języki

**Polskie egzaminy lekarskie LEK/LDEK** (arXiv 2412.00559, Findings EMNLP 2025). Te same pytania, a wersję angielską przetłumaczyło CEM.

| Model | LEK PL | LEK EN | Δ PL−EN |
|---|---|---|---|
| Llama-3.1-8B | 51,25 | 64,69 | −13,4 |
| Qwen2.5-7B | 51,92 | 67,73 | −15,8 |
| Qwen2.5-72B | 76,87 | 81,93 | −5,1 |
| Llama-3.1-70B | 80,94 | 82,60 | −1,7 |
| gpt-4o-mini | 75,88 | 75,92 | 0,0 |
| GPT-4o | 89,96 | 88,69 | **+1,3** |
| Bielik-11B-v2.2 | 62,36 | 56,98 | **+5,4** |

**CUS-QA: czeski, słowacki, ukraiński** (Uniwersytet Karola, arXiv 2507.22752, v3 II 2026). Pytania o lokalne realia, w języku lokalnym i w tłumaczeniu na angielski.

| Model | CS / EN | SK / EN | UK / EN |
|---|---|---|---|
| GPT-5 | 83,1 / 80,7 | 73,3 / 70,2 | 73,2 / 72,2 |
| Gemini 2.5 Flash | 78,0 / 75,8 | 64,2 / 61,3 | 68,9 / 63,0 |
| Llama 3.3 70B | 60,0 / 63,1 | 47,7 / 48,3 | 52,2 / 54,9 |

**Języki południowosłowiańskie** (Instytut Jožefa Stefana, arXiv 2511.07989, 2025). Różnica macro-F1 między angielskim a średnią dla języków południowosłowiańskich w klasyfikacji sentymentu: GPT-5 0,02, GPT-4o 0,04, Llama 3.3 0,05, Qwen 3 0,07.

**Wniosek:** dla najmocniejszych modeli różnica znika, a przy pytaniach o lokalną wiedzę język lokalny bywa lepszy. Mniejsze modele otwarte wyraźnie tracą poza angielskim.

## 4. Rozumowanie i logika: czy język zmienia poziom „myślenia”?

- **PolyMath** (Qwen/Alibaba, NeurIPS 2025): matematyka w 18 językach, poziom Top, EN vs RU.
  - Llama-3.3-70B: 12,0 vs 6,4.
  - QwQ-32B: 36,8 vs 28,8.
  - Qwen3-235B-Thinking: 40,0 vs 38,4.
  - Gemini 2.5 Pro: 39,2 vs 38,4.
  - DeepSeek-R1: 35,2 vs **37,6**.
  - Autorzy: spójność języka wejścia i wyjścia w modelach rozumujących jest niska i może korelować z wynikiem.
- **Language Matters** (Tam i in., arXiv 2505.17407, 2025): duże modele rozumujące domyślnie rozumują w językach wysokozasobowych. Rozumowanie po angielsku zamiast w języku natywnym dało średnio +26,8% w DeepSeek-R1-Distill-Llama-8B. Wymuszanie języka natywnego szkodzi matematyce, ale pomaga w zadaniach kulturowych.
- **Why Do Multilingual Reasoning Gaps Emerge?** (Kang i in., Findings ACL 2026): luka wynika głównie z błędów *rozumienia* wejścia. Tłumaczenie tylko ~20% wejść daje prawie pełny efekt tłumaczenia wszystkiego (Qwen3-4B).
- **Do Multilingual LLMs Think in English?** (Schut, Gal, Farquhar, 2025): modele podejmują kluczowe decyzje w przestrzeni reprezentacji „najbliższej angielskiemu”, niezależnie od języka wejścia i wyjścia.

**Odpowiedź na pytanie z zadania:** tak, język wpływa na wynik rozumowania, ale (1) efekt maleje wraz z wielkością modelu, a w czołowych modelach rozumujących to zwykle 1–2 pkt, (2) wynika głównie z rozumienia treści, nie z samej logiki, (3) nie ma dowodu, że polski poprawia rozumowanie względem angielskiego.

## 5. Mechanizmy: tokenizacja

Tokeny na słowo dla preambuły Konstytucji RP, PL i oficjalne tłumaczenie EN (arXiv 2604.10799, tabela 1):

| Tokenizer | PL | EN | PL/EN |
|---|---|---|---|
| Llama 3.2 | 2,81 | 1,17 | 2,4× |
| Qwen3 | 2,69 | 1,17 | 2,3× |
| Mistral Small 3.1 | 2,36 | 1,19 | 2,0× |
| Gemma 3 | 2,20 | 1,20 | 1,8× |
| EuroLLM | 1,88 | 1,27 | 1,5× |
| APT4 (polski) | 1,62 | 1,98 | 0,8× |

To jeden tekst, a nie średnia z korpusu, ale kierunek potwierdzają starsze badania. Petrov i in. (NeurIPS 2023) raportują do 15× różnicy między językami. Ahia i in. (EMNLP 2023) piszą, że użytkownicy wielu języków „płacą więcej za gorsze wyniki”.

## 6. Rekomendacje praktyczne

1. **Nie przepisuj promptów na polski „bo lepiej działa”.** Brak dowodu ogólnej przewagi.
2. **Instrukcje systemowe trzymaj po angielsku, a dane i dokumenty w oryginale.** Ten układ dawał najlepsze lub stabilne wyniki w OneRuler i jest zgodny z pracą o selektywnym tłumaczeniu.
3. **Mały lub otwarty model plus polskie dane:** zmierz na własnym zbiorze równoległym (PL i EN). Różnice do 13–16 pkt są realne.
4. **Duży kontekst po polsku:** licz budżet tokenów razy ~2 i nie zakładaj, że model użyje całego okna (MLRBench: <30%).
5. **Wiedza lokalna i kulturowa:** zostaw język natywny. Lokalny język bywa tu lepszy (CUS-QA, Bielik na LEK).

## 7. Luki i ograniczenia

- Brak badań 2026 z polskim na GPT-5.x, Gemini 3 i Claude 4.x/5 w długim kontekście.
- Wyniki per język w OneRuler są dostępne tylko na heatmapie (rysunek 3), bez tabeli liczbowej.
- Global-MMLU (tabele w aneksie) i ZNO-Eval nie zostały odczytane. MMLU-ProX v1 nie zawiera języków słowiańskich.
- Metryki różnych badań nie są wprost porównywalne. Wykres zbiorczy pokazuje kierunek i skalę różnicy, a nie jedną skalę jakości.

## Metodyka

- **Wyszukiwanie:** 6 subagentów Claude Haiku w 6 równoległych wątkach (źródło, RAG i długi kontekst, rozumowanie, benchmarki PL i słowiańskie, tokenizacja, wyszukiwanie po czesku, ukraińsku, rosyjsku, polsku i w językach południowosłowiańskich).
- **Weryfikacja:** 3 osobne przebiegi fact-checkingu z dosłownymi cytatami i wierszami tabel.
- **Odrzucone:** liczby dostępne tylko w streszczeniach lub w prasie oraz jeden cytat, który okazał się parafrazą.

## Źródła

- OneRuler — https://arxiv.org/abs/2503.01996
- PAP / Science in Poland, 27.11.2025 — https://scienceinpoland.pl/en/news/news,110407,polish-language-not-superior-ai-prompting-researchers-say.html
- Artykuł cryps.pl — https://cryps.pl/sztuczna-inteligencja-mowi-po-polsku-nasz-jezyk-zdeklasowal-angielski-w-najnowszym-rankingu/
- LEK/LDEK — https://arxiv.org/abs/2412.00559
- CUS-QA — https://arxiv.org/abs/2507.22752
- Języki południowosłowiańskie — https://arxiv.org/abs/2511.07989
- PolyMath — https://arxiv.org/abs/2504.18428
- Language Matters — https://arxiv.org/abs/2505.17407
- Multilingual Reasoning Gaps — https://arxiv.org/abs/2510.27269
- Think in English? — https://arxiv.org/abs/2502.15603
- Linguistic Nepotism — https://arxiv.org/abs/2509.13930
- Language Bias under Conflicting Information — https://arxiv.org/abs/2604.07123
- DELTA — https://arxiv.org/abs/2601.02956
- MLRBench — https://aclanthology.org/2026.eacl-long.290/
- Tokenizer Bielik v3 / APT4 — https://arxiv.org/abs/2604.10799
- Petrov i in. — https://arxiv.org/abs/2305.15425
- Ahia i in. — https://aclanthology.org/2023.emnlp-main.614
