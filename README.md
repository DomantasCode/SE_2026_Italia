# Advanced Editorial Assistant

Software Engineering project — Università di Genova, A.Y. 2025/2026.
Sole candidate: Domantas Moisejevas.

---

## What it is

A Google Docs add-on that gives writers and editors deeper feedback
than a spellchecker. It flags **repetition**, **redundancy**,
**clarity** (sentence length + Flesch reading ease), **style** (passive
voice, weak verbs, filler words, clichés, nominalizations, weak
openers, sentence-start variety), **consistency** of capitalised
terms, and **tone** (formal / informal / mixed / neutral). It can run
fully offline (the local rule engine in `Analysis.gs`) or use
LanguageTool's free public API for broader grammar / style coverage.

See `docs/manuals/user-manual.md` for screenshots and walkthroughs.

## Mandated tech stack

JavaScript (Apps Script V8) · HTML · CSS · Google Docs add-on.
No other languages. No build step. No bundler. No transpile.

---

## Repository layout

```
.
├── AUTHORS.md
├── LICENCE.md
├── README.md                        — this file
├── docs/
│   ├── README.md                    — documentation index
│   ├── ref/                         — original project proposal PDF
│   ├── phase1/                      — Requirement Engineering (docs I–V)
│   ├── urs/urs.md                   — Phase 1 deliverable VI
│   ├── drs/drs.md                   — Phase 2 design document
│   └── manuals/                     — Phase 4: user / install / dev / test
└── src/
    ├── README.md                    — code-side overview
    ├── package.json                 — npm test entry point
    ├── main/                        — add-on source (6 files)
    └── tests/                       — Node test harness + 5 fixture docs
```

## Project phases (and where each one lives)

| Phase | Deliverable                                         | Status |
|-------|------------------------------------------------------|--------|
| 1     | Documents I–V in `docs/phase1/`, URS in `docs/urs/urs.md` | ✅ complete |
| 2     | DRS in `docs/drs/drs.md`                              | ✅ complete |
| 3     | Implementation in `src/main/`                         | ✅ complete |
| 4     | Manuals + test report in `docs/manuals/`              | ✅ complete |

## Quick start

- **Install the add-on:** `docs/manuals/installation-manual.md`.
- **Use the add-on:** `docs/manuals/user-manual.md`.
- **Run the test suite:** `cd src && npm test` (19 tests, no
  npm dependencies).

## URS-to-code mapping

A full traceability matrix is in `docs/drs/drs.md` § 7. One-line
summary: every functional requirement in `docs/urs/urs.md` is wired
to a specific function in `src/main/Code.gs` or
`src/main/Analysis.gs`.
