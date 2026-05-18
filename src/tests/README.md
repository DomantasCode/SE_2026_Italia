# Tests

Automated tests for the AEA analysis engine.

## Run

```bash
cd src
npm test
```

Zero npm dependencies. The harness in `run_tests.js` loads
`../main/Analysis.gs` (which is plain V8 JavaScript) and runs it under
Node. Apps Script-specific wrappers (`DocumentApp`, `HtmlService`) are
in `Code.gs` and are never imported here.

## Fixtures and what each one targets

| File                     | Targets        | Expected behaviour |
|--------------------------|----------------|---------------------|
| `sample_problems.txt`    | R4, R5, R6, R7 | Low overall score; repetition of "meeting", redundancy phrases, ≥1 long sentence. |
| `sample_formal.txt`      | R9             | High score (clean text); tone label = `formal`. |
| `sample_informal.txt`    | R9             | Tone label = `informal` or `mixed`; contractions ≥ 1. |
| `sample_passive.txt`     | R6             | At least one passive-voice style issue. |
| `sample_consistency.txt` | R8             | Inconsistent capitalisation flagged for at least one named term. |

## What's covered

- Each detector's main happy path (10 tests).
- Result shape stability (so the sidebar UI can rely on it).
- Empty input edge case.

## What's not covered yet

- Performance on large documents (NFR-04: < 10 s for 5,000 words).
- The Apps Script bridge itself (`Code.gs`, `Sidebar.*`). Manual
  smoke-test instructions live in `../main/README.md`.
- I18N — the engine is currently English-only.
