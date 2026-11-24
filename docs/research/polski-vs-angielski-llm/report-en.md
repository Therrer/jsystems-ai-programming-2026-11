# Does the prompt language change LLM quality? Polish, Slavic languages and English

*Research report, as of 24 Nov 2026. Wersja polska: [raport-pl.md](raport-pl.md).*

## TL;DR

1. **The source of the cryps.pl article** is *One ruler to measure them all* (OneRuler; Kim, Russell, Karpińska, Iyyer; University of Maryland, Microsoft, UMass Amherst; arXiv 2503.01996, presented at COLM 2025).
2. **Polish won only in one narrow test:** needle-in-a-haystack retrieval at 64K–128K tokens, averaged over all models. Polish scored 88% and English 83.9% (6th of 26 languages).
3. **The authors themselves reject the headlines.** Marzena Karpińska (PAP, 27 Nov 2025): the study does not show "that Polish is the best language for prompting". According to PAP, the PL–EN differences were not statistically significant. The study did not examine prompting at all.
4. **Newer data (2025–2026) does not confirm a general Polish advantage.** In same-model, same-task comparisons, the strongest models (GPT-4o, GPT-5, Gemini 2.5) perform in Slavic languages almost as well as in English, usually within ±3 points. Weaker and smaller models lose clearly: up to 13 points for Polish and 8 points for Russian.
5. **Language affects reasoning, but mostly through *understanding* the input, not the logic itself.** Reasoning models default to "thinking" in English or Chinese. Forcing native-language reasoning lowers math scores (by 26.8% for one model). Translating the hardest ~20% of inputs recovers almost the whole gap.
6. **Polish costs more tokens.** Common tokenizers need 2.2–2.8 tokens per Polish word versus ~1.2 for English. A context window therefore holds less Polish text, and the same content costs more.

## 1. The article's source and what was actually measured

| Item | cryps.pl article (25 Oct 2025) | Primary source (verified) |
|---|---|---|
| Task | "AI speaks Polish", a general advantage | 5 NIAH variants (retrieval) and 2 aggregation tasks (CWE) in long context |
| PL score | 88% | 88%, average over all models at 64K and 128K, NIAH tasks only |
| EN score | "just under 84%" | 83.9%, 6th of 26 |
| Chinese | 62.1% | 62.1%, 4th worst |
| Models | Gemini 1.5 Flash, "Llama 3", "Qwen2.5" | Qwen 2.5 (7B, 72B), Llama 3.1 8B, Llama 3.3 70B, Gemini 1.5 Flash, o3-mini-high (DeepSeek-R1 in EN only) |
| Caveats | none | different tokenizers, book choice per language, the "no answer" option |

**Other verified numbers from OneRuler:**

- **o3-mini-high at 128K:** 92% in Polish, 89% in Ukrainian, only 67% in English.
- **The gap between the top 5 and bottom 5 languages (by Wikipedia size)** grows from 11% at 8K to 34% at 128K.
- **Allowing a "no needle" answer in the prompt** lowers English S-NIAH by 32% at 128K.
- **Instruction language** changes the score by up to 20%. English instructions with a Korean context raise the score from 61% to 77% (128K). Korean instructions with an English context lower it from 91% to 71% (64K).

**Discrepancies in the cryps.pl article:**

- The headline generalizes a 4-point gap in one task type into "AI speaks Polish".
- It omits o3-mini-high, the model with the largest gap.
- Model versions are imprecise.
- The authors' caveats are missing.
- The "because Polish grammar is complex" explanation is the journalist's speculation, not the authors' conclusion.

The authors write that it is unclear why Chinese performs so poorly, and they speculate about missing low-resource data during context extension. PAP also notes that each language used a different book as the "haystack": *Nights and Days* for Polish, *Little Women* for English.

## 2. Long context and RAG: newer studies, 2025–2026

| Study | Models | Language finding |
|---|---|---|
| **Linguistic Nepotism** (Ki et al., arXiv 2509.13930, 2025) | Llama 3.1/3.3, Qwen3, Gemma 3, Aya23 | In RAG, models "frequently cite English documents even when they are irrelevant". Llama 3.3 70B citation accuracy: EN 85.9, RU 74.5 (−11.4), AR 67.3. Swahili loses −23.9 points on average. |
| **Language Bias under Conflicting Information** (Östling, Kurfalı, arXiv 2604.07123, Jun 2026) | 12 models, including GPT-5.2 | With conflicting information in context, information in Russian is "strongly dispreferred" compared with the other languages (EN, ZH, DE, TR). |
| **DELTA** (Park et al., arXiv 2601.02956, Jan 2026) | Qwen3-235B, DeepSeek-V3.1, Gemini 2.5 Flash | The English preference in multilingual RAG is "largely a byproduct of evidence distribution": 73.29% of MKQA questions have their gold answer in English. It is not an inherent model trait. |
| **MLRBench** (Hengle et al., EACL 2026) | multilingual models, 7 languages | Models effectively use less than 30% of their claimed context window. |

**Conclusion:** no 2026 study repeats the "Polish > English" result on new models (GPT-5.x, Gemini 3, Claude 4.x/5). Newer RAG work points rather to an English preference and a penalty for Russian. Polish was not tested in those studies.

## 3. Knowledge and QA: same model, same content, different languages

**Polish medical exams LEK/LDEK** (arXiv 2412.00559, Findings of EMNLP 2025). The same questions; the English version was translated by the Polish Medical Examination Center.

| Model | LEK PL | LEK EN | Δ PL−EN |
|---|---|---|---|
| Llama-3.1-8B | 51.25 | 64.69 | −13.4 |
| Qwen2.5-7B | 51.92 | 67.73 | −15.8 |
| Qwen2.5-72B | 76.87 | 81.93 | −5.1 |
| Llama-3.1-70B | 80.94 | 82.60 | −1.7 |
| gpt-4o-mini | 75.88 | 75.92 | 0.0 |
| GPT-4o | 89.96 | 88.69 | **+1.3** |
| Bielik-11B-v2.2 | 62.36 | 56.98 | **+5.4** |

**CUS-QA: Czech, Slovak, Ukrainian** (Charles University, arXiv 2507.22752, v3 Feb 2026). Questions about local facts, in the local language and translated into English.

| Model | CS / EN | SK / EN | UK / EN |
|---|---|---|---|
| GPT-5 | 83.1 / 80.7 | 73.3 / 70.2 | 73.2 / 72.2 |
| Gemini 2.5 Flash | 78.0 / 75.8 | 64.2 / 61.3 | 68.9 / 63.0 |
| Llama 3.3 70B | 60.0 / 63.1 | 47.7 / 48.3 | 52.2 / 54.9 |

**South Slavic languages** (Jožef Stefan Institute, arXiv 2511.07989, 2025). Macro-F1 gap between English and the South Slavic average for sentiment classification: GPT-5 0.02, GPT-4o 0.04, Llama 3.3 0.05, Qwen 3 0.07.

**Conclusion:** for the strongest models the gap disappears, and for questions about local knowledge the local language is sometimes better. Smaller open models lose clearly outside English.

## 4. Reasoning and logic: does language change the level of "thinking"?

- **PolyMath** (Qwen/Alibaba, NeurIPS 2025): math in 18 languages, Top level, EN vs RU.
  - Llama-3.3-70B: 12.0 vs 6.4.
  - QwQ-32B: 36.8 vs 28.8.
  - Qwen3-235B-Thinking: 40.0 vs 38.4.
  - Gemini 2.5 Pro: 39.2 vs 38.4.
  - DeepSeek-R1: 35.2 vs **37.6**.
  - The authors: input-output language consistency in reasoning models is low and may correlate with performance.
- **Language Matters** (Tam et al., arXiv 2505.17407, 2025): large reasoning models default to reasoning in high-resource languages. Reasoning in English instead of the native language gave an average +26.8% for DeepSeek-R1-Distill-Llama-8B. Forcing native-language reasoning hurts math but helps cultural tasks.
- **Why Do Multilingual Reasoning Gaps Emerge?** (Kang et al., Findings of ACL 2026): the gap comes mainly from failures to *understand* the input. Translating only ~20% of inputs gives almost the full effect of translating everything (Qwen3-4B).
- **Do Multilingual LLMs Think in English?** (Schut, Gal, Farquhar, 2025): models make key decisions in a representation space "closest to English", regardless of input and output language.

**Answer to the research question:** yes, language affects reasoning results, but (1) the effect shrinks with model size, and in top reasoning models it is usually 1–2 points, (2) it comes mainly from understanding the content, not from the logic itself, and (3) there is no evidence that Polish improves reasoning compared with English.

## 5. Mechanisms: tokenization

Tokens per word for the preamble of the Polish Constitution, PL and the official EN translation (arXiv 2604.10799, Table 1):

| Tokenizer | PL | EN | PL/EN |
|---|---|---|---|
| Llama 3.2 | 2.81 | 1.17 | 2.4× |
| Qwen3 | 2.69 | 1.17 | 2.3× |
| Mistral Small 3.1 | 2.36 | 1.19 | 2.0× |
| Gemma 3 | 2.20 | 1.20 | 1.8× |
| EuroLLM | 1.88 | 1.27 | 1.5× |
| APT4 (Polish) | 1.62 | 1.98 | 0.8× |

This is one text, not a corpus average, but older studies confirm the direction. Petrov et al. (NeurIPS 2023) report up to 15× differences between languages. Ahia et al. (EMNLP 2023) write that speakers of many languages are "overcharged while obtaining poorer results".

## 6. Practical recommendations

1. **Do not rewrite your prompts in Polish "because it works better".** There is no evidence of a general advantage.
2. **Keep system instructions in English and data and documents in their original language.** This setup gave the best or stable results in OneRuler and matches the selective-translation study.
3. **Small or open model plus Polish data:** measure on your own parallel set (PL and EN). Gaps of 13–16 points are real.
4. **Large Polish context:** budget about 2× the tokens, and do not assume the model will use the whole window (MLRBench: <30%).
5. **Local and cultural knowledge:** keep the native language. The local language is sometimes better here (CUS-QA, Bielik on LEK).

## 7. Gaps and limitations

- No 2026 study tests Polish long-context performance on GPT-5.x, Gemini 3 or Claude 4.x/5.
- OneRuler's per-language results are available only as a heatmap (Figure 3), without a numeric table.
- Global-MMLU (appendix tables) and ZNO-Eval were not read. MMLU-ProX v1 has no Slavic languages.
- Metrics from different studies are not directly comparable. The summary chart shows the direction and size of each gap, not a single quality scale.

## Method

- **Search:** 6 Claude Haiku subagents in 6 parallel threads (source, RAG and long context, reasoning, Polish and Slavic benchmarks, tokenization, searches in Czech, Ukrainian, Russian, Polish and South Slavic languages).
- **Verification:** 3 separate fact-check passes with verbatim quotes and table rows.
- **Rejected:** numbers available only in summaries or the press, plus one quote that turned out to be a paraphrase.

## Sources

- OneRuler — https://arxiv.org/abs/2503.01996
- PAP / Science in Poland, 27 Nov 2025 — https://scienceinpoland.pl/en/news/news,110407,polish-language-not-superior-ai-prompting-researchers-say.html
- cryps.pl article — https://cryps.pl/sztuczna-inteligencja-mowi-po-polsku-nasz-jezyk-zdeklasowal-angielski-w-najnowszym-rankingu/
- LEK/LDEK — https://arxiv.org/abs/2412.00559
- CUS-QA — https://arxiv.org/abs/2507.22752
- South Slavic languages — https://arxiv.org/abs/2511.07989
- PolyMath — https://arxiv.org/abs/2504.18428
- Language Matters — https://arxiv.org/abs/2505.17407
- Multilingual Reasoning Gaps — https://arxiv.org/abs/2510.27269
- Think in English? — https://arxiv.org/abs/2502.15603
- Linguistic Nepotism — https://arxiv.org/abs/2509.13930
- Language Bias under Conflicting Information — https://arxiv.org/abs/2604.07123
- DELTA — https://arxiv.org/abs/2601.02956
- MLRBench — https://aclanthology.org/2026.eacl-long.290/
- Bielik v3 / APT4 tokenizer — https://arxiv.org/abs/2604.10799
- Petrov et al. — https://arxiv.org/abs/2305.15425
- Ahia et al. — https://aclanthology.org/2023.emnlp-main.614
