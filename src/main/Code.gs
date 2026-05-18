/**
 * Advanced Editorial Assistant — Google Docs add-on entry point.
 *
 * Two analysis modes:
 *   - "rules":  local rule-based engine in Analysis.gs (offline, instant).
 *   - "online": LanguageTool (https://languagetool.org/), a free public
 *               grammar / style / redundancy / clarity checker. No API
 *               key, no signup; 20 req/min on the free public endpoint.
 *
 * LanguageTool returns deterministic structured matches, each with
 * concrete replacement suggestions — so per-issue rewrites are just the
 * replacement, no second API call required.
 *
 * Privacy (R15): "rules" mode is zero-network. "online" mode posts the
 * document text to api.languagetool.org only when the user clicks
 * Analyse. The user can always force "rules" mode via the sidebar.
 */

const ADDON_TITLE = 'Advanced Editorial Assistant';
const MODE_PROP   = 'AEA_MODE'; // 'rules' | 'online' (default: 'online')

const LT_URL              = 'https://api.languagetool.org/v2/check';
const LT_LANGUAGE         = 'en-US';
const LT_LEVEL            = 'picky';      // 'default' or 'picky' (more style hits)
const LT_MAX_INPUT_CHARS  = 18000;        // LT free tier accepts ~20 KB
const LT_MAX_ISSUES       = 80;           // cap to avoid sidebar overload

/* -------------------------------------------------------------------- */
/* Menu / sidebar                                                       */
/* -------------------------------------------------------------------- */

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Editorial Assistant')
    .addItem('Open sidebar', 'showSidebar')
    .addItem('Run analysis (whole doc)', 'runAnalysisOnce')
    .addToUi();
}

function onInstall(e) { onOpen(e); }

function showSidebar() {
  const html = HtmlService
    .createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle(ADDON_TITLE)
    .setWidth(380);
  DocumentApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* -------------------------------------------------------------------- */
/* Settings (mode preference)                                           */
/* -------------------------------------------------------------------- */

function getSettings() {
  const stored = PropertiesService.getUserProperties().getProperty(MODE_PROP);
  const mode = (stored === 'rules' || stored === 'online') ? stored : 'online';
  return { mode: mode };
}

function setMode(mode) {
  if (mode !== 'rules' && mode !== 'online') return { ok: false, reason: 'unknown mode' };
  PropertiesService.getUserProperties().setProperty(MODE_PROP, mode);
  return { ok: true };
}

/* -------------------------------------------------------------------- */
/* Analyse                                                              */
/* -------------------------------------------------------------------- */

function analyzeActiveDocument() {
  let text = DocumentApp.getActiveDocument().getBody().getText() || '';
  const settings = getSettings();

  if (settings.mode === 'online') {
    const truncated = text.length > LT_MAX_INPUT_CHARS;
    const sendText = truncated ? text.slice(0, LT_MAX_INPUT_CHARS) : text;
    try {
      const r = _analyzeWithLanguageTool_(sendText);
      if (truncated) r.meta.truncated = text.length + ' chars; only first ' +
                                        LT_MAX_INPUT_CHARS + ' analysed';
      return r;
    } catch (e) {
      const r = runAnalysis(text);
      r.meta.provider = 'rules';
      r.meta.fallback = 'LanguageTool unavailable: ' + e.message;
      return r;
    }
  }

  const r = runAnalysis(text);
  r.meta.provider = 'rules';
  return r;
}

function _analyzeWithLanguageTool_(text) {
  if (!text || text.trim().length === 0) {
    const r = runAnalysis(text); r.meta.provider = 'languagetool'; return r;
  }
  const resp = UrlFetchApp.fetch(LT_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    muteHttpExceptions: true,
    payload: {
      text: text,
      language: LT_LANGUAGE,
      level: LT_LEVEL
    }
  });
  const code = resp.getResponseCode();
  if (code === 429) throw new Error('rate-limited — LanguageTool free tier is 20 req/min. Wait a minute and try again.');
  if (code === 413) throw new Error('document too large for the free tier (cap is ~20 KB)');
  if (code !== 200) throw new Error('LanguageTool ' + code + ': ' + resp.getContentText().slice(0, 160));

  let data;
  try { data = JSON.parse(resp.getContentText()); }
  catch (e) { throw new Error('LanguageTool returned non-JSON'); }
  return _normalizeLanguageToolResult_(text, data);
}

/**
 * Convert LanguageTool's match list into the same shape the rule engine
 * produces, so the sidebar UI stays identical regardless of provider.
 *
 * LanguageTool has ~30 fine-grained categories. We collapse them into
 * the 6 buckets the URS specifies. Repetition + tone aren't covered by
 * LT, so we run the local rule engine for those two and merge.
 */
function _normalizeLanguageToolResult_(text, data) {
  const result = {
    repetition:  { issues: [], stats: {} },
    redundancy:  { issues: [], stats: {} },
    clarity:     { issues: [], stats: {} },
    style:       { issues: [], stats: {} },
    consistency: { issues: [], stats: {} },
    tone:        { issues: [], stats: {} }
  };

  const matches = Array.isArray(data.matches) ? data.matches.slice(0, LT_MAX_ISSUES) : [];
  matches.forEach(function (match, idx) {
    const ruleId  = (match.rule && match.rule.id) || 'LT';
    const catId   = (match.rule && match.rule.category && match.rule.category.id) || '';
    const issType = (match.rule && match.rule.issueType) || '';
    const cat     = _ltCategoryToOurs_(catId, issType, ruleId);
    const severity = _ltSeverity_(issType, catId);

    const original = text.slice(match.offset, match.offset + match.length);
    const replacement = match.replacements && match.replacements[0] && match.replacements[0].value;

    const message = match.shortMessage || match.message || 'Issue';
    let suggestion = '';
    if (replacement) {
      suggestion = 'Replace with "' + replacement + '"';
    } else if (match.message && match.message !== message) {
      suggestion = match.message;
    }

    result[cat].issues.push({
      id: 'lt-' + ruleId + '-' + match.offset + '-' + idx,
      category: cat,
      severity: severity,
      message: message,
      suggestion: suggestion,
      span: {
        text: original,
        searchText: original,
        replacement: replacement || null
      }
    });
  });

  // LanguageTool doesn't classify lexical repetition or overall tone.
  // The local rule engine does both, so merge them in.
  const local = runAnalysis(text);
  result.repetition.issues = local.repetition.issues;
  result.tone = local.tone;

  // Local clarity / style metric panels (Flesch, sentence length, passive
  // count) are useful regardless of provider.
  result.clarity.stats = local.clarity.stats;
  result.style.stats   = local.style.stats;

  result.overall = overallScore(result);
  result.meta = {
    analyzedAt: new Date().toISOString(),
    charCount: text.length,
    wordCount: tokenize(text).length,
    version: '1.0.0',
    provider: 'languagetool'
  };
  return result;
}

function _ltCategoryToOurs_(catId, issType, ruleId) {
  if (catId === 'REDUNDANCY' || /REDUNDAN/.test(ruleId)) return 'redundancy';
  if (catId === 'STYLE' || catId === 'NONSTANDARD_PHRASES' ||
      catId === 'CREATIVE_WRITING' || catId === 'WIKIPEDIA') return 'style';
  if (catId === 'COLLOQUIALISMS' || catId === 'COLLOQUIALISMS_AGE') return 'tone';
  if (catId === 'REPETITIONS' || catId === 'REPETITIONS_STYLE') return 'repetition';
  if (catId === 'PLAIN_ENGLISH' || catId === 'GRAMMAR' ||
      catId === 'CONFUSED_WORDS' || catId === 'SEMANTICS') return 'clarity';
  if (catId === 'TYPOS' || catId === 'PUNCTUATION' || catId === 'TYPOGRAPHY' ||
      catId === 'CASING' || catId === 'COMPOUNDING' || catId === 'REGIONALISMS') return 'consistency';
  // Fallback by issueType.
  if (issType === 'style')       return 'style';
  if (issType === 'grammar')     return 'clarity';
  if (issType === 'misspelling') return 'consistency';
  return 'style';
}

function _ltSeverity_(issType, catId) {
  if (issType === 'misspelling') return 'high';
  if (issType === 'grammar')     return 'medium';
  if (catId   === 'REDUNDANCY')  return 'medium';
  return 'low';
}

/* -------------------------------------------------------------------- */
/* Cursor navigation — find / cycle / select a flagged span             */
/* -------------------------------------------------------------------- */

function _escapeFlex_(s) {
  return s
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}

function _findAllRanges_(body, searchText) {
  const out = [];
  const pattern = _escapeFlex_(searchText);
  let range = body.findText(pattern);
  while (range) {
    out.push(range);
    range = body.findText(pattern, range);
  }
  return out;
}

function jumpToSpan(searchText, nth) {
  if (!searchText || typeof searchText !== 'string') {
    return { ok: false, reason: 'empty search' };
  }
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const clean = searchText.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return { ok: false, reason: 'empty search' };

  const direct = _findAllRanges_(body, clean);
  if (direct.length > 0) {
    const total = direct.length;
    const target = ((((nth || 1) - 1) % total) + total) % total;
    const r = direct[target];
    const builder = doc.newRange();
    builder.addElement(r.getElement(), r.getStartOffset(), r.getEndOffsetInclusive());
    doc.setSelection(builder.build());
    return { ok: true, occurrence: target + 1, total: total };
  }

  // Head+tail strategy for long sentences that cross paragraph breaks.
  const words = clean.split(' ');
  if (words.length >= 8) {
    const headLen = Math.min(5, Math.floor(words.length / 2));
    const tailLen = Math.min(5, words.length - headLen);
    const head = words.slice(0, headLen).join(' ');
    const tail = words.slice(words.length - tailLen).join(' ');

    const headRange = body.findText(_escapeFlex_(head));
    if (headRange) {
      const tailRange = body.findText(_escapeFlex_(tail), headRange);
      const builder = doc.newRange();
      if (tailRange) {
        _addRangeBetween_(builder, body, headRange, tailRange);
      } else {
        const el = headRange.getElement();
        builder.addElement(el, headRange.getStartOffset(), headRange.getEndOffsetInclusive());
      }
      doc.setSelection(builder.build());
      return { ok: true, occurrence: 1, total: 1, mode: 'head+tail' };
    }
  }

  const prefix = words.slice(0, 5).join(' ');
  if (prefix && prefix !== clean) {
    const r = body.findText(_escapeFlex_(prefix));
    if (r) {
      const builder = doc.newRange();
      builder.addElement(r.getElement(), r.getStartOffset(), r.getEndOffsetInclusive());
      doc.setSelection(builder.build());
      return { ok: true, occurrence: 1, total: 1, mode: 'prefix' };
    }
  }
  return { ok: false, reason: 'not found' };
}

function _addRangeBetween_(builder, body, headRange, tailRange) {
  const headEl = headRange.getElement();
  const tailEl = tailRange.getElement();

  if (headEl === tailEl) {
    builder.addElement(headEl, headRange.getStartOffset(), tailRange.getEndOffsetInclusive());
    return;
  }
  const headText = headEl.asText().getText();
  builder.addElement(headEl, headRange.getStartOffset(), Math.max(0, headText.length - 1));

  const headTop = _topLevelAncestor_(headEl, body);
  const tailTop = _topLevelAncestor_(tailEl, body);
  if (headTop && tailTop && headTop !== tailTop) {
    const fromIdx = body.getChildIndex(headTop);
    const toIdx   = body.getChildIndex(tailTop);
    for (let i = fromIdx + 1; i < toIdx; i++) {
      _addAllTextOfElement_(builder, body.getChild(i));
    }
  }
  builder.addElement(tailEl, 0, tailRange.getEndOffsetInclusive());
}

function _topLevelAncestor_(el, body) {
  let current = el;
  while (current) {
    const parent = current.getParent && current.getParent();
    if (!parent || parent === body) return current;
    current = parent;
  }
  return null;
}

function _addAllTextOfElement_(builder, element) {
  if (!element) return;
  if (element.getType && element.getType() === DocumentApp.ElementType.TEXT) {
    const t = element.asText().getText();
    if (t.length > 0) builder.addElement(element, 0, t.length - 1);
    return;
  }
  if (element.getNumChildren) {
    const n = element.getNumChildren();
    for (let i = 0; i < n; i++) _addAllTextOfElement_(builder, element.getChild(i));
  }
}

/* -------------------------------------------------------------------- */
/* Apply a replacement (R14 — only on explicit user click)              */
/* -------------------------------------------------------------------- */

function replaceSpan(original, replacement, nth) {
  if (!original || replacement === null || replacement === undefined) {
    return { ok: false, reason: 'empty arguments' };
  }
  const body = DocumentApp.getActiveDocument().getBody();
  const clean = original.replace(/\s+/g, ' ').trim();
  const all = _findAllRanges_(body, clean);
  if (all.length === 0) return { ok: false, reason: 'original text not found' };
  const idx = Math.max(0, Math.min(all.length - 1, (nth || 1) - 1));
  const range = all[idx];
  const element = range.getElement();
  if (!element.editAsText) return { ok: false, reason: 'element not editable' };
  const start = range.getStartOffset();
  const end   = range.getEndOffsetInclusive();
  const txt = element.editAsText();
  txt.deleteText(start, end);
  txt.insertText(start, replacement);
  return { ok: true };
}

/* -------------------------------------------------------------------- */
/* Menu shortcut                                                        */
/* -------------------------------------------------------------------- */

function runAnalysisOnce() {
  const r = analyzeActiveDocument();
  const ui = DocumentApp.getUi();
  const providerLabel = r.meta.provider === 'languagetool' ? 'LanguageTool' : 'rule-based';
  ui.alert(
    ADDON_TITLE,
    'Provider: ' + providerLabel + '\n' +
    'Overall quality: ' + r.overall.score + '/100 — ' + r.overall.verdict + '\n\n' +
    'Repetition:  ' + r.repetition.issues.length + '\n' +
    'Redundancy:  ' + r.redundancy.issues.length + '\n' +
    'Clarity:     ' + r.clarity.issues.length +
        (r.clarity.stats.flesch != null ? '  (Flesch ' + r.clarity.stats.flesch + ')' : '') + '\n' +
    'Style:       ' + r.style.issues.length + '\n' +
    'Consistency: ' + r.consistency.issues.length + '\n' +
    'Tone:        ' + r.tone.stats.label + '\n\n' +
    'Open the sidebar for details.',
    ui.ButtonSet.OK
  );
}
