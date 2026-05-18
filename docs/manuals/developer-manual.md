# Developer Manual — Advanced Editorial Assistant

For anyone who wants to extend, fix, or audit the codebase. If you
only want to use the add-on, read `user-manual.md`. If you only want
to install it once, read `installation-manual.md`.

---

## 1. Repo layout

```
SE_2026_Italia/
├── AUTHORS.md
├── LICENCE.md
├── README.md
├── docs/
│   ├── README.md
│   ├── urs/urs.md           — Phase 1 deliverable VI
│   ├── drs/drs.md           — Phase 2 deliverable
│   ├── manuals/             — Phase 4: user / install / dev / test
│   ├── ref/                 — Course proposal PDF
│   └── phase1/              — Phase 1 documents I–V
└── src/
    ├── package.json
    ├── README.md
    ├── main/
    │   ├── appsscript.json   — Apps Script manifest
    │   ├── Code.gs           — entry point + server endpoints
    │   ├── Analysis.gs       — rule engine (6 detectors + scoring)
    │   ├── Sidebar.html      — sidebar markup
    │   ├── Sidebar.css.html  — sidebar styles
    │   └── Sidebar.js.html   — sidebar client-side logic
    └── tests/
        ├── run_tests.js      — Node test harness
        └── sample_*.txt      — fixtures
```

The DRS (`docs/drs/drs.md`) describes the runtime architecture in
detail. This manual describes the *codebase* — what each file does and
how to change it.

---

## 2. File-by-file

### `src/main/appsscript.json`

Apps Script project manifest. Declares the V8 runtime and the four
OAuth scopes the add-on needs:

| Scope                                                        | Used by |
|--------------------------------------------------------------|---------|
| `…/auth/documents.currentonly`                              | `DocumentApp.getActiveDocument()` |
| `…/auth/script.container.ui`                                | `DocumentApp.getUi().showSidebar()` |
| `…/auth/script.external_request`                            | `UrlFetchApp.fetch(LT_URL, …)` |
| `…/auth/script.storage`                                     | `PropertiesService.getUserProperties()` |

Keep the scope list at the minimum the system uses. Adding a scope
re-triggers the user-consent dialog on next run.

### `src/main/Code.gs`

The Apps Script entry point. All functions called by the sidebar's
`google.script.run.<fn>` must be defined at the top level of this
file (or anywhere in any `.gs` file in the project — they share global
scope).

Public functions (sidebar-facing):

| Function                                | Purpose |
|-----------------------------------------|---------|
| `onOpen` / `onInstall`                  | Add the *Editorial Assistant* menu when the doc opens. |
| `showSidebar`                           | Render `Sidebar.html` in the sidebar slot. |
| `analyzeActiveDocument`                 | Dispatch to LanguageTool or rule engine; return a normalised result. |
| `getSettings` / `setMode`                | Mode preference persistence. |
| `jumpToSpan(searchText, nth)`           | Move the cursor to the nth occurrence of `searchText`. |
| `replaceSpan(original, repl, nth)`      | Replace the nth occurrence of `original` with `repl`. |
| `runAnalysisOnce`                       | Menu shortcut: run analysis and show a summary alert. |

Internal (underscore-prefixed):

| Function                                | Purpose |
|-----------------------------------------|---------|
| `_analyzeWithLanguageTool_(text)`       | POST to LT, return normalised result. |
| `_normalizeLanguageToolResult_(text, data)` | Map LT matches → `Issue[]`. |
| `_ltCategoryToOurs_(catId, issType, ruleId)` | Map LT's ~30 categories into our 6. |
| `_ltSeverity_(issType, catId)`          | Map LT's `issueType` → low / medium / high. |
| `_findAllRanges_(body, text)`           | Return every occurrence of `text` in the body. |
| `_addRangeBetween_(builder, body, head, tail)` | Build a `Range` spanning multiple elements (long sentences). |
| `_topLevelAncestor_(el, body)`          | Walk parents to find the top-level child of the body. |
| `_addAllTextOfElement_(builder, element)` | Recursively add a whole element's text to the range. |
| `_escapeFlex_(s)`                       | Regex-escape + flexible-whitespace transform. |

### `src/main/Analysis.gs`

The rule engine. Dependency-free V8 JavaScript so the same file runs
inside Apps Script *and* under Node (the test harness uses the Node
`module.exports` hook at the bottom of the file).

Detectors (all return `{ issues, stats }`):

| Detector                  | Constants you can tune | Behaviour |
|---------------------------|------------------------|-----------|
| `detectRepetition`        | `REPETITION_TIERS`     | Stem-aware; dual-tier window. |
| `detectRedundancy`        | `REDUNDANT_PHRASES`    | Curated phrase list + intensifier cluster check. |
| `detectClarityIssues`     | `LONG_SENTENCE_WORDS`  | Sentence-length + Flesch. |
| `detectStyleIssues`       | `MAX_*_RATIO`, `*_WORDS`, `*_PHRASES`, `*_FALSE_POSITIVES`, `WEAK_OPENER_RE` | Seven sub-detectors. |
| `detectConsistencyIssues` | —                     | Capitalisation variance. |
| `classifyTone`            | `FORMAL_MARKERS`, `INFORMAL_MARKERS`, `CONTRACTIONS` | Lexicon counting. |

Utilities (referenced from detectors):

- `tokenize(text)` — array of `{ word, raw, start, end }`.
- `splitSentences(text)` — array of `{ text, start, end }`.
- `stem(word)` — light suffix stripper.
- `countSyllables(word)` — vowel-group approximation.
- `cleanSpan(s)` — single-line, whitespace-collapsed, trimmed.
- `truncateAtWord(s, maxLen)` — word-boundary truncation.

The `runAnalysis(text)` function at the bottom calls all six detectors
and returns the full result envelope (see DRS § 6.2).

### `src/main/Sidebar.html`

Static HTML scaffold. Note the two server tags:

```html
<?!= include('Sidebar.css'); ?>
…
<?!= include('Sidebar.js'); ?>
```

These call `Code.gs#include`, which reads the named HTML partial and
inlines its contents. That's how the css and js files end up in the
rendered sidebar.

### `src/main/Sidebar.css.html`

CSS rules wrapped in a single `<style>` tag. Lives as `.html` because
Apps Script's `HtmlService` only knows how to include HTML partials.

### `src/main/Sidebar.js.html`

Client-side logic in an IIFE inside a `<script>` tag. Calls
server-side functions via `google.script.run.<fn>.withSuccessHandler(…).withFailureHandler(…)`.

Key state:

- `dismissed`         — `Set<issueId>` of dismissed items (per-session).
- `cycleIndex`        — `Map<issueId, nextOccurrence>` for the repetition Jump cycle.
- `currentMode`       — `'rules' | 'online'`.

### `src/tests/run_tests.js`

Zero-dependency Node test runner. Copies `Analysis.gs` to a `.js`
tempfile, `require`s it, and runs the test assertions. See § 4 below
on adding tests.

---

## 3. How to add a new rule-based detector

Worked example: adding a "sentence starts with the same word as the
previous sentence" detector.

1. Add the detector function to `Analysis.gs`:

   ```javascript
   function detectAdjacentSentenceOpenerRepeats(text) {
     const issues = [];
     const sentences = splitSentences(text);
     for (let i = 1; i < sentences.length; i++) {
       const a = (sentences[i - 1].text.match(/[A-Za-zÀ-ÿ']+/) || [''])[0].toLowerCase();
       const b = (sentences[i].text.match(/[A-Za-zÀ-ÿ']+/) || [''])[0].toLowerCase();
       if (a && a === b) {
         issues.push({
           id: 'sty-adj-' + sentences[i].start,
           category: 'style',
           severity: 'low',
           message: 'Two consecutive sentences start with "' + a + '".',
           suggestion: 'Vary the opening of the second sentence.',
           span: { text: sentences[i].text.split(' ').slice(0, 6).join(' '),
                   searchText: sentences[i].text }
         });
       }
     }
     return { issues: issues, stats: {} };
   }
   ```

2. If the issue is *not* in one of the existing 6 categories, add a
   new key to the result envelope in `runAnalysis`. Otherwise (as in
   the example, `category: 'style'`), merge into the existing detector
   inside `detectStyleIssues`.

3. Add a test in `run_tests.js`:

   ```javascript
   test('style: two consecutive sentences open the same way', () => {
     const txt = 'The team met. The team adjourned.';
     const r = aea.runAnalysis(txt);
     hasCategoryIssue(r, 'style', i => /consecutive sentences/.test(i.message),
       'expected adjacent-opener issue');
   });
   ```

4. Run `npm test`. Make sure no other test breaks (in particular the
   "no false positive" guards).

5. Update `docs/drs/drs.md` (component design table) and
   `docs/urs/urs.md` (FR-06 acceptance criterion list) if the new
   detector represents a user-visible capability change.

## 4. How to extend the LanguageTool category mapping

If you observe a LanguageTool match category that's being dropped or
mapped to the wrong bucket:

1. In `Code.gs#_ltCategoryToOurs_`, add the new `catId` branch.
2. (Optional) in `_ltSeverity_`, override the default severity for
   that category if the default doesn't fit.
3. Run an analysis against a document that triggers the rule, verify
   the issue lands in the expected sidebar section.

LanguageTool's full category list is at
<https://languagetool.org/development/api/org/languagetool/rules/Categories.html>.

## 5. Running the tests

```bash
cd src
npm test
```

The harness exits non-zero on any failure. There are no external
npm dependencies — the harness only uses Node's `fs` and `path`.

To debug a single test, edit `run_tests.js` and temporarily comment
out the others.

## 6. Code style notes

- **`*.gs` files share a single global scope.** Don't worry about
  imports between them.
- **No ES modules in `.gs`** — Apps Script doesn't support `import` /
  `export` at the file level. The Node-export shim at the bottom of
  `Analysis.gs` is gated behind a `typeof module !== 'undefined'`
  check and is invisible to Apps Script.
- **HTML partial naming:** the editor displays them without the
  `.html` extension. Reference them by their *editor* name in
  `Code.gs#include('Sidebar.css')`, NOT by `'Sidebar.css.html'`.
- **Underscore prefix** marks server-side helpers that should not be
  called from the sidebar via `google.script.run`. (Apps Script does
  not enforce this; convention only.)

## 7. Apps Script quirks to know

- `Body.findText(regex)` returns matches **inside a single text element**.
  Spans that cross a paragraph break must be re-assembled with
  `_addRangeBetween_`. This is the entire reason that helper exists.
- `Body.findText` is regex-based but uses Apps Script's regex flavour;
  some PCRE constructs (lookbehind in particular) don't work. Stick to
  basic regex.
- `setSelection(range)` in newly-rendered sidebars sometimes runs
  before the document is ready; the existing implementation works
  fine because the user triggers it via a click, but if you ever call
  it from `onOpen` you'll need a small delay.
- `PropertiesService.getUserProperties()` quota is generous but not
  unlimited (500 KB per script per user). Store only small strings.
- `UrlFetchApp.fetch` calls count against a daily quota (consumer
  accounts: 20 000 / day). Not a problem in practice.

## 8. Deploying changes

After editing files locally, in `clasp` workflow:

```bash
cd src/main
clasp push
```

In the paste workflow (Installation Manual § B), re-paste only the
files you've changed. The editor preserves files you didn't touch.

If you've changed `appsscript.json` or added a new OAuth scope, run
`onOpen` once from the editor to re-trigger the consent dialog with
the new scope.

## 9. Where to look first when something breaks

| Symptom                          | First file to check |
|----------------------------------|---------------------|
| Sidebar doesn't open             | `Code.gs#showSidebar`, `appsscript.json` scopes |
| Sidebar opens but is blank       | `Sidebar.html` template tags + `Code.gs#include` |
| Analyse button does nothing      | `Sidebar.js.html#runAnalysis`, browser console (View → Developer → JavaScript Console) |
| LanguageTool mode always fails   | `Code.gs#_analyzeWithLanguageTool_` + Apps Script execution log |
| Rule engine missed a real issue  | the relevant detector in `Analysis.gs` + add a test fixture |
| Tests pass locally, sidebar broken | the sidebar uses different functions than the tests cover — likely `Code.gs` issue |
