# User Requirements Specification — Advanced Editorial Assistant

**Course:** Software Engineering — Università di Genova, A.Y. 2025/2026
**Project:** Advanced Editorial Assistant (AEA)
**Document version:** 1.0
**Author:** Domantas Moisejevas (sole candidate)
**Date:** 2026-05-14

---

## Revision history

| Version | Date       | Author              | Changes |
|---------|------------|---------------------|---------|
| 0.1     | 2026-04-28 | D. Moisejevas       | Initial draft skeleton (Phase 1 start). |
| 0.5     | 2026-05-05 | D. Moisejevas       | First pass after client meeting; FR/NFR scaffolded. |
| 1.0     | 2026-05-14 | D. Moisejevas       | Final version — FR/NFR aligned with implementation; priorities and acceptance criteria added. |

---

## 1. Introduction

### 1.1 Document scope

This User Requirements Specification (URS) describes, from the user's
perspective, the behaviour and the constraints of the *Advanced
Editorial Assistant* (AEA). The audience is the course instructor (who
is also the client), the development "team" (sole candidate), and any
future maintainer of the project.

The URS captures *what* the system must do. *How* it is built is
documented in the Design Requirements Specification (`docs/drs/drs.md`).

### 1.2 Definitions and acronyms

| Term       | Definition |
|------------|------------|
| AEA        | Advanced Editorial Assistant — the system specified here. |
| Add-on     | A Google Workspace extension that runs inside Google Docs. |
| Apps Script| Google's JavaScript-based execution environment for add-ons. |
| DRS        | Design Requirements Specification (Phase 2 deliverable). |
| Flesch     | Flesch Reading Ease — a 0-100 readability score; higher = easier. |
| FR         | Functional Requirement. |
| LanguageTool | A free open-source grammar / style proofreading service. |
| LLM        | Large Language Model. |
| NFR        | Non-Functional Requirement. |
| URS        | This document. |

### 1.3 References

- `Standard Project.pdf` — original project proposal (`docs/ref/`).
- `docs/phase1/doc1_moisejevas.txt` — individual problem summary.
- `docs/phase1/doc2.txt` — consolidated project summary.
- `docs/phase1/doc4.txt` — questions per requirement.
- `docs/phase1/doc5.txt` — questions + answers (the inputs to this URS).
- `docs/drs/drs.md` — design document (Phase 2).
- LanguageTool API: https://languagetool.org/http-api/swagger-ui/

---

## 2. System description

### 2.1 Context and motivation

Modern writing tools (Google Docs, Microsoft Word, Grammarly,
LanguageTool, …) provide solid grammar and spell checking. They do
not, however, give writers and editors the deeper, professional-level
feedback that an editorial review usually provides: style, clarity,
consistency, tone, lexical repetition, redundancy in meaning, and
overall textual quality.

The AEA addresses that gap. It is a Google Docs add-on that runs
editorial analysis on the active document and surfaces actionable
issues in a sidebar. It supports two analysis modes:

- **Rule-based** — a local engine implemented in JavaScript inside
  Apps Script. No network calls.
- **LanguageTool** — the same sidebar UI calling the free public
  LanguageTool API; ~5000 curated grammar / style / redundancy rules
  built by linguists.

Selecting a mode is a single click in the sidebar. The rule-based mode
is also the automatic fallback when the online mode is unavailable.

### 2.2 Project objectives

- Provide editorial-level feedback inside Google Docs during the
  writing process.
- Cover style, clarity, consistency, tone, lexical repetition,
  semantic redundancy, and an overall quality score (R5–R10).
- Suggest concrete rewordings where possible, and never modify the
  document without explicit user action (R11, R14).
- Be usable by writers with no technical background (R16).
- Respect the user's text: no network calls without explicit opt-in
  via the mode toggle (R15).

---

## 3. Stakeholders

| Stakeholder         | Interest |
|---------------------|----------|
| Writer (end user)   | Improves the textual quality of what they write. |
| Editor              | Uses AEA as a first automated pass before manual review. |
| Course instructor   | Verifies that the project meets the proposal and the SE process. |
| Sole candidate      | Designs, implements, tests, and documents the system. |

---

## 4. Functional requirements

**Priority codes:** M = Mandatory, D = Desirable, O = Optional,
E = future Enhancement.

| ID    | Requirement                                                                 | Priority | Acceptance criterion |
|-------|-----------------------------------------------------------------------------|----------|----------------------|
| FR-01 | The system shall be installable as a Google Docs add-on.                    | M | Add-on appears under Extensions → Editorial Assistant after install. |
| FR-02 | The system shall be implemented using JavaScript, HTML, and CSS only.      | M | No other languages or compiled output in `src/`. |
| FR-03 | The system shall analyse the text of the active Google Docs document.      | M | "Analyse" reads the body of the active document and produces a result for it. |
| FR-04 | The system shall detect lexical repetition of word families in close proximity. | M | A word appearing 4+ times in a 40-token window (or 5+ in 70 tokens) is flagged. |
| FR-05 | The system shall detect semantic redundancy (pleonasm, wordy connectors). | M | At least 25 curated phrases plus the LanguageTool REDUNDANCY category are flagged. |
| FR-06 | The system shall evaluate stylistic weaknesses.                            | M | Detectors cover intensifier overuse, weak verbs, passive voice, nominalizations, clichés, filler words, weak openers, sentence-start variety. |
| FR-07 | The system shall evaluate clarity (sentence length + Flesch reading ease). | M | Sentences > 45 words flagged; document-level Flesch score displayed. |
| FR-08 | The system shall evaluate consistency of terminology and capitalisation.   | D | At least inconsistent capitalisation of named terms is flagged. |
| FR-09 | The system shall classify the document's overall tone.                    | D | One of {formal, informal, mixed, neutral} is displayed in the metrics row. |
| FR-10 | The system shall produce an overall textual-quality score.                | M | A 0-100 score plus a verdict label appear in the score card. |
| FR-11 | The system shall suggest concrete rewordings.                             | M | Each issue carries a `suggestion`; LanguageTool issues additionally carry a one-click Apply replacement. |
| FR-12 | The system shall present feedback inside Google Docs.                     | M | Sidebar rendered via `DocumentApp.showSidebar`; issue list is in-Docs, not external. |
| FR-13 | Feedback shall include click-to-jump navigation onto flagged spans.       | M | Clicking an issue or its quote selects the corresponding span in the document. |
| FR-14 | The user shall be able to start the analysis on demand.                   | M | "Analyse" button triggers an analysis run for the whole document. |
| FR-15 | The user shall be able to accept (Apply) or dismiss individual suggestions. | M | Per-issue Dismiss button hides the issue; per-issue Apply replaces the span via `replaceSpan`. |
| FR-16 | The system shall not modify the document without explicit user action.    | M | No automatic edits. Only the Apply button performs document mutations. |
| FR-17 | The user shall be able to choose between rule-based and LanguageTool modes. | M | Segmented mode toggle in the sidebar; preference persists in user properties. |
| FR-18 | If the selected mode fails at runtime, the system shall fall back to rule-based and surface a warning. | M | Network failure / rate-limit produces a warning banner; rule-based result is shown. |

---

## 5. Non-functional requirements

| ID     | Requirement                                                                | Priority | Acceptance criterion |
|--------|----------------------------------------------------------------------------|----------|----------------------|
| NFR-01 | The add-on shall run inside Google Docs without local desktop installation. | M | No client-side install required beyond the Apps Script binding. |
| NFR-02 | The implementation shall use the mandated stack: JavaScript, HTML, CSS.    | M | Verified by inspection of `src/main/`. |
| NFR-03 | Rule-based mode shall make zero network calls.                            | M | `UrlFetchApp.fetch` is reached only from the LanguageTool path. |
| NFR-04 | A rule-based analysis pass on a 5,000-word document shall complete in < 1 s. | D | Measured manually on representative samples. |
| NFR-05 | The sidebar shall be usable by a writer with no technical background.     | M | Plain-language messages; no jargon-only UI text. |
| NFR-06 | The add-on shall comply with Google Workspace add-on policies.            | M | Manifest declares only minimum scopes (current-doc, sidebar UI, urlfetch). |
| NFR-07 | The codebase shall be versioned and runnable from a single repo.          | M | `src/` is self-contained; `npm test` runs the offline test suite. |
| NFR-08 | The system shall surface a clear error message on every external-API failure mode (rate-limit, network, malformed response, oversized input). | M | Each failure mode produces a specific user-readable string. |
| NFR-09 | The system shall handle a 20 KB upper bound on LanguageTool requests by truncating with a visible notice. | M | Documents > 18,000 chars are truncated; a "truncated" banner is shown. |

---

## 6. Out of scope / future enhancements (E)

The following items were considered and explicitly deferred:

| ID    | Item |
|-------|------|
| E-01  | Multi-language support (currently en-US only). |
| E-02  | Selection-only analysis (currently whole document only). |
| E-03  | Per-document persistence of dismissed issues across sessions. |
| E-04  | In-text background-color highlighting of flagged spans. |
| E-05  | Multiple ranked rewrite alternatives per issue. |
| E-06  | Style profiles (academic / journalistic / business / creative). |
| E-07  | User-defined target tone with deviation warnings. |
| E-08  | LLM-backed analysis mode (Claude / Gemini integration was prototyped and dropped in favour of LanguageTool). |
| E-09  | Google Workspace Marketplace public listing. |
| E-10  | Automatic re-analysis on document change. |

---

## 7. URS-to-implementation traceability

A full URS-to-DRS-to-code mapping is in `docs/drs/drs.md` § 7. The
table below is a quick orientation only.

| URS | Implemented in |
|-----|----------------|
| FR-01 / NFR-01 / NFR-02 | `src/main/appsscript.json`, Apps Script V8 runtime. |
| FR-03 | `analyzeActiveDocument` in `src/main/Code.gs`. |
| FR-04 | `detectRepetition` in `src/main/Analysis.gs`. |
| FR-05 | `detectRedundancy` + LanguageTool REDUNDANCY category. |
| FR-06 | `detectStyleIssues` (multiple sub-detectors) + LanguageTool STYLE. |
| FR-07 | `detectClarityIssues` (sentence length + Flesch). |
| FR-08 | `detectConsistencyIssues` + LanguageTool TYPOS / CASING. |
| FR-09 | `classifyTone` in `Analysis.gs`. |
| FR-10 | `overallScore` in `Analysis.gs`. |
| FR-11 | `issue.suggestion` field + LanguageTool `replacements[0]`. |
| FR-12 / FR-13 | `Sidebar.html` + `jumpToSpan` in `Code.gs`. |
| FR-14 | "Analyse" button → `runAnalysis` in `Sidebar.js.html`. |
| FR-15 / FR-16 | `replaceSpan` in `Code.gs`, Apply button in `Sidebar.js.html`. |
| FR-17 | `setMode` / `getSettings` + segmented toggle in the sidebar. |
| FR-18 | try/catch around the LanguageTool path in `analyzeActiveDocument`. |
| NFR-03 | The `mode === 'rules'` branch never reaches `UrlFetchApp`. |
| NFR-08 / NFR-09 | Error handling + truncation banner in `_analyzeWithLanguageTool_`. |
