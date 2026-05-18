# Source

Implementation of the **Advanced Editorial Assistant** Google Docs add-on.

| Folder   | Content                                       |
|----------|-----------------------------------------------|
| `main/`  | Add-on source (Apps Script / JS / HTML / CSS). |
| `tests/` | Fixture inputs and (future) automated tests.   |

See [`main/README.md`](main/README.md) for the deployment instructions
(via `clasp` or via the Apps Script web editor) and the
URS-requirement-to-code mapping.

## Mandatory tech stack

- JavaScript (Google Apps Script — V8 runtime)
- HTML / CSS
- Google Docs Add-on (`DocumentApp.showSidebar`)

## Status

Prototype v0.7. **All 16 URS requirements implemented.** AI-first
design with a free model: if a Gemini API key is saved, Google Gemini
(`gemini-2.0-flash`, 1500 req/day free) does the full editorial
analysis and the per-issue rewrites. Without a key, or on any Gemini
error, the local rule-based engine takes over automatically — no
manual switching.

Plus: click-to-jump, per-issue dismiss + global restore, ✨ Rewrite
with **Apply to document**, Flesch reading ease, passive voice, weak
verb detection. Node test harness covers the rule engine with 10 tests
over 5 fixture documents.

See [`main/README.md`](main/README.md) for the URS-to-code mapping,
provider setup, and deployment. See [`tests/README.md`](tests/README.md)
for the test suite.
