# Test Report — Advanced Editorial Assistant

**Version under test:** v1.2 (rule engine), v1.0 (Apps Script wrapper,
LanguageTool integration).
**Date:** 2026-05-14.
**Author:** Domantas Moisejevas.

---

## 1. Scope

This report documents the testing performed on the Advanced Editorial
Assistant. The system has two testable layers:

| Layer                          | Test method        | Automated? |
|--------------------------------|--------------------|------------|
| Rule engine (`Analysis.gs`)    | Node test harness  | Yes — 19 unit tests |
| Apps Script wrappers (`Code.gs`) | Manual smoke test | No (needs Google Docs runtime) |
| Sidebar UI (`Sidebar.*`)       | Manual smoke test  | No (needs browser) |
| LanguageTool integration       | Manual + retry guard | No |

The rule engine is fully covered. The Apps Script and sidebar layers
are covered by a manual smoke-test checklist (§ 5).

## 2. Automated tests — overview

The test harness is at `src/tests/run_tests.js`. It is zero-dependency
Node JavaScript; the only file it loads is `Analysis.gs`, copied to a
`.js` tempfile and `require`d.

Run the suite from `src/`:

```bash
npm test
```

Exit code 0 if all tests pass, non-zero on any failure.

## 3. Test cases

| # | Test                                              | What it covers                              | URS link |
|---|---------------------------------------------------|---------------------------------------------|----------|
| 1 | `problems sample → low overall score`             | Composite check: score ≤ 70 on a problematic passage. | FR-10 |
| 2 | `repetition: tight 4-occurrence cluster flagged`  | `detectRepetition` tier 1 (4 in 40 tokens). | FR-04 |
| 3 | `repetition: spread occurrences NOT flagged`      | False-positive guard: 4 occurrences over ~100 tokens stay silent. | FR-04 |
| 4 | `problems sample → redundancy of "crucial turning point"` | `detectRedundancy` curated list. | FR-05 |
| 5 | `problems sample → at least one long-sentence clarity warning` | `detectClarityIssues` long-sentence path. | FR-07 |
| 6 | `formal sample → high overall score, formal tone` | `classifyTone` formal classification + scoring sanity. | FR-09, FR-10 |
| 7 | `informal sample → informal tone label`           | `classifyTone` informal classification (contractions etc.). | FR-09 |
| 8 | `passive sample → at least one passive-voice style issue` | `detectStyleIssues` passive heuristic. | FR-06 |
| 9 | `consistency sample → flags inconsistent capitalisation` | `detectConsistencyIssues`. | FR-08 |
| 10 | `style: filler-word overuse flagged`             | Filler-word ratio > 2.5 % triggers. | FR-06 |
| 11 | `style: weak openers ("There is...") flagged`    | Weak-opener detector at ≥ 3 sentences. | FR-06 |
| 12 | `style: adverb overuse flagged`                  | -ly ratio > 6 % triggers. | FR-06 |
| 13 | `repetition: spread 5 occurrences in 70 tokens IS flagged` | `detectRepetition` tier 2 (5 in 70 tokens). | FR-04 |
| 14 | `style: nominalization flagged ("make a decision")` | New nominalization detector. | FR-06 |
| 15 | `style: cliché flagged ("at the end of the day")` | New cliché detector. | FR-06 |
| 16 | `style: sentence-start variety flagged`          | Monotonous opener detector. | FR-06 |
| 17 | `passive false positive ("I am interested") NOT flagged` | False-positive guard for adjectival past-participles. | FR-06 |
| 18 | `empty text → score 100, no issues`              | Edge case. | — |
| 19 | `result shape is stable`                         | API-shape regression: all 8 top-level keys present, `issues` is an array, `wordCount` is a number. | — |

## 4. Latest run

```
AEA analysis engine — test run

  ✓ PASS  problems sample → low overall score
  ✓ PASS  repetition: tight 4-occurrence cluster flagged
  ✓ PASS  repetition: spread occurrences NOT flagged (no false positive)
  ✓ PASS  problems sample → redundancy of "crucial turning point"
  ✓ PASS  problems sample → at least one long-sentence clarity warning
  ✓ PASS  formal sample → high overall score, formal tone
  ✓ PASS  informal sample → informal tone label
  ✓ PASS  passive sample → at least one passive-voice style issue
  ✓ PASS  consistency sample → flags inconsistent capitalisation
  ✓ PASS  style: filler-word overuse flagged
  ✓ PASS  style: weak openers ("There is...") flagged
  ✓ PASS  style: adverb overuse flagged
  ✓ PASS  repetition: spread 5 occurrences in 70 tokens IS flagged (dual-tier)
  ✓ PASS  style: nominalization flagged ("make a decision")
  ✓ PASS  style: cliché flagged ("at the end of the day")
  ✓ PASS  style: sentence-start variety flagged
  ✓ PASS  passive false positive ("I am interested") NOT flagged
  ✓ PASS  empty text → score 100, no issues
  ✓ PASS  result shape is stable

19 passed, 0 failed
```

## 5. Manual smoke-test checklist

To be performed in Google Docs after every install / re-paste.

**Setup**

- [ ] Open a Google Doc.
- [ ] Open the sidebar (Extensions → Editorial Assistant → Open sidebar).
- [ ] First-time consent: approve the four OAuth scopes.

**Rule-based mode**

- [ ] Toggle is on "Rule-based"; mode line reads "Rule-based · offline".
- [ ] Paste the demo passage (installation manual § C).
- [ ] Click **Analyse**; score appears within < 1 s.
- [ ] Score is around **19/100 — Weak**.
- [ ] Issue cards are grouped by category.
- [ ] Each card has Jump / Apply (where applicable) / Dismiss buttons.
- [ ] Filter chips work (e.g., click *High* — only high-severity cards remain).
- [ ] ↻ button restores dismissed issues.

**Cursor navigation**

- [ ] Click a repetition issue's quote box → cursor jumps onto the
      first occurrence in the doc.
- [ ] Click **Jump 1/5** → updates to **Jump 2/5**; cursor moves to
      the second occurrence. Repeat until it cycles back to 1/5.
- [ ] Click a Long-sentence clarity issue → the entire long sentence
      is selected (not just the first few words).

**LanguageTool mode**

- [ ] Switch to "LanguageTool" — mode line reads
      "LanguageTool · free, no key".
- [ ] Click **Analyse**; expect 1–3 s round-trip.
- [ ] Stats line includes `via LanguageTool`.
- [ ] Apply works on at least one issue with a replacement.

**Failure modes**

- [ ] Disable network or block api.languagetool.org. Click Analyse →
      banner reads "⚠ LanguageTool unavailable: …"; the rule-based
      result is shown.
- [ ] Re-enable network. Click Analyse → banner disappears.

**Persistence**

- [ ] Pick "Rule-based"; refresh the sidebar; toggle still on
      "Rule-based".

## 6. Performance observations

Hand-measured on the demo passage (164 words):

| Mode             | Wall-clock (typical) |
|------------------|----------------------|
| Rule-based       | < 300 ms             |
| LanguageTool     | 1.0 – 2.5 s          |

NFR-04 ("< 10 s for a 5,000-word document") is met by both modes on
the tested hardware.

## 7. Known limitations

These are tracked in the URS as "future enhancements" and are not
considered bugs:

- The rule engine analyses **English only**. Italian / Spanish / etc.
  return mostly-empty results (URS E-01).
- Dismissed issues do not persist across sessions (URS E-03).
- The Apply button always targets the first occurrence of the
  original text; if the same span appears multiple times in the doc,
  Apply may rewrite the wrong one. The Jump button is the user's
  workaround.

## 8. How to add a new test

See `developer-manual.md` § 3 step 3 for the boilerplate. The harness
exposes:

| Helper                              | Purpose                                  |
|-------------------------------------|------------------------------------------|
| `test(name, fn)`                    | Register a test case. |
| `eq(a, b, msg?)`                    | Strict equality.        |
| `ge(a, b, msg?)`                    | Greater-or-equal.       |
| `le(a, b, msg?)`                    | Less-or-equal.          |
| `truthy(v, msg?)`                   | Asserts `v` is truthy.  |
| `hasCategoryIssue(result, cat, pred, msg?)` | Asserts at least one issue in `result[cat].issues` satisfies `pred`. |
| `load(fixturePath)`                 | Read a fixture file from `src/tests/`.   |

Tests run sequentially; there is no async support (the engine is
synchronous so there's nothing to wait for).
