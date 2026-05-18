# Design Requirements Specification — Advanced Editorial Assistant

**Course:** Software Engineering — Università di Genova, A.Y. 2025/2026
**Project:** Advanced Editorial Assistant (AEA)
**Document version:** 1.0
**Author:** Domantas Moisejevas (sole candidate)
**Date:** 2026-05-14

---

## 1. Introduction

### 1.1 Document scope

This Design Requirements Specification (DRS) explains *how* the
Advanced Editorial Assistant is built. It documents the architecture,
the components, the external interfaces, and the design decisions made
to satisfy the User Requirements in `docs/urs/urs.md`.

The audience is the course instructor (who evaluates the system) and
any future maintainer.

### 1.2 References

- `docs/urs/urs.md` — User Requirements (the "what").
- `src/main/` — implementation.
- `src/tests/` — test harness.
- LanguageTool HTTP API: https://languagetool.org/http-api/swagger-ui/
- Google Apps Script reference: https://developers.google.com/apps-script

### 1.3 Glossary

| Term                | Meaning |
|---------------------|---------|
| Issue               | A single editorial finding (e.g., "Long sentence: 47 words"). |
| Span                | A substring of the document associated with an issue. |
| Category            | One of: repetition, redundancy, clarity, style, consistency, tone. |
| Severity            | One of: low, medium, high. |
| Mode                | One of: `rules` (local) or `online` (LanguageTool). |
| Detector            | A function in `Analysis.gs` that produces issues for one category. |
| Provider            | The actual source of an analysis run: `rules` or `languagetool`. |

---

## 2. System overview

AEA runs as a Google Docs add-on. The user opens the document, opens
the sidebar, picks an analysis mode, and clicks **Analyse**. The
sidebar displays a score card and a categorised list of issues. The
user can navigate to each flagged span in the document, apply a
suggested rewrite, or dismiss the issue.

```
┌───────────────────────────────────────────────────────────────┐
│                      Google Docs (browser)                    │
│                                                               │
│  ┌─────────────────────────┐    ┌───────────────────────────┐│
│  │ Document body           │    │ Editorial Assistant       ││
│  │                         │    │ ─────────────────────────  ││
│  │ <user's text>           │◄──►│ [Rule-based │ LanguageTool]││
│  │                         │    │ [Analyse]                  ││
│  │                         │    │ Score: 64/100              ││
│  │                         │    │                            ││
│  │                         │    │ • Repetition (1)           ││
│  │                         │    │ • Redundancy (4)           ││
│  │                         │    │ • Clarity (2)              ││
│  │                         │    │ • Style (14)               ││
│  └─────────────────────────┘    └───────────────────────────┘│
│                                                               │
│                  ↓ google.script.run                          │
└────────────────────────────┬──────────────────────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │  Apps Script (V8)   │
                  │  Code.gs            │  ← entry + routing
                  │  Analysis.gs        │  ← rule engine
                  └──────────┬──────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
        ┌─────────▼────────┐  ┌─────────▼─────────┐
        │ Local engine     │  │ LanguageTool API  │
        │ (zero network)   │  │ api.languagetool. │
        │                  │  │   org/v2/check    │
        └──────────────────┘  └───────────────────┘
```

---

## 3. Architecture

### 3.1 Components

| # | Component        | File(s)                | Responsibility |
|---|------------------|------------------------|----------------|
| 1 | Add-on entry     | `Code.gs`              | Apps Script wiring: menu, sidebar rendering, server endpoints (`analyzeActiveDocument`, `jumpToSpan`, `replaceSpan`, settings). |
| 2 | Analysis engine  | `Analysis.gs`          | Pure JavaScript rule engine: 6 detectors + scoring + utility tokenisers. Dependency-free; runs unchanged in Apps Script and Node. |
| 3 | Sidebar markup   | `Sidebar.html`         | Static HTML layout (header, mode toggle, score card, issue list, settings). |
| 4 | Sidebar styles   | `Sidebar.css.html`     | CSS, inlined into the rendered sidebar via `include()`. |
| 5 | Sidebar logic    | `Sidebar.js.html`      | Client-side JS: rendering, mode toggle, jump/apply/dismiss, toasts. |
| 6 | Manifest         | `appsscript.json`      | OAuth scopes, runtime version. |
| 7 | Test harness     | `src/tests/run_tests.js` | Node-based regression suite for the rule engine. |

### 3.2 Runtime layering

```
┌─── Browser (Google Docs sidebar) ───────────────────────┐
│  Sidebar.html  +  Sidebar.css.html  +  Sidebar.js.html  │
│  ─ render score / issues / toggles                      │
│  ─ google.script.run.<server-function> bridges          │
└────────────────┬────────────────────────────────────────┘
                 │ (async, sandboxed)
┌────────────────▼────────────────────────────────────────┐
│  Server-side (Apps Script, V8)                           │
│   Code.gs        ─ analyzeActiveDocument,                │
│                    jumpToSpan, replaceSpan,              │
│                    getSettings, setMode                  │
│   Analysis.gs    ─ runAnalysis (rule engine),            │
│                    runs alongside LanguageTool too       │
└────────────────┬────────────────────────────────────────┘
                 │ (HTTPS, only if mode === 'online')
┌────────────────▼────────────────────────────────────────┐
│  External: LanguageTool free public API                  │
│  POST https://api.languagetool.org/v2/check              │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Analysis data flow

```
 user clicks "Analyse"
        │
 google.script.run.analyzeActiveDocument()
        │
 ┌──────▼──────────────────────────────────────────┐
 │ getSettings() → { mode }                        │
 │                                                  │
 │ if mode === 'online':                            │
 │   try _analyzeWithLanguageTool_(text)            │
 │     ├── POST to api.languagetool.org             │
 │     ├── map matches → 6 internal categories      │
 │     └── merge in local repetition + tone + stats │
 │   on error: fall back to runAnalysis(text)       │
 │                + meta.fallback message           │
 │                                                  │
 │ else (mode === 'rules'):                         │
 │   runAnalysis(text)                              │
 │     ├── detectRepetition / detectRedundancy /    │
 │     │   detectClarity / detectStyle /            │
 │     │   detectConsistency / classifyTone         │
 │     └── overallScore({...})                      │
 │                                                  │
 │ → result JSON                                    │
 └──────┬──────────────────────────────────────────┘
        │
 sidebar.renderScore + sidebar.renderIssues
```

---

## 4. Component design

### 4.1 `Code.gs` — entry & routing

Exposes the server endpoints called from the sidebar via
`google.script.run.<fn>`:

| Function                          | Purpose |
|-----------------------------------|---------|
| `onOpen` / `onInstall`            | Install the "Editorial Assistant" menu. |
| `showSidebar`                     | Render `Sidebar.html` into the sidebar slot, 380 px wide. |
| `analyzeActiveDocument`           | Dispatch to LanguageTool or rule engine; return a normalised result envelope. |
| `getSettings` / `setMode`         | Read / write the user's mode preference via `PropertiesService.getUserProperties`. |
| `jumpToSpan(searchText, nth)`     | Move the editor cursor onto the nth occurrence of `searchText` in the document. |
| `replaceSpan(original, repl, nth)`| Replace the nth occurrence of `original` with `repl`. Only called from the Apply button. |
| `runAnalysisOnce`                 | Menu shortcut that runs an analysis and shows the summary in an alert. |

Internal helpers:

- `_analyzeWithLanguageTool_(text)` — HTTP call + response mapping.
- `_normalizeLanguageToolResult_(text, data)` — map LT matches to the internal `Issue` shape.
- `_ltCategoryToOurs_(catId, issType, ruleId)` — collapse ~30 LT categories into our 6.
- `_findAllRanges_(body, text)` — find every occurrence of `text` for cycle-jumping.
- `_addRangeBetween_(...)` — build a `Range` spanning multiple elements, for long sentences that cross paragraph breaks.

### 4.2 `Analysis.gs` — rule engine

Six detectors, each returning `{ issues, stats }` of the same shape so
they're composable.

| Detector                  | URS  | Notes |
|---------------------------|------|-------|
| `detectRepetition`        | FR-04 | Stem-aware; dual-tier threshold (4-in-40 OR 5-in-70 tokens). |
| `detectRedundancy`        | FR-05 | 27 curated pleonasm patterns + intensifier cluster detection. |
| `detectClarityIssues`     | FR-07 | Sentence-length flag (> 45 words) + Flesch reading ease. |
| `detectStyleIssues`       | FR-06 | Intensifier ratio, weak verbs, passive (with adjectival skip list), nominalizations (19 patterns), clichés (17 patterns), filler words (17 words), weak openers ("there is/are/was/were", "it is/was"), sentence-start variety. |
| `detectConsistencyIssues` | FR-08 | Same lowercase term with mismatched capitalisations (e.g., "JavaScript" / "javascript"). |
| `classifyTone`            | FR-09 | Formal vs informal marker counts plus contractions; label ∈ {formal, informal, mixed, neutral}. |

Plus utility:

- `tokenize` — word tokenisation with offsets.
- `splitSentences` — naive sentence splitter on `.`/`!`/`?`.
- `stem` — light English suffix stripping.
- `countSyllables` — vowel-group approximation, used for Flesch.
- `cleanSpan` — single-line, whitespace-normalised span text.
- `truncateAtWord` — word-boundary truncation (for display).
- `overallScore` — severity-weighted 0-100 score.

### 4.3 Sidebar (HTML / CSS / JS)

Sidebar.html declares the markup; the css and js partials are injected
at render time via a `<?!= include('Sidebar.css'); ?>` server tag,
which calls `Code.gs#include` to inline the HTML file's contents.

The JS file is wrapped in an IIFE and:

1. On load, calls `getSettings()` to learn the user's mode preference.
2. Reacts to the mode toggle and persists the choice via `setMode`.
3. Reacts to **Analyse** by calling `analyzeActiveDocument` and
   rendering the response into the score card + issue cards.
4. Reacts to per-issue **Jump** by calling `jumpToSpan` with a cycle
   counter so repeated clicks walk through every occurrence.
5. Reacts to per-issue **Apply** by calling `replaceSpan`. Uses the
   `span.replacement` provided by LanguageTool — no second API call
   needed for the rewrite.
6. Tracks dismissed issues client-side (per-session), with a global
   "↻" restore button.

### 4.4 Test harness (`src/tests/run_tests.js`)

A zero-dependency Node test runner. It loads `Analysis.gs` as plain JS
(Analysis.gs is dependency-free), runs 19 test cases across 5 fixture
documents and several inline strings, and exits non-zero on any
failure. Used both as a regression guard during development and as
documentation of the engine's expected behaviour.

---

## 5. External interfaces

### 5.1 Google Docs (via Apps Script)

| API call                                          | Used by         | Purpose |
|---------------------------------------------------|-----------------|---------|
| `DocumentApp.getActiveDocument().getBody()`       | `analyzeActiveDocument` | Read document text. |
| `Body.findText(regex, [fromRange])`               | `jumpToSpan`, `replaceSpan` | Locate spans. |
| `Document.newRange().addElement(el, s, e)`        | `jumpToSpan`    | Build the selection to highlight. |
| `Document.setSelection(range)`                    | `jumpToSpan`    | Move cursor onto a span. |
| `Element.editAsText().{deleteText,insertText}`    | `replaceSpan`   | In-place edits. |
| `HtmlService.createTemplateFromFile(...)`         | `showSidebar`   | Render the sidebar with server tags. |
| `DocumentApp.getUi().showSidebar(html)`           | `showSidebar`   | Display the sidebar pane. |
| `PropertiesService.getUserProperties()`           | `getSettings`, `setMode` | Persist mode preference. |
| `UrlFetchApp.fetch(url, options)`                 | `_analyzeWithLanguageTool_` | The single outbound HTTPS call. |

### 5.2 LanguageTool

- **Endpoint:** `POST https://api.languagetool.org/v2/check`
- **Auth:** none.
- **Body:** `application/x-www-form-urlencoded` with `text`, `language` (en-US), `level` (`picky`).
- **Limits (free tier):** ~20 KB per request, ~20 requests / minute.
- **Response:** JSON `{ matches: [...] }` where each match has
  `{ message, shortMessage, replacements, offset, length, rule: { id, issueType, category: { id, name } } }`.

### 5.3 OAuth scopes (`appsscript.json`)

| Scope                                                                   | Why |
|-------------------------------------------------------------------------|-----|
| `https://www.googleapis.com/auth/documents.currentonly`                | Read / write the active doc only (least privilege). |
| `https://www.googleapis.com/auth/script.container.ui`                  | Required to render the sidebar. |
| `https://www.googleapis.com/auth/script.external_request`              | Required for `UrlFetchApp` calls to LanguageTool. |
| `https://www.googleapis.com/auth/script.storage`                       | `PropertiesService` access. |

---

## 6. Data model

### 6.1 Issue

The single source of truth across rule-based and LanguageTool modes.
The sidebar UI is identical regardless of provider because every issue
conforms to this shape.

```ts
type Issue = {
  id: string;                                    // stable per (rule, position)
  category: 'repetition' | 'redundancy' | 'clarity'
          | 'style'      | 'consistency'| 'tone';
  severity: 'low' | 'medium' | 'high';
  message: string;                               // ≤ 240 chars
  suggestion?: string;                           // ≤ 320 chars
  span?: {
    text: string;                                // displayed in the quote box
    searchText?: string;                         // used by jumpToSpan if present
    occurrences?: number;                        // repetition: total count
    replacement?: string | null;                 // LanguageTool: one-click Apply target
    start?: number;                              // rule-based offsets
    end?: number;
  };
};
```

### 6.2 Result envelope

```ts
type AnalysisResult = {
  repetition:  { issues: Issue[]; stats: object };
  redundancy:  { issues: Issue[]; stats: object };
  clarity:     { issues: Issue[]; stats: { avgSentenceWords, flesch, sentences } };
  style:       { issues: Issue[]; stats: { passiveCount, intensifierRatio, weakVerbRatio, fillerRatio, adverbRatio, weakOpeners } };
  consistency: { issues: Issue[]; stats: object };
  tone:        { issues: Issue[]; stats: { label, formal, informal, contractions } };

  overall: { score: 0..100; totalIssues: number; verdict: string };

  meta: {
    analyzedAt: string;          // ISO timestamp
    charCount:  number;
    wordCount:  number;
    version:    string;
    provider:   'rules' | 'languagetool';
    fallback?:  string;          // present when online failed and rules ran
    truncated?: string;          // present when input was capped at 18 KB
  };
};
```

---

## 7. URS → DRS → code traceability

| URS    | Design element                                    | Code |
|--------|---------------------------------------------------|------|
| FR-01  | Apps Script add-on manifest                       | `src/main/appsscript.json` |
| FR-02  | V8 JavaScript only; no transpile                  | `src/main/*.gs`, `Sidebar.{html,css.html,js.html}` |
| FR-03  | Server endpoint reads `body.getText()`           | `analyzeActiveDocument` in `Code.gs` |
| FR-04  | Detector with dual-tier window                    | `detectRepetition` in `Analysis.gs` |
| FR-05  | Curated REDUNDANT_PHRASES + LT REDUNDANCY map     | `detectRedundancy`, `_ltCategoryToOurs_` |
| FR-06  | Seven sub-detectors in `detectStyleIssues`         | `Analysis.gs` |
| FR-07  | Sentence-length + Flesch via `countSyllables`     | `detectClarityIssues` |
| FR-08  | Capitalisation mismatch buckets                   | `detectConsistencyIssues` |
| FR-09  | Lexicon-counted label                             | `classifyTone` |
| FR-10  | Severity-weighted deductions, verdict labels      | `overallScore` |
| FR-11  | `Issue.suggestion` + LT `replacements[0]`          | `Sidebar.js.html` Apply button |
| FR-12  | Sidebar HTML mounted via `DocumentApp.showSidebar`| `showSidebar` |
| FR-13  | `findText` + `setSelection` + range builder       | `jumpToSpan` |
| FR-14  | Sidebar's primary "Analyse" button                 | `runBtn` handler in `Sidebar.js.html` |
| FR-15  | Per-card Apply / Dismiss buttons                  | `renderCard` in `Sidebar.js.html` |
| FR-16  | Only `replaceSpan` mutates the doc, only on click | `replaceSpan` |
| FR-17  | Segmented mode toggle, `setMode` persistence       | `mode-rules` / `mode-online` buttons |
| FR-18  | `try/catch` in `analyzeActiveDocument` + fallback note | `meta.fallback` flag rendered as banner |
| NFR-01 | Add-on form factor (no desktop install)            | `Code.gs#onOpen` |
| NFR-02 | Mandated stack only                                | Inspection of `src/main/` |
| NFR-03 | Rule path never reaches `UrlFetchApp`              | Branch in `analyzeActiveDocument` |
| NFR-04 | Pure-JS detectors, no IO                           | `Analysis.gs` |
| NFR-05 | Plain-English messages, semantic HTML              | `Sidebar.{html,js.html}` |
| NFR-06 | Minimum OAuth scopes                               | `appsscript.json` |
| NFR-07 | Self-contained repo + `npm test`                   | `src/package.json`, `src/tests/` |
| NFR-08 | Per-error-code messages                            | `_geminiErrorMessage_` analogue → LT branch |
| NFR-09 | 18 000-char cap + banner                           | `LT_MAX_INPUT_CHARS` + `meta.truncated` |

---

## 8. Design decisions (DDs)

Each DD records a non-obvious choice and the alternatives that were
considered.

### DD-01: Google Apps Script over the Workspace Add-on framework

**Decision:** use Apps Script (V8 runtime, container-bound).
**Alternatives:** Google Workspace Add-on framework (newer, more
flexible runtime).
**Why:** Apps Script is the simplest path that fully satisfies the
mandated stack and the "no extra desktop install" NFR. The Workspace
Add-on framework would have added build complexity without a feature
the URS asks for. The migration path is open if the project is later
published to the Marketplace.

### DD-02: LanguageTool as the "thorough" mode, no LLM

**Decision:** the online mode uses LanguageTool's free public API.
**Alternatives:** Anthropic Claude (paid) or Google Gemini (free tier
but heavy rate-limit + JSON-shape flakiness).
**Why:** LanguageTool returns deterministic, structured matches with
ranked replacement suggestions. The free tier is generous enough for
a single-user developer scenario. LLM-based earlier prototypes were
abandoned after repeated 429 / token-cap / malformed-JSON failures.
History of this decision is recorded in the iteration trail
(see project memory and `urs.md` E-08).

### DD-03: Rule-based mode is always present, even with online mode active

**Decision:** the local rule engine in `Analysis.gs` runs unconditionally.
**Alternatives:** strict "rules OR LanguageTool" branching.
**Why:** rule-based mode provides:
  (a) automatic fallback when LanguageTool errors (NFR-08 / FR-18),
  (b) features LanguageTool does not cover (proximity-aware repetition,
      Flesch reading ease, tone classification, sentence-start variety),
  (c) zero-network operation when the user picks the rules mode (NFR-03).
The cost is one extra in-memory pass per analysis (microseconds for
typical documents).

### DD-04: Lemma-aware repetition detection

**Decision:** stem words via a light English suffix stripper before
counting occurrences.
**Alternatives:** surface-form matching only.
**Why:** writers reuse the same root with different inflections
("meeting / meetings / met"). Stem-based detection catches what a
surface match would miss. The trade-off is occasional false grouping
on irregular forms — accepted because the issue message displays
both the stem and the actual surface forms, so the user can verify.

### DD-05: Dual-tier repetition threshold

**Decision:** flag if `4+ within 40 tokens` OR `5+ within 70 tokens`.
**Alternatives:** single threshold (`3+ within 60` was the initial
version, then `4+ within 40`).
**Why:** single thresholds either over-flagged ordinary prose
(`3+ within 60`) or missed obvious cases like a word repeated 5×
across a 65-token paragraph (`4+ within 40`). The dual-tier rule
recovers recall on the second case without re-introducing false
positives, verified by the
`repetition: spread occurrences NOT flagged` regression test.

### DD-06: Head+tail strategy for long-sentence span selection

**Decision:** when a long-sentence span cannot be matched as a single
regex (`Body.findText` works per-paragraph), find the first 5 words
and the last 5 words separately and build a `Range` that covers
everything between them, walking text elements if they're in different
paragraphs.
**Alternatives:** truncate the span to a 5-word prefix (the original
implementation — but it highlighted only the 5 words, not the full
sentence).
**Why:** this is the only approach that consistently highlights the
*whole* flagged sentence. The walking is bounded by paragraph indices
so it is O(n) in paragraphs between head and tail, which in practice
is 0 or 1.

### DD-07: Per-issue cycling for repetition jumps

**Decision:** for repetition issues, the Jump button cycles through
every occurrence (`Jump 1/5` → `Jump 2/5` → … → `Jump 1/5`).
**Alternatives:** select-all-occurrences in one `Range`; jump to first
only.
**Why:** cycling is the cleanest UX for fixing repetition because the
writer wants to read each occurrence in context. The `nth` argument
to `jumpToSpan` is wrapped server-side so the client just increments
a counter.

### DD-08: Issue shape unified across providers

**Decision:** `_normalizeLanguageToolResult_` maps LanguageTool
matches into the same `Issue` shape the rule engine produces.
**Alternatives:** two parallel renderers, one per provider.
**Why:** keeps the sidebar JS provider-agnostic. Switching modes
re-runs analysis without re-rendering scaffolding. The cost is the
mapping table in `_ltCategoryToOurs_` — small and centralised.

### DD-09: User properties for mode preference (only)

**Decision:** persist only the mode choice (`AEA_MODE`); not the
dismissed issues, not any cached analysis results.
**Alternatives:** per-document dismissal persistence; cache last
analysis result.
**Why:** simplicity. Dismissals are typically session-scoped (the user
moves on). Caching results invites stale state because the document
text can change between sessions. Both are listed as future
enhancements (URS E-03).

---

## 9. Constraints

- **C-01** Mandated stack (URS NFR-02): no TypeScript, no bundlers, no
  CSS preprocessors.
- **C-02** Apps Script's 6-minute server-function timeout. Mitigated
  by the 50 000-char input cap and the 18 000-char LanguageTool cap.
- **C-03** `Body.findText` returns one match at a time and operates
  within a paragraph. The `_findAllRanges_` helper iterates to gather
  all matches; the head+tail strategy (DD-06) bridges paragraph splits.
- **C-04** LanguageTool free-tier rate limit (≈ 20 req/min, ≈ 20 KB
  per request). Surfaced via the "rate-limited" message and the
  truncation banner.
- **C-05** The sidebar runs in a sandboxed iframe; cross-origin
  network calls from client JS are forbidden, which is why all
  LanguageTool traffic is server-side (`UrlFetchApp`).

---

## 10. Future enhancements

Mirrors URS § 6, with design notes:

| URS E# | Design sketch |
|--------|----------------|
| E-01   | Add a language picker to Settings; pass `language` param dynamically; localise rule lexicons. |
| E-02   | Read `DocumentApp.getActiveDocument().getSelection()`; pass selected text to `analyzeActiveDocument`. |
| E-03   | Persist dismissed issue IDs in user properties keyed by `getId() + issue.id`. |
| E-04   | Use `element.editAsText().setBackgroundColor(start, end, '#FFF59D')` per flagged span; clear on next analyse. |
| E-05   | Surface LanguageTool's full `replacements` array as a dropdown next to the Apply button. |
| E-06   | A "style profile" select that toggles different LT rule sets via `enabledCategories` / `disabledCategories` query params. |
| E-08   | LLM mode would be added as a third provider behind the same `_callXxx_` pattern; the structured-output `responseSchema` work is already prototyped. |
| E-10   | Debounced `DocumentApp.installOnEdit` trigger calling `analyzeActiveDocument`; sidebar would refresh on push. |
