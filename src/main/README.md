# Advanced Editorial Assistant — Google Docs add-on

v0.7 prototype. Built with Google Apps Script (V8 runtime) — JavaScript /
HTML / CSS, the mandated stack.

**AI-first design, free AI:**

- If you save a **Google Gemini API key** in Settings, every analysis
  goes through Gemini (`gemini-2.0-flash`, free tier — 1500 req/day, no
  credit card required). Per-issue ✦ rewrites use Gemini too. Same JSON
  shape as the rule engine, so the UI is identical.
- If there is no key, OR if a Gemini call fails, the engine silently
  falls back to the **local rule-based** engine in `Analysis.gs` and
  surfaces a small warning in the score card.

The "Flesch reading ease", "Avg sentence", and "Passive count" metrics
are always computed locally from the document text — even in AI mode.

## URS coverage

| Req | Status      | Where |
|-----|-------------|-------|
| R1  | ✅ done     | Apps Script add-on (`Code.gs`, `appsscript.json`). |
| R2  | ✅ done     | JavaScript + HTML + CSS only. |
| R3  | ✅ done     | `analyzeActiveDocument` → `body.getText()`. |
| R4  | ✅ done     | `detectRepetition` (lemma-aware, configurable window). |
| R5  | ✅ done     | `detectRedundancy` (34 canonical patterns + intensifier clusters). |
| R6  | ✅ done     | `detectStyleIssues` (intensifier overuse + weak verbs + passive voice). |
| R7  | ✅ done     | `detectClarityIssues` (sentence length + Flesch reading ease). |
| R8  | ✅ done (v0)| `detectConsistencyIssues` (capitalisation variance of named terms). |
| R9  | ✅ done (v0)| `classifyTone` (formal / informal / mixed / neutral via lexicon). |
| R10 | ✅ done     | `overallScore` (severity-weighted; 0–100). |
| R11 | ✅ done     | Each issue carries a built-in `suggestion`; ✨ AI button asks Claude for a concrete rewrite. |
| R12 | ✅ done     | Sidebar lists issues; **clicking the span jumps the cursor in the doc** via `jumpToSpan`. |
| R13 | ✅ done     | "Analyse document" button on demand. |
| R14 | ✅ done     | Per-issue **Dismiss** button + global "restore" (↻). AI rewrites are only written to the doc on explicit "Apply" click. |
| R15 | ✅ done     | Rule-based mode is zero-network. Claude mode requires the user to (a) select the Claude provider and (b) save an Anthropic key. With no key or with the rule-based provider selected, no network call is ever made. |
| R16 | ✅ done     | Plain-English sidebar; jump-by-click; metrics in a single glance. |

## Files

```
src/main/
├── appsscript.json    — Apps Script manifest (scopes, V8 runtime)
├── Code.gs            — server endpoints: analyse, jumpToSpan,
│                        improveText, replaceSpan, key management
├── Analysis.gs        — analysis engine (6 detectors + scoring)
├── Sidebar.html       — sidebar markup
├── Sidebar.css.html   — sidebar styles
└── Sidebar.js.html    — sidebar client-side JS
                         (run / jump / dismiss / AI request / toast)
```

Apps Script note: `*.css.html` and `*.js.html` are HTML files that
contain only a `<style>` or `<script>` tag; `Code.gs#include()` inlines
them into `Sidebar.html` at render time.

## Run it — Option A: clasp (recommended, keeps Git history)

```bash
npm install -g @google/clasp
clasp login

cd src/main
clasp create --type docs --title "Advanced Editorial Assistant"
clasp push
```

Open any Google Doc → **Extensions → Apps Script** → on the linked
project's overflow menu, **Test deployments → Install**. Refresh the
Doc; the **Editorial Assistant** menu appears.

## Run it — Option B: paste into the Apps Script web editor

1. Open any Google Doc → **Extensions → Apps Script**.
2. Delete the auto-generated `Code.gs`.
3. Create one file per file in this folder, matching names exactly
   (`Sidebar.html`, `Sidebar.css.html`, `Sidebar.js.html`, …).
4. Open the manifest (Project Settings → "Show 'appsscript.json'") and
   replace it with the contents of `appsscript.json`.
5. Save (Ctrl/Cmd+S). Run `onOpen` once to authorise the scopes.
6. Refresh the Doc; the menu **Editorial Assistant → Open sidebar** is now
   available.

## Enabling Gemini (one-time setup, ~30 seconds, **free**)

1. Visit <https://aistudio.google.com/apikey> while signed in to your
   Google account → **Create API key** → copy it. (No credit card, no
   billing — Gemini's free tier is 1500 requests/day, way more than a
   student project needs.)
2. Open the sidebar → ⚙️ **Settings** → paste the key → **Save**.
3. The big button changes to **"Analyse with Gemini"** and the mode
   line at the top reads "AI mode · Gemini (free tier)".

The key is stored per-user in Google's encrypted `PropertiesService`
and persists across browser sessions.

To go back to offline rule-based mode, click **Clear** in Settings.

### Privacy

- **Offline mode:** zero network calls.
- **AI mode:** only the analysed document text (or the flagged span,
  for rewrites) is sent to `generativelanguage.googleapis.com`, and
  only when you click *Analyse with Gemini* or *✦ Rewrite*. Nothing
  else is sent.
- The key is **never** in source code; only in your Google account's
  encrypted user-properties store.
- If a Gemini call fails (no key, bad key, quota exhausted, network
  down), the engine silently falls back to rule-based and shows a
  warning in the score card.

## Run the tests (no Google account needed)

```bash
cd src
npm test              # runs node tests/run_tests.js
```

10 fixture-based tests over 5 sample documents
(`tests/sample_problems.txt`, `sample_formal.txt`, `sample_informal.txt`,
`sample_passive.txt`, `sample_consistency.txt`). Zero npm dependencies.

## Known limitations (v0.7)

- Redundancy detection is pattern-based; embedding-based redundancy is
  out of scope for v0.2 (would require an external service, which is
  forbidden by R15 without explicit user opt-in).
- Stemmer is a tiny suffix-stripper, not a real lemmatiser. False
  groupings are possible on irregular forms.
- Passive-voice detector is a regex heuristic; it produces some false
  positives on adjectives ending in -ed.
- Tone classification is lexicon-based and English-only.
- Dismissed issues do not persist across sessions (R14.1 — pending Q14.1).
- `jumpToSpan` jumps to the first occurrence of the literal span text;
  for repeated words, "next occurrence" navigation is a future item.
- AI rewrites depend on a user-supplied API key; with no key, the
  engine falls back to the rule-based provider (no AI rewrites
  available).
- The AI prompt is one-shot; there's no conversational refinement of a
  rewrite. (Future: an "Improve again" loop.)
- Document length is capped at 50 000 characters in AI mode to avoid
  runaway token costs.
