# User Manual — Advanced Editorial Assistant

For writers and editors. If you want to install the add-on, see
`installation-manual.md`. If you want to extend the code, see
`developer-manual.md`.

---

## 1. What it does

The Advanced Editorial Assistant (AEA) is a Google Docs add-on that
reviews your text the way a human editor would. It flags:

- **Repetition** — the same word family used too often in close range.
- **Redundancy** — pleonasms like *"crucial turning point"* or
  *"absolutely essential"*.
- **Clarity** — long sentences and a Flesch reading-ease score.
- **Style** — passive voice, weak verbs, filler words ("just",
  "really", "honestly"), clichés ("at the end of the day"),
  nominalizations ("make a decision" → "decide"), heavy adverbs,
  weak sentence openers ("There is…"), monotonous sentence-start
  patterns.
- **Consistency** — the same term spelt inconsistently
  ("JavaScript" vs "javascript").
- **Tone** — a high-level label: *formal / informal / mixed / neutral*.

Each issue can be **jumped to** (the cursor moves onto it in the doc),
**applied** (one-click rewrite, when a replacement is offered), or
**dismissed**.

---

## 2. Opening the sidebar

1. In Google Docs, open the menu **Extensions → Editorial Assistant
   → Open sidebar**.
2. The sidebar appears on the right. The first time you open it,
   Google asks for permission — review and click **Allow**.

If the **Editorial Assistant** menu is missing, refresh the document
page. If it's still missing, the add-on isn't installed yet — see
`installation-manual.md`.

---

## 3. Choosing a mode

At the top of the sidebar is a two-way toggle:

| Mode             | What it does                                     | When to use it |
|------------------|--------------------------------------------------|----------------|
| **Rule-based**   | Local engine. Instant. No network calls.         | You're offline; you want guaranteed privacy; you've hit the LanguageTool rate limit. |
| **LanguageTool** | Sends document text to api.languagetool.org. Far more grammar / style rules. | Default — recommended for most cases. |

Your choice is remembered between sessions.

If LanguageTool mode is unavailable for any reason (no network, rate
limit, response error), the engine **automatically** falls back to
rule-based and shows a small warning banner.

---

## 4. Running an analysis

Click the big button at the top of the sidebar. It says either
**Analyse** (rule-based) or **Analyse with LanguageTool** depending on
your mode. While analysing, the button is disabled and a small status
line appears below it.

### Reading the score card

When the analysis completes, a score card appears:

```
   64
   /100
   Mixed — several issues worth addressing.
   146 words · informal tone · Flesch 38.4 · avg sentence 24.3 words · via LanguageTool
```

| Field | Meaning |
|-------|---------|
| **Big number / 100** | Overall textual-quality score. 100 = no issues. |
| **Verdict** | One of: Strong (≥85), Good (≥70), Mixed (≥50), Weak (<50). |
| **Words** | Token count for the analysed text. |
| **Tone** | The detected tone label (informational only). |
| **Flesch** | Reading-ease score 0–100. Higher = easier. |
| **Avg sentence** | Average words per sentence. |
| **via …** | Which engine actually produced the analysis. |

If the document was too large for the online mode, you'll also see a
"truncated" notice — the first ~18,000 characters were analysed.

---

## 5. Filter chips

Below the score card:

```
   [All] [High] [Medium] [Low]   ↻
```

Click a chip to show only issues of that severity. The ↻ button
restores all issues you've previously dismissed.

---

## 6. Issue cards

Each issue is shown as a card:

```
┌──────────────────────────────────────┐
│ HIGH    Long sentence: 59 words.     │
│                                      │
│   "It is absolutely essential that   │
│    all team members attend this      │
│    meeting, because…"                │  ← click this quote to jump
│                                      │
│   → Split into two or more shorter   │
│     sentences.                       │
│                                      │
│   [Jump]  [Apply]  [Dismiss]         │
└──────────────────────────────────────┘
```

### The buttons

- **Jump** — moves the cursor in the document onto the flagged span.
  For repetition issues (e.g., *"meet" appears 5 times*), the button
  reads **Jump 1/5** the first time, **Jump 2/5** the next, and so on,
  cycling through every occurrence.
- **Apply** — only appears when the issue carries a concrete
  replacement (most LanguageTool issues do; most rule-based issues
  don't). Clicking it rewrites the span in the document immediately.
  Use Google Docs' native **Undo (Ctrl/Cmd+Z)** to revert.
- **Dismiss** — hides the issue from the list for this session. Click
  **↻** in the filter row to restore all dismissed issues.

### The grey quote box

Click the grey monospace box showing the flagged text — same effect as
clicking **Jump**.

---

## 7. Categories explained

| Category    | Bucket colour | Typical messages |
|-------------|---------------|------------------|
| Repetition  | red           | "meet (and variants: meeting, met) appears 5 times in close proximity." |
| Redundancy  | orange        | "Redundant phrase: 'absolutely essential'." |
| Clarity     | green         | "Long sentence: 59 words." / "Flesch reading ease is 38.4 (difficult)." |
| Style       | purple        | "Possible passive voice: 'were proposed'." / "Nominalization: 'make a decision'." |
| Consistency | cyan          | "Inconsistent capitalisation of 'javascript': JavaScript ×1, javascript ×1, Javascript ×1." |
| Tone        | pink          | (Usually informational; only flagged when tone is "mixed".) |

Severity tiers are:

- **HIGH** — definite problems that hurt readability or correctness.
- **MEDIUM** — worth fixing in most cases.
- **LOW** — stylistic suggestions; ignore freely if they conflict with
  your voice.

---

## 8. Settings

Currently there are no user-configurable settings — the toolbar's
gear icon (if visible) is for future use. Mode is the only persisted
preference.

---

## 9. Limits

- The LanguageTool free tier caps each request at ~20 KB. Larger
  documents are truncated; only the first ~18,000 characters are sent.
- The LanguageTool free tier allows ~20 requests per minute. Hitting
  the limit triggers the automatic rule-based fallback.
- Rule-based mode handles documents up to 50,000 characters.
- The engine analyses English (en-US) only.

---

## 10. Troubleshooting

| Symptom | Probable cause | Fix |
|---------|----------------|-----|
| "Editorial Assistant" menu doesn't appear. | Add-on not installed in this document's Apps Script project, or the doc page wasn't refreshed after install. | Refresh the document. Otherwise re-run `onOpen` from the Apps Script editor (see installation manual). |
| Permissions dialog appears every time. | First run only — Google requires explicit consent for the OAuth scopes the add-on requests (current doc, sidebar UI, urlfetch, user properties). | Click **Allow**. After the first time it shouldn't reappear. |
| `⚠ LanguageTool unavailable: rate-limited (retry in 38s) …` | The free-tier per-minute limit was hit (≈ 20 req/min). | Wait the suggested time, switch to Rule-based, or stop clicking *Analyse* repeatedly. |
| `ℹ Document is large: 32414 chars; only first 18000 analysed.` | The LanguageTool 20 KB request cap. | Switch to Rule-based for full-document coverage, or split the document. |
| Apply button replaces the wrong occurrence. | The original text appears more than once and `replaceSpan` picked the first match. | Use Jump first to position the cursor; Apply the change manually if needed. (Future enhancement: pin Apply to the same occurrence the cursor is at.) |
| Score is 100/100 on a document with obvious issues. | The document text is below the engine's thresholds for every detector. | Try the test passage in `installation-manual.md` § Demo to confirm the add-on is working. |
