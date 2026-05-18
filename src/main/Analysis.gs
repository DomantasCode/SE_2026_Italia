/**
 * Analysis engine for the Advanced Editorial Assistant.
 *
 * Implements:
 *   R4  lexical repetition   -> detectRepetition()
 *   R5  semantic redundancy  -> detectRedundancy()
 *   R6  stylistic weakness   -> detectStyleIssues()  (intensifiers + passive)
 *   R7  clarity              -> detectClarityIssues() (length + Flesch)
 *   R8  consistency          -> detectConsistencyIssues() (capitalisation)
 *   R9  tone                 -> classifyTone() (formal / informal / neutral)
 *   R10 overall score        -> overallScore()
 *
 * All detectors return { issues: Array<Issue>, stats: Object }
 * Issue = {
 *   id, category, severity ('low'|'medium'|'high'),
 *   message, suggestion?, span?: { text, start, end, nth? }
 * }
 *
 * The engine is dependency-free V8 JavaScript; it runs unchanged under
 * Google Apps Script and under Node (used by src/tests/run_tests.js).
 */

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','at','for','with',
  'by','from','as','is','are','was','were','be','been','being','it','its',
  'this','that','these','those','i','you','he','she','we','they','me','him',
  'her','us','them','my','your','his','their','our','if','then','so','not',
  'no','yes','do','does','did','have','has','had','will','would','can',
  'could','should','may','might','must','shall','am','about','into','than',
  'also','just','only','too','some','any','each','every',
  'all','more','most','less','few','many','much','out','up','down','over',
  'under','again','further','here','there','what','which','who','whom',
  'when','where','why','how','because','while','during','before','after'
]);

const INTENSIFIERS = new Set([
  'very','extremely','really','quite','rather','pretty','fairly',
  'somewhat','highly','incredibly','absolutely','truly','utterly',
  'completely','totally','greatly','immensely','particularly','especially'
]);

// Curated list of clear pleonasms only. Legitimate-in-formal-writing
// patterns ("in order to", "due to the fact that") were removed because
// they false-positived on professional prose.
const REDUNDANT_PHRASES = [
  [/\babsolutely essential\b/gi, 'essential'],
  [/\babsolutely necessary\b/gi, 'necessary'],
  [/\bactual fact\b/gi, 'fact'],
  [/\badded bonus\b/gi, 'bonus'],
  [/\badvance warning\b/gi, 'warning'],
  [/\bbasic fundamentals?\b/gi, 'fundamentals'],
  [/\bclose proximity\b/gi, 'proximity'],
  [/\bcollaborate together\b/gi, 'collaborate'],
  [/\bcompletely empty\b/gi, 'empty'],
  [/\bcompletely finished\b/gi, 'finished'],
  [/\bend result\b/gi, 'result'],
  [/\bexact same\b/gi, 'same'],
  [/\bfinal outcome\b/gi, 'outcome'],
  [/\bfree gift\b/gi, 'gift'],
  [/\bfuture plans?\b/gi, 'plans'],
  [/\bgeneral consensus\b/gi, 'consensus'],
  [/\bjoint collaboration\b/gi, 'collaboration'],
  [/\bnew innovation\b/gi, 'innovation'],
  [/\bpast history\b/gi, 'history'],
  [/\brepeat again\b/gi, 'repeat'],
  [/\breturn back\b/gi, 'return'],
  [/\btotally surrounded\b/gi, 'surrounded'],
  [/\btrue facts?\b/gi, 'facts'],
  [/\bunexpected surprise\b/gi, 'surprise'],
  [/\bunintentional mistake\b/gi, 'mistake'],
  [/\bcrucial turning point\b/gi, 'turning point'],
  [/\bvery unique\b/gi, 'unique'],
];

const WEAK_VERBS = new Set([
  'make','makes','made','making',
  'do','does','did','doing',
  'get','gets','got','getting',
  'have','has','had','having',
  'go','goes','went','going',
  'put','puts','putting'
]);

// Tentative / filler words that usually weaken prose.
const FILLER_WORDS = new Set([
  'just','really','actually','basically','literally','simply','quite',
  'rather','perhaps','maybe','somehow','sort','kind','stuff',
  'honestly','frankly','essentially','obviously'
]);

// Sentence-initial patterns that often hide the real subject ("There is
// a problem with X" → "X is a problem"). Detected as a regex applied
// per sentence.
const WEAK_OPENER_RE = /^\s*(there\s+(?:is|are|was|were)|it\s+(?:is|was))\b/i;

// Adjectival past-participles that look like passives to the regex but
// aren't. Filter these from the passive-voice detector to avoid noise
// on sentences like "I am interested in the role" or "She is married".
const PASSIVE_FALSE_POSITIVES = new Set([
  'interested','married','supposed','concerned','prepared','intended',
  'dedicated','committed','excited','surprised','bored','tired','worried',
  'relaxed','confused','disappointed','embarrassed','frustrated','scared',
  'pleased','shocked','satisfied','delighted','aware','willing','ashamed',
  'qualified','convinced','involved','divorced','engaged','retired'
]);

// Nominalizations: a verb hidden behind a "make / give / have / take /
// provide / do + abstract noun" pattern. The replacement column is the
// stronger verb.
const NOMINALIZATION_PHRASES = [
  [/\bmake\s+a\s+decision\b/gi, 'decide'],
  [/\bmake\s+a\s+choice\b/gi, 'choose'],
  [/\bmake\s+an?\s+assumption\b/gi, 'assume'],
  [/\bmake\s+an?\s+announcement\b/gi, 'announce'],
  [/\bmake\s+use\s+of\b/gi, 'use'],
  [/\bmake\s+a\s+recommendation\b/gi, 'recommend'],
  [/\bgive\s+(?:an?\s+)?consideration\s+to\b/gi, 'consider'],
  [/\bgive\s+approval\s+to\b/gi, 'approve'],
  [/\bhave\s+a\s+discussion\b/gi, 'discuss'],
  [/\bhave\s+an?\s+impact\s+on\b/gi, 'affect'],
  [/\bhave\s+a\s+meeting\b/gi, 'meet'],
  [/\btake\s+into\s+consideration\b/gi, 'consider'],
  [/\btake\s+action\b/gi, 'act'],
  [/\bprovide\s+(?:an?\s+)?explanation\b/gi, 'explain'],
  [/\bprovide\s+assistance\s+to\b/gi, 'help'],
  [/\bprovide\s+guidance\b/gi, 'guide'],
  [/\bconduct\s+an?\s+(?:investigation|analysis|review)\b/gi, 'investigate / analyse / review'],
  [/\bperform\s+an?\s+analysis\b/gi, 'analyse'],
  [/\bdo\s+an?\s+investigation\b/gi, 'investigate']
];

// Common English clichés. Tight list — each entry should be one the
// editor recognises instantly. Anything ambiguous stays out.
const CLICHE_PHRASES = [
  /\bat the end of the day\b/gi,
  /\bneedless to say\b/gi,
  /\bin this day and age\b/gi,
  /\bfor what it'?s worth\b/gi,
  /\ball things considered\b/gi,
  /\btip of the iceberg\b/gi,
  /\bthink outside the box\b/gi,
  /\blow[- ]hanging fruit\b/gi,
  /\bat this moment in time\b/gi,
  /\bonly time will tell\b/gi,
  /\bback to (?:the\s+)?drawing board\b/gi,
  /\bbest of both worlds\b/gi,
  /\bgame changer\b/gi,
  /\bmoving forward\b/gi,
  /\bin a nutshell\b/gi,
  /\bwhen all is said and done\b/gi,
  /\blast but not least\b/gi
];

const FORMAL_MARKERS = new Set([
  'moreover','furthermore','hence','therefore','consequently','nevertheless',
  'whereas','thus','accordingly','notwithstanding','heretofore','aforementioned',
  'henceforth','wherein','whereby'
]);

const INFORMAL_MARKERS = new Set([
  'kinda','sorta','gonna','wanna','gotta','yeah','nope','stuff','thing',
  'things','okay','ok','cool','awesome','huge','tons','bunch','lots',
  'totally','basically','literally','honestly'
]);

const CONTRACTIONS = /\b\w+'(?:t|s|re|ve|ll|d|m|em)\b/gi;

/* -------------------------------------------------------------------- */
/* Tokenisation utilities                                               */
/* -------------------------------------------------------------------- */

function tokenize(text) {
  const tokens = [];
  const re = /[A-Za-zÀ-ÿ']+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      word: m[0].toLowerCase(),
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length
    });
  }
  return tokens;
}

// Produce a clean version of a span text that is safe to use as a
// search target inside Google Docs: single-line, trimmed, no ellipsis.
function cleanSpan(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

// Truncate at a word boundary, never mid-word. Returns the truncated
// string + an "elided" flag so callers can render an ellipsis only
// when content was actually dropped.
function truncateAtWord(s, maxLen) {
  if (!s || s.length <= maxLen) return { text: s, elided: false };
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut;
  return { text: safe, elided: true };
}

function splitSentences(text) {
  const sentences = [];
  const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].trim();
    if (t.length > 0) {
      sentences.push({ text: t, start: m.index, end: m.index + m[0].length });
    }
  }
  return sentences;
}

// Light suffix stripping for English; not a real lemmatiser.
function stem(word) {
  if (word.length <= 4) return word;
  const suffixes = ['ingly','edly','ies','ied','ing','ies','ied','ed','es','er','est','ly','s'];
  for (const s of suffixes) {
    if (word.length > s.length + 2 && word.endsWith(s)) {
      return word.slice(0, -s.length);
    }
  }
  return word;
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  // Remove trailing silent e, then count vowel groups.
  word = word.replace(/e$/, '');
  const groups = word.match(/[aeiouy]+/g);
  return groups ? Math.max(1, groups.length) : 1;
}

/* -------------------------------------------------------------------- */
/* R4 — lexical repetition (lemma-aware)                                */
/* -------------------------------------------------------------------- */

// Dual-tier threshold: tight cluster (4 in 40 tokens) or moderate
// spread (5 in 70 tokens). The 5-in-70 tier catches obvious cases
// like a word repeated 5× across a single paragraph without flagging
// ordinary prose where a word recurs every few hundred words.
const REPETITION_TIERS = [
  { count: 4, window: 40 },
  { count: 5, window: 70 }
];

function detectRepetition(text) {
  const tokens = tokenize(text);
  const issues = [];
  const stems = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].word;
    if (w.length <= 3 || STOPWORDS.has(w)) continue;
    const s = stem(w);
    if (!stems.has(s)) stems.set(s, { positions: [], words: new Set() });
    const entry = stems.get(s);
    entry.positions.push(i);
    entry.words.add(w);
  }

  for (const [stemKey, entry] of stems.entries()) {
    let qualifies = false;
    for (const tier of REPETITION_TIERS) {
      if (entry.positions.length < tier.count) continue;
      for (let i = 0; i + tier.count - 1 < entry.positions.length; i++) {
        const window = entry.positions[i + tier.count - 1] - entry.positions[i];
        if (window <= tier.window) { qualifies = true; break; }
      }
      if (qualifies) break;
    }
    if (!qualifies) continue;

    const first = tokens[entry.positions[0]];
    const surfaceList = Array.from(entry.words).join(', ');
    issues.push({
      id: 'rep-' + stemKey + '-' + first.start,
      category: 'repetition',
      severity: entry.positions.length >= 6 ? 'high' : 'medium',
      message: '"' + stemKey + '" (and variants: ' + surfaceList + ') appears ' +
               entry.positions.length + ' times in close proximity.',
      suggestion: 'Vary the wording — use synonyms, pronouns, or restructure.',
      span: {
        text: first.raw,
        searchText: first.raw,
        occurrences: entry.positions.length
      }
    });
  }

  return { issues: issues, stats: { repeatedFamilies: issues.length } };
}

/* -------------------------------------------------------------------- */
/* R5 — semantic redundancy                                             */
/* -------------------------------------------------------------------- */

function detectRedundancy(text) {
  const issues = [];

  for (const [pattern, replacement] of REDUNDANT_PHRASES) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      issues.push({
        id: 'red-' + m.index,
        category: 'redundancy',
        severity: 'medium',
        message: 'Redundant phrase: "' + cleanSpan(m[0]) + '".',
        suggestion: 'Consider "' + replacement + '".',
        span: { text: cleanSpan(m[0]), start: m.index, end: m.index + m[0].length }
      });
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // Intensifier clusters: more than one intensifier in the same sentence.
  const sentences = splitSentences(text);
  for (const s of sentences) {
    const sentTokens = tokenize(s.text);
    const ints = sentTokens.filter(t => INTENSIFIERS.has(t.word));
    if (ints.length >= 2) {
      issues.push({
        id: 'red-int-' + s.start,
        category: 'redundancy',
        severity: 'low',
        message: 'Multiple intensifiers in one sentence: ' +
                 ints.map(t => '"' + t.word + '"').join(', '),
        suggestion: 'Keep at most one intensifier; pick a stronger adjective.',
        span: { text: ints[0].raw, start: s.start + ints[0].start, end: s.start + ints[0].end }
      });
    }
  }

  return { issues: issues, stats: { redundantPhrasesChecked: REDUNDANT_PHRASES.length } };
}

/* -------------------------------------------------------------------- */
/* R6 — stylistic weakness (intensifiers + passive voice + weak verbs)  */
/* -------------------------------------------------------------------- */

// Tightened from 3% to 5%; below 5% is normal prose.
const MAX_INTENSIFIER_RATIO = 0.05;
const MAX_WEAK_VERB_RATIO   = 0.05;
const MAX_FILLER_RATIO      = 0.025; // > 2.5% of words flagged as fillers
const MAX_ADVERB_RATIO      = 0.06;  // > 6% of words ending in -ly
const MAX_WEAK_OPENERS      = 3;     // ≥ 3 sentences starting with "there is" / "it is"

const PASSIVE_RE =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:[a-z]+ly\s+)?([a-z]+(?:ed|en|wn|own|t))\b/gi;

function detectStyleIssues(text) {
  const issues = [];
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { issues: issues, stats: { intensifierRatio: 0, weakVerbRatio: 0, passiveCount: 0 } };
  }

  const intensifiers = tokens.filter(t => INTENSIFIERS.has(t.word));
  const intRatio = intensifiers.length / tokens.length;
  if (intRatio > MAX_INTENSIFIER_RATIO) {
    issues.push({
      id: 'sty-int-ratio',
      category: 'style',
      severity: intRatio > MAX_INTENSIFIER_RATIO * 2 ? 'high' : 'medium',
      message: 'Intensifier overuse: ' + intensifiers.length + '/' + tokens.length +
               ' words (' + (intRatio * 100).toFixed(1) + '%).',
      suggestion: 'Replace intensifier+adjective pairs with stronger single adjectives.'
    });
  }

  const weak = tokens.filter(t => WEAK_VERBS.has(t.word));
  const weakRatio = weak.length / tokens.length;
  if (weakRatio > MAX_WEAK_VERB_RATIO) {
    issues.push({
      id: 'sty-weak-ratio',
      category: 'style',
      severity: 'low',
      message: 'High use of weak verbs (make/do/get/have/...): ' +
               weak.length + ' occurrences.',
      suggestion: 'Prefer specific verbs ("conduct", "achieve", "obtain", ...).'
    });
  }

  // Passive voice (heuristic). Skip common adjectival past-participles
  // ("is interested", "is married") to avoid noise.
  PASSIVE_RE.lastIndex = 0;
  let m;
  let passiveCount = 0;
  while ((m = PASSIVE_RE.exec(text)) !== null) {
    const participle = (m[1] || '').toLowerCase();
    if (PASSIVE_FALSE_POSITIVES.has(participle)) {
      if (m.index === PASSIVE_RE.lastIndex) PASSIVE_RE.lastIndex++;
      continue;
    }
    passiveCount++;
    issues.push({
      id: 'sty-pas-' + m.index,
      category: 'style',
      severity: 'low',
      message: 'Possible passive voice: "' + cleanSpan(m[0]) + '".',
      suggestion: 'Rewrite in the active voice where appropriate.',
      span: { text: cleanSpan(m[0]), start: m.index, end: m.index + m[0].length }
    });
    if (m.index === PASSIVE_RE.lastIndex) PASSIVE_RE.lastIndex++;
  }

  // Nominalizations.
  for (const [pattern, replacement] of NOMINALIZATION_PHRASES) {
    pattern.lastIndex = 0;
    let nm;
    while ((nm = pattern.exec(text)) !== null) {
      issues.push({
        id: 'sty-nom-' + nm.index,
        category: 'style',
        severity: 'low',
        message: 'Nominalization: "' + cleanSpan(nm[0]) + '".',
        suggestion: 'Use the verb form: "' + replacement + '".',
        span: { text: cleanSpan(nm[0]), start: nm.index, end: nm.index + nm[0].length }
      });
      if (nm.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // Clichés.
  for (const pattern of CLICHE_PHRASES) {
    pattern.lastIndex = 0;
    let cm;
    while ((cm = pattern.exec(text)) !== null) {
      issues.push({
        id: 'sty-cliche-' + cm.index,
        category: 'style',
        severity: 'low',
        message: 'Cliché: "' + cleanSpan(cm[0]) + '".',
        suggestion: 'Rephrase in your own words.',
        span: { text: cleanSpan(cm[0]), start: cm.index, end: cm.index + cm[0].length }
      });
      if (cm.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // Filler word ratio.
  const fillers = tokens.filter(function (t) { return FILLER_WORDS.has(t.word); });
  const fillerRatio = fillers.length / tokens.length;
  if (fillers.length >= 3 && fillerRatio > MAX_FILLER_RATIO) {
    const sample = Array.from(new Set(fillers.map(function (t) { return t.word; }))).slice(0, 5);
    issues.push({
      id: 'sty-filler',
      category: 'style',
      severity: 'low',
      message: 'Filler words detected (' + fillers.length + '): ' + sample.join(', ') + '.',
      suggestion: 'Cut filler words — most sentences read stronger without them.'
    });
  }

  // Adverb (-ly) ratio. Skip common non-adverb -ly words ("only", "fully").
  const adverbSkip = new Set(['only','fully','duly','ugly','silly','holy','rely','reply','apply','imply','supply']);
  const adverbs = tokens.filter(function (t) {
    return t.word.length > 4 && t.word.endsWith('ly') && !adverbSkip.has(t.word);
  });
  const adverbRatio = adverbs.length / tokens.length;
  if (adverbs.length >= 4 && adverbRatio > MAX_ADVERB_RATIO) {
    issues.push({
      id: 'sty-adverb',
      category: 'style',
      severity: 'low',
      message: 'Heavy adverb use: ' + adverbs.length + ' words ending in "-ly" (' +
               (adverbRatio * 100).toFixed(1) + '%).',
      suggestion: 'Prefer stronger verbs over adverb+verb constructions ("ran quickly" → "sprinted").'
    });
  }

  // Weak sentence openers ("There is/are/was/were", "It is/was").
  const sentences = splitSentences(text);
  let weakOpeners = 0;
  for (const s of sentences) {
    if (WEAK_OPENER_RE.test(s.text)) weakOpeners++;
  }
  if (weakOpeners >= MAX_WEAK_OPENERS) {
    issues.push({
      id: 'sty-weak-openers',
      category: 'style',
      severity: 'low',
      message: weakOpeners + ' sentences start with weak openers ("there is", "it is" …).',
      suggestion: 'Lead with the real subject of the sentence instead of an expletive.'
    });
  }

  // Sentence-start variety. If ≥4 sentences AND >50% of them start
  // with the same word, the prose feels monotonous. Common pronouns
  // ("I", "we", "you") are intentionally not filtered — the check is
  // about repetition, not register.
  if (sentences.length >= 4) {
    const opener = new Map();
    for (const s of sentences) {
      const first = (s.text.match(/[A-Za-zÀ-ÿ']+/) || [''])[0].toLowerCase();
      if (!first) continue;
      opener.set(first, (opener.get(first) || 0) + 1);
    }
    let topWord = null;
    let topCount = 0;
    for (const [w, c] of opener.entries()) {
      if (c > topCount) { topCount = c; topWord = w; }
    }
    if (topWord && topCount >= 4 && topCount / sentences.length > 0.5) {
      issues.push({
        id: 'sty-opener-variety',
        category: 'style',
        severity: 'low',
        message: topCount + '/' + sentences.length + ' sentences start with "' + topWord + '".',
        suggestion: 'Vary sentence openings to keep the prose from feeling monotonous.'
      });
    }
  }

  return {
    issues: issues,
    stats: {
      intensifierRatio: Number(intRatio.toFixed(3)),
      weakVerbRatio: Number(weakRatio.toFixed(3)),
      fillerRatio: Number(fillerRatio.toFixed(3)),
      adverbRatio: Number(adverbRatio.toFixed(3)),
      weakOpeners: weakOpeners,
      passiveCount: passiveCount
    }
  };
}

/* -------------------------------------------------------------------- */
/* R7 — clarity (sentence length + Flesch reading ease)                 */
/* -------------------------------------------------------------------- */

// Tightened from 30 to 45. 30-word sentences are normal in academic /
// technical prose; flagging them produced false positives.
const LONG_SENTENCE_WORDS = 45;

function detectClarityIssues(text) {
  const issues = [];
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { issues: issues, stats: { avgSentenceWords: 0, flesch: null } };
  }

  let totalWords = 0;
  let totalSyllables = 0;
  for (const s of sentences) {
    const sentTokens = tokenize(s.text);
    totalWords += sentTokens.length;
    for (const t of sentTokens) totalSyllables += countSyllables(t.word);

    if (sentTokens.length > LONG_SENTENCE_WORDS) {
      // Display: word-boundary truncation with ellipsis.
      // Search:  the full clean sentence (used by jumpToSpan / AI).
      const cleanFull = cleanSpan(s.text);
      const display = truncateAtWord(cleanFull, 90);
      issues.push({
        id: 'cla-len-' + s.start,
        category: 'clarity',
        severity: sentTokens.length > LONG_SENTENCE_WORDS * 1.5 ? 'high' : 'medium',
        message: 'Long sentence: ' + sentTokens.length + ' words.',
        suggestion: 'Split into two or more shorter sentences.',
        span: {
          text: display.text + (display.elided ? '…' : ''),
          searchText: cleanFull,
          start: s.start, end: s.end
        }
      });
    }
  }

  const avgWords = totalWords / sentences.length;
  let flesch = null;
  if (totalWords > 0) {
    flesch = 206.835 - 1.015 * avgWords - 84.6 * (totalSyllables / totalWords);
    flesch = Math.max(0, Math.min(100, Number(flesch.toFixed(1))));
    if (flesch < 30) {
      issues.push({
        id: 'cla-flesch',
        category: 'clarity',
        severity: 'high',
        message: 'Flesch reading ease is ' + flesch + ' (very difficult).',
        suggestion: 'Shorten sentences and prefer common, shorter words.'
      });
    } else if (flesch < 50) {
      issues.push({
        id: 'cla-flesch',
        category: 'clarity',
        severity: 'medium',
        message: 'Flesch reading ease is ' + flesch + ' (difficult).',
        suggestion: 'Consider shorter sentences or simpler vocabulary.'
      });
    }
  }

  return {
    issues: issues,
    stats: {
      avgSentenceWords: Number(avgWords.toFixed(1)),
      flesch: flesch,
      sentences: sentences.length
    }
  };
}

/* -------------------------------------------------------------------- */
/* R8 — consistency (terminological capitalisation)                     */
/* -------------------------------------------------------------------- */

function detectConsistencyIssues(text) {
  const issues = [];
  const tokens = tokenize(text);
  const buckets = new Map(); // lowercase -> Map<surface, count>

  for (const t of tokens) {
    if (t.word.length < 3 || STOPWORDS.has(t.word)) continue;
    if (!buckets.has(t.word)) buckets.set(t.word, new Map());
    const m = buckets.get(t.word);
    m.set(t.raw, (m.get(t.raw) || 0) + 1);
  }

  let inconsistentTerms = 0;
  for (const [lower, surfaces] of buckets.entries()) {
    if (surfaces.size < 2) continue;
    // Only flag if at least one surface has a capital letter — i.e. it
    // looks like a named term, not "the" vs "The".
    const surfaceList = Array.from(surfaces.entries());
    const hasUpper = surfaceList.some(([s]) => /[A-Z]/.test(s));
    if (!hasUpper) continue;
    // Skip if the only capitalised variant only appears at sentence start
    // (heuristic: total occurrences of capitalised variant == 1).
    const variants = surfaceList.map(([s, c]) => s + ' ×' + c).join(', ');
    issues.push({
      id: 'con-cap-' + lower,
      category: 'consistency',
      severity: 'low',
      message: 'Inconsistent capitalisation of "' + lower + '": ' + variants + '.',
      suggestion: 'Pick one form and use it throughout.'
    });
    inconsistentTerms++;
  }

  return { issues: issues, stats: { inconsistentTerms: inconsistentTerms } };
}

/* -------------------------------------------------------------------- */
/* R9 — tone (coarse formal / informal classification)                  */
/* -------------------------------------------------------------------- */

function classifyTone(text) {
  const tokens = tokenize(text);
  const total = tokens.length || 1;

  let formal = 0;
  let informal = 0;
  for (const t of tokens) {
    if (FORMAL_MARKERS.has(t.word)) formal++;
    if (INFORMAL_MARKERS.has(t.word)) informal++;
  }
  const contractionMatches = text.match(CONTRACTIONS);
  const contractions = contractionMatches ? contractionMatches.length : 0;
  informal += contractions;

  const formalRatio = formal / total;
  const informalRatio = informal / total;

  let label;
  if (formalRatio === 0 && informalRatio === 0)            label = 'neutral';
  else if (formalRatio > informalRatio * 1.5)              label = 'formal';
  else if (informalRatio > formalRatio * 1.5)              label = 'informal';
  else                                                      label = 'mixed';

  const issues = [];
  if (label === 'mixed') {
    issues.push({
      id: 'ton-mixed',
      category: 'tone',
      severity: 'low',
      message: 'Tone is mixed: formal markers (' + formal +
               ') and informal markers (' + informal + ').',
      suggestion: 'Decide on a target tone and align throughout.'
    });
  }

  return {
    issues: issues,
    stats: { label: label, formal: formal, informal: informal, contractions: contractions }
  };
}

/* -------------------------------------------------------------------- */
/* R10 — overall textual-quality score                                  */
/* -------------------------------------------------------------------- */

function overallScore(parts) {
  let score = 100;
  let total = 0;
  const cats = ['repetition','redundancy','clarity','style','consistency','tone'];
  for (const c of cats) {
    for (const issue of parts[c].issues) {
      total++;
      score -= (issue.severity === 'high' ? 10
              : issue.severity === 'medium' ? 6
              : 3);
    }
  }
  if (score < 0) score = 0;

  let verdict;
  if (score >= 85)      verdict = 'Strong — only minor edits suggested.';
  else if (score >= 70) verdict = 'Good — a few editorial improvements possible.';
  else if (score >= 50) verdict = 'Mixed — several issues worth addressing.';
  else                  verdict = 'Weak — needs substantial editorial revision.';

  return { score: score, totalIssues: total, verdict: verdict };
}

/* -------------------------------------------------------------------- */
/* Entry point                                                          */
/* -------------------------------------------------------------------- */

function runAnalysis(text) {
  const result = {
    repetition:  detectRepetition(text),
    redundancy:  detectRedundancy(text),
    clarity:     detectClarityIssues(text),
    style:       detectStyleIssues(text),
    consistency: detectConsistencyIssues(text),
    tone:        classifyTone(text)
  };
  result.overall = overallScore(result);
  result.meta = {
    analyzedAt: new Date().toISOString(),
    charCount: text.length,
    wordCount: tokenize(text).length,
    version: '0.2.0'
  };
  return result;
}

// Node export for the test harness; ignored by Apps Script.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAnalysis: runAnalysis,
    detectRepetition: detectRepetition,
    detectRedundancy: detectRedundancy,
    detectStyleIssues: detectStyleIssues,
    detectClarityIssues: detectClarityIssues,
    detectConsistencyIssues: detectConsistencyIssues,
    classifyTone: classifyTone,
    overallScore: overallScore,
    tokenize: tokenize,
    splitSentences: splitSentences
  };
}
