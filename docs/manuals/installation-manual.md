# Installation Manual — Advanced Editorial Assistant

Two installation paths. Pick **A** if you're the developer maintaining
the project; pick **B** if you're an evaluator setting up the add-on
once for a single Google Doc.

---

## A. With clasp (recommended for developers)

`clasp` is Google's command-line tool for managing Apps Script
projects from a local filesystem. It enables proper version control
and quick redeployment.

### A.1 Prerequisites

- Node.js ≥ 18 (`node -v`).
- A Google account with access to Apps Script.

### A.2 First-time setup

```bash
npm install -g @google/clasp
clasp login
```

A browser window opens; sign in to the Google account that will own
the script.

### A.3 Create the Apps Script project

```bash
cd src/main
clasp create --type docs --title "Advanced Editorial Assistant"
```

This creates a new Apps Script project bound to a new container Google
Doc, and writes `.clasp.json` (already in `.gitignore`).

### A.4 Push the code

```bash
clasp push
```

All six source files (`appsscript.json`, `Code.gs`, `Analysis.gs`,
`Sidebar.html`, `Sidebar.css.html`, `Sidebar.js.html`) are uploaded.

### A.5 Bind to a Google Doc

The project clasp created is bound to its own auto-generated Doc.
Open any other Doc and bind manually:

1. Open the target Google Doc.
2. **Extensions → Apps Script** opens the editor.
3. In the Apps Script editor, **Project Settings** (gear icon) →
   **Script ID** — copy it.
4. Locally, edit `.clasp.json` and replace `scriptId` with the copied
   value. Re-run `clasp push`.

For ongoing development, just use `clasp push` after every code
change.

---

## B. With the Apps Script web editor (one-off install, no CLI)

### B.1 Open a Google Doc

Open the Google Doc where you want the add-on available.

### B.2 Open the script editor

**Extensions → Apps Script**. A new browser tab opens with the editor.

### B.3 Paste the source files

The Apps Script editor starts with one file, `Code.gs`. You'll need
six files in total:

| Editor file name   | Source in this repo          |
|--------------------|------------------------------|
| `appsscript.json`  | `src/main/appsscript.json`   |
| `Code.gs`          | `src/main/Code.gs`           |
| `Analysis.gs`      | `src/main/Analysis.gs`       |
| `Sidebar` (HTML)   | `src/main/Sidebar.html`      |
| `Sidebar.css` (HTML) | `src/main/Sidebar.css.html` |
| `Sidebar.js` (HTML)  | `src/main/Sidebar.js.html`  |

Steps:

1. Click the existing `Code.gs`, select all, paste the contents of
   `src/main/Code.gs` from this repo. Save (Ctrl/Cmd+S).
2. Click the **+** next to "Files" → **Script** → name it `Analysis`.
   Paste `src/main/Analysis.gs`. Save.
3. Click **+** → **HTML** → name it `Sidebar`. Paste
   `src/main/Sidebar.html`. Save.
4. Click **+** → **HTML** → name it `Sidebar.css`. Paste
   `src/main/Sidebar.css.html`. Save.
5. Click **+** → **HTML** → name it `Sidebar.js`. Paste
   `src/main/Sidebar.js.html`. Save.
6. Open the manifest (Project Settings → tick **Show "appsscript.json"
   manifest file in editor**). Switch back to the Editor tab. Click
   `appsscript.json`, replace its contents with
   `src/main/appsscript.json` from this repo. Save.

> **Naming matters.** The HTML partials must be called exactly
> `Sidebar`, `Sidebar.css`, `Sidebar.js`. Apps Script does NOT add the
> `.html` extension to the visible name; the file is HTML but its
> editor name is just `Sidebar.css`. The server-side `include()` helper
> in `Code.gs` references these by name.

### B.4 Approve the scopes

1. In the function dropdown at the top of the editor toolbar, pick
   `onOpen`.
2. Click **▶ Run**.
3. A dialog opens asking for permissions. Choose your Google account →
   **Allow** the requested scopes:
   - View and manage *only the current document*.
   - Display third-party content in the sidebar.
   - Connect to an external service (LanguageTool).
   - Allow this application to run when you are not present (required
     for `PropertiesService`).

### B.5 Open the sidebar

1. Switch back to the Google Doc tab.
2. **Refresh the page.**
3. The menu **Editorial Assistant** now appears between *Help* and
   *Extensions* (the exact position varies).
4. **Editorial Assistant → Open sidebar.**

---

## C. Verifying the installation (Demo)

Paste this test passage into the doc and click **Analyse**:

> There is a meeting tomorrow. There are several items to discuss.
> The meeting will basically focus on future plans for the project.
> It is absolutely essential that all team members attend the meeting,
> because many important decisions will be made during the meeting,
> and the future direction of the project will be determined by what
> is discussed at the meeting in a way that will fundamentally reshape
> how we approach our work going forward over the next several
> quarters.
>
> The team will need to make a decision quickly, give consideration to
> the alternatives, and take into consideration the budget
> constraints. At the end of the day, this is the best of both worlds
> — needless to say, a real game changer.
>
> The project has clearly reached a crucial turning point. The basic
> fundamentals of our approach really need to be reviewed. The team is
> committed to this. The JavaScript code is scattered across folders.
> The javascript tests live elsewhere. The Javascript style guide is
> outdated.

**Expected output in rule-based mode** (score around 19/100, "Weak"):

- 1 repetition issue (meeting ×5)
- 4 redundancy issues (absolutely essential / basic fundamentals /
  future plans / crucial turning point)
- 1 clarity issue (57-word sentence)
- 14 style issues (passives, nominalizations, clichés, sentence-start
  variety, weak openers, …)
- 1 consistency issue (JavaScript / javascript / Javascript)

If you see roughly that, the install is good.

In LanguageTool mode you'll see more issues (LT's wider rule database)
plus the same repetition / tone / Flesch readings from the local engine.

---

## D. Uninstalling

In the Apps Script editor for the bound document: **File → Move to
Trash**. That removes the add-on from the document.

To revoke the OAuth scope grant entirely: visit
<https://myaccount.google.com/permissions> and revoke the
"Editorial Assistant" entry.
