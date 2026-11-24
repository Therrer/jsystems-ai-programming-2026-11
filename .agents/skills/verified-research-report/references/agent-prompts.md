# Agent prompt templates

## Research rules (paste into every research prompt)

```
Rules:
- Use WebSearch and WebFetch. Today is <DATE>.
- Verified sources only: arXiv, ACL Anthology, OpenReview, peer-reviewed venues,
  official university, institute or lab pages. Use press only to locate a primary source.
- For every number: URL + verbatim quote or table row (<20 words) + table/figure reference.
- Label each item VERIFIED (read on the page), SNIPPET (search result text only)
  or UNVERIFIED.
- WebFetch returns verbatim text only for the first ~39k characters, and the rest is a
  model summary that can be wrong. On long pages fetch again with `offset`
  and rely only on verbatim text.
- If results are thin, run at least 5 differently phrased searches, including
  in <LANGUAGES>. List the iterations that returned nothing.
- Return structured markdown under ~900 words, ending with a 3–5 bullet synthesis.
```

## Language-diverse search thread

```
Goal: find studies comparing <TOPIC> in <LANGUAGES> vs English on THE SAME MODEL
AND SAME TASK. You MUST run at least 6 search iterations, with queries written in:
1. <language 1>: "<example query>"
2. <language 2>: "<example query>"
...
6. English: "<example query>"
Try to extract per-language numbers from: <list of known multilingual benchmarks>.
Only if you actually read the table values.
<Research rules>
```

## Fact-check template (web-fetch agent, Haiku)

```
Fact-check task. For each claim, fetch the URL (use offset to read the whole
page verbatim; ignore the trailing model summary when it disagrees with the
verbatim text). Answer CONFIRMED / WRONG (give the correct value) / NOT FOUND
with a VERBATIM quote or table row (<25 words). Do not paraphrase from memory.

1. <URL> — <claim with exact numbers>; which table? what exactly is averaged?
2. <URL> — <quote to confirm>; is it verbatim or reporter paraphrase?
...
Return a compact numbered list with verdicts and quotes.
```

Questions worth asking in every fact-check:

- Is the number per model or an average across models?
- Which condition does it refer to (context length, difficulty level, test vs dev split)?
- Does the quote come from the authors or from a reporter's paraphrase?
- Is the venue stated on the paper itself or only in the press?
