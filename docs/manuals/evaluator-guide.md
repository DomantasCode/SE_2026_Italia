# Evaluator Guide — Advanced Editorial Assistant

A concise walkthrough for the course instructor (or any reviewer) to
evaluate this project end-to-end in roughly **15 minutes** without
hunting through the repo.

If you want only the working prototype, jump to § 3.
If you want only the documentation chain, jump to § 2.
If you want only the automated test evidence, jump to § 4.

---

## 1. What this project is

A Google Docs add-on that performs editorial-level analysis of the
active document — repetition, redundancy, clarity, style,
consistency, tone — and surfaces issues in a sidebar with click-to-jump
navigation and one-click suggested rewrites.

Mandated stack: JavaScript / HTML / CSS, delivered as a Google Apps
Script add-on (per the *Standard Project* proposal).

Sole candidate: Domantas Moisejevas. All four SE phases delivered.

---

## 2. Reading the documentation chain (5 min)

The deliverables follow the standard process. To verify the chain:

| # | Open                                       | What to check |
|---|--------------------------------------------|---------------|
| 1 | `README.md` (top-level)                    | Project overview, repo layout, phase status. |
| 2 | `docs/phase1/doc1_moisejevas.txt`           | Individual problem summary + general requirements. |
| 3 | `docs/phase1/doc2.txt`                      | Consolidated project summary (solo candidate). |
| 4 | `docs/phase1/doc3_moisejevas.txt`           | Questions per requirement. |
| 5 | `docs/phase1/doc4.txt`                      | Requirements + questions, organised by R-ID. |
| 6 | `docs/phase1/doc5.txt`                      | Same as doc4 plus the client's (= instructor's) answers and a `Change:` line per requirement. |
| 7 | `docs/urs/urs.md`                           | **URS v1.0** — 18 FRs + 9 NFRs with acceptance criteria and a URS → code traceability matrix at § 7. |
| 8 | `docs/drs/drs.md`                           | **DRS v1.0** — architecture diagram, 7 components, 9 design decisions with alternatives, URS → DRS → code matrix at § 7. |

**Spot-check tip:** pick any FR in `urs.md` § 4, follow it to
`drs.md` § 7, then to the named function in `src/main/Analysis.gs` or
`src/main/Code.gs`. Round-trip should be one click each.

---

## 3. Trying the working prototype (5 min)

Two paths. The faster one for evaluation is **B (paste into editor)**.

### Option B — paste into Apps Script editor (no CLI needed)

1. Open a fresh Google Doc.
2. **Extensions → Apps Script** → a new tab opens.
3. Delete the default `Code.gs` file. Paste in
   `src/main/Code.gs`. Save.
4. Click **+ → Script** → name it `Analysis`. Paste `src/main/Analysis.gs`. Save.
5. Click **+ → HTML** three times, naming the files `Sidebar`,
   `Sidebar.css`, `Sidebar.js` (note: no `.html` suffix in the name).
   Paste `src/main/Sidebar.html`, `Sidebar.css.html`,
   `Sidebar.js.html` respectively. Save.
6. **Project Settings (⚙)** → tick **Show "appsscript.json" manifest
   file in editor**. Back to Editor → click `appsscript.json` →
   replace with the content of `src/main/appsscript.json`. Save.
7. Pick `onOpen` from the function dropdown → **▶ Run** →
   **Allow** the OAuth scopes.
8. Switch to the Google Doc tab → refresh.

The **Editorial Assistant** menu appears. **Open sidebar.**

### Demo passage — paste into the doc and click *Analyse*

> There is a meeting tomorrow. There are several items to discuss.
> The meeting will basically focus on future plans for the project.
> It is absolutely essential that all team members attend the
> meeting, because many important decisions will be made during the
> meeting, and the future direction of the project will be determined
> by what is discussed at the meeting in a way that will fundamentally
> reshape how we approach our work going forward over the next several
> quarters.
>
> The team will need to make a decision quickly, give consideration
> to the alternatives, and take into consideration the budget
> constraints. At the end of the day, this is the best of both worlds
> — needless to say, a real game changer.
>
> The project has clearly reached a crucial turning point. The basic
> fundamentals of our approach really need to be reviewed. The team
> is committed to this. The JavaScript code is scattered across
> folders. The javascript tests live elsewhere. The Javascript style
> guide is outdated.

**Expected output** (rule-based mode, ≈ 19/100 — Weak):

| Category    | Approx. issues | Example |
|-------------|----------------|---------|
| Repetition  | 1              | "meet" (and variants: meeting) appears 5× |
| Redundancy  | 4              | absolutely essential, basic fundamentals, future plans, crucial turning point |
| Clarity     | 1–2            | 57-word sentence; Flesch ~ 50 |
| Style       | 12–14          | passive voice, nominalizations, clichés, weak openers, sentence-start variety, filler words |
| Consistency | 1              | "JavaScript / javascript / Javascript" |

In **LanguageTool mode** (toggle at the top of the sidebar) you'll see
even more issues — LT brings ~5000 additional editorial rules.

### What to try in the sidebar

- Click the grey quote box on any issue → cursor jumps to that span in
  the doc.
- On the repetition card (*"meet" appears 5 times*), click **Jump 1/5**
  → button updates to **Jump 2/5** → cursor moves to the next
  occurrence. Cycles through all five and wraps.
- On any LanguageTool issue, click **Apply** → the document is
  rewritten in place. Use Ctrl/Cmd+Z to undo.
- Toggle between **Rule-based** and **LanguageTool** at the top.
  Disable your network connection and click *Analyse* in LT mode →
  the engine automatically falls back to Rule-based with a warning
  banner.

---

## 4. Verifying the test evidence (2 min)

Tests are pure-JS, zero dependencies. From a terminal in the repo:

```bash
cd src
npm test
```

Expected output (verified at v1.2):

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

The test catalogue with URS links is in `docs/manuals/test-report.md`.

---

## 5. Evaluation checklist

A short list mapping the *Standard Project* deliverables to this repo.

| Required deliverable                             | Location |
|--------------------------------------------------|----------|
| Document I — individual problem + requirements   | `docs/phase1/doc1_moisejevas.txt` |
| Document II — consolidated summary               | `docs/phase1/doc2.txt` |
| Document III — questions per requirement         | `docs/phase1/doc3_moisejevas.txt` |
| Document IV — requirements + questions, organised | `docs/phase1/doc4.txt` |
| Document V — questions + client answers          | `docs/phase1/doc5.txt` |
| Document VI — URS (`urs.md`)                     | `docs/urs/urs.md` |
| Design specification (DRS)                       | `docs/drs/drs.md` |
| Working prototype                                | `src/main/` (six files) |
| Test suite + report                              | `src/tests/`, `docs/manuals/test-report.md` |
| User manual                                      | `docs/manuals/user-manual.md` |
| Installation manual                              | `docs/manuals/installation-manual.md` |
| Developer manual                                 | `docs/manuals/developer-manual.md` |
| This guide                                       | `docs/manuals/evaluator-guide.md` |

---

## 6. Notes on the solo submission

The proposal slide "General Rules" allows extended groups of more than
two people; this project was delivered by a sole candidate. To
compensate:

- The candidate produced both the *individual* (Doc I, Doc III) and
  the *consolidated* (Doc II, Doc IV) Phase 1 documents.
- The implementation covers the full URS surface — none of the FRs
  were skipped on the grounds of reduced capacity.
- Two analysis engines (local rule-based + LanguageTool) were
  delivered to demonstrate range, not just to satisfy R5/R11.

If the course expects a strictly group submission, please reach out
and the candidate will adapt — the documents are written so a
two-person group can be reconstructed by editing only `AUTHORS.md`
and the "(working alone)" annotations in Doc II/IV/V.

---

## 7. Contact

Domantas Moisejevas — domantasmoisejevas@gmail.com

Happy to give a live walkthrough on request (Google Meet / Zoom).
