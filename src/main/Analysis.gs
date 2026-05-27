/**
 * Analysis engine for the Advanced Editorial Assistant.
 *
 * Bilingual: supports English (en-US) and Italian (it-IT). The default
 * language is Italian because the project is for an Italian university.
 *
 * Implements:
 *   R4  lexical repetition   -> detectRepetition()
 *   R5  semantic redundancy  -> detectRedundancy()
 *   R6  stylistic weakness   -> detectStyleIssues()
 *   R7  clarity              -> detectClarityIssues() (sentence length +
 *                                 Flesch for EN, Gulpease for IT)
 *   R8  consistency          -> detectConsistencyIssues()
 *   R9  tone                 -> classifyTone()
 *   R10 overall score        -> overallScore()
 *
 * All detectors accept an explicit `language` parameter. The dispatch
 * picks the right lexicon set from LEXICONS.<language>.
 *
 * Dependency-free V8 JavaScript; runs unchanged under Google Apps
 * Script and Node (via the `module.exports` shim at the bottom).
 */

/* ==================================================================== */
/* LEXICONS                                                              */
/* ==================================================================== */

const LEXICONS = {
  'en-US': {
    STOPWORDS: new Set([
      'the','a','an','and','or','but','of','to','in','on','at','for','with',
      'by','from','as','is','are','was','were','be','been','being','it','its',
      'this','that','these','those','i','you','he','she','we','they','me','him',
      'her','us','them','my','your','his','their','our','if','then','so','not',
      'no','yes','do','does','did','have','has','had','will','would','can',
      'could','should','may','might','must','shall','am','about','into','than',
      'also','just','only','too','some','any','each','every','all','more','most',
      'less','few','many','much','out','up','down','over','under','again',
      'further','here','there','what','which','who','whom','when','where','why',
      'how','because','while','during','before','after'
    ]),
    INTENSIFIERS: new Set([
      'very','extremely','really','quite','rather','pretty','fairly','somewhat',
      'highly','incredibly','absolutely','truly','utterly','completely','totally',
      'greatly','immensely','particularly','especially'
    ]),
    REDUNDANT_PHRASES: [
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
      [/\bvery unique\b/gi, 'unique']
    ],
    WEAK_VERBS: new Set([
      'make','makes','made','making',
      'do','does','did','doing',
      'get','gets','got','getting',
      'have','has','had','having',
      'go','goes','went','going',
      'put','puts','putting'
    ]),
    FILLER_WORDS: new Set([
      'just','really','actually','basically','literally','simply','quite',
      'rather','perhaps','maybe','somehow','sort','kind','stuff',
      'honestly','frankly','essentially','obviously'
    ]),
    WEAK_OPENER_RE: /^\s*(there\s+(?:is|are|was|were)|it\s+(?:is|was))\b/i,
    PASSIVE_RE: /\b(?:am|is|are|was|were|be|been|being)\s+(?:[a-z]+ly\s+)?([a-z]+(?:ed|en|wn|own|t))\b/gi,
    PASSIVE_FALSE_POSITIVES: new Set([
      'interested','married','supposed','concerned','prepared','intended',
      'dedicated','committed','excited','surprised','bored','tired','worried',
      'relaxed','confused','disappointed','embarrassed','frustrated','scared',
      'pleased','shocked','satisfied','delighted','aware','willing','ashamed',
      'qualified','convinced','involved','divorced','engaged','retired'
    ]),
    NOMINALIZATION_PHRASES: [
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
    ],
    CLICHE_PHRASES: [
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
    ],
    FORMAL_MARKERS: new Set([
      'moreover','furthermore','hence','therefore','consequently','nevertheless',
      'whereas','thus','accordingly','notwithstanding','heretofore','aforementioned',
      'henceforth','wherein','whereby'
    ]),
    INFORMAL_MARKERS: new Set([
      'kinda','sorta','gonna','wanna','gotta','yeah','nope','stuff','thing',
      'things','okay','ok','cool','awesome','huge','tons','bunch','lots',
      'totally','basically','literally','honestly'
    ]),
    CONTRACTIONS: /\b\w+'(?:t|s|re|ve|ll|d|m|em)\b/gi,
    ADVERB_SKIP: new Set([
      'only','fully','duly','ugly','silly','holy','rely','reply','apply','imply','supply'
    ]),
    ADVERB_SUFFIX: 'ly'
  },

  'it-IT': {
    STOPWORDS: new Set([
      'il','la','lo','i','gli','le','un','una','uno',
      'di','del','della','dello','dei','degli','delle',
      'a','al','alla','allo','ai','agli','alle',
      'da','dal','dalla','dallo','dai','dagli','dalle',
      'in','nel','nella','nello','nei','negli','nelle',
      'con','su','sul','sulla','sullo','sui','sugli','sulle',
      'per','tra','fra',
      'è','sono','era','erano','sarà','saranno','essere','stato','stata','stati','state',
      'ho','hai','ha','abbiamo','avete','hanno','avevo','avevi','aveva','avere','avuto',
      'e','ed','o','od','ma','però','quindi','anche','se','perché','che','chi','cosa','dove','quando','come',
      'non','già','ancora','sempre','mai','più','meno','troppo','tanto','poco','ogni','tutti','tutto','tutta','tutte',
      'io','tu','lui','lei','noi','voi','loro','mi','ti','si','ci','vi','me','te','sé','lo','la',
      'mio','tuo','suo','nostro','vostro','questo','quello','questi','quelli','questa','quella','queste','quelle',
      'molto','molta','molti','molte','poco','poca','pochi','poche'
    ]),
    INTENSIFIERS: new Set([
      'molto','estremamente','davvero','veramente','abbastanza','piuttosto','assai',
      'particolarmente','specialmente','incredibilmente','assolutamente',
      'completamente','totalmente','fortemente','decisamente','parecchio',
      'fondamentalmente','indubbiamente'
    ]),
    REDUNDANT_PHRASES: [
      [/\bsalire\s+su\b/gi, 'salire'],
      [/\bscendere\s+gi[uù]\b/gi, 'scendere'],
      [/\bentrare\s+dentro\b/gi, 'entrare'],
      [/\buscire\s+fuori\b/gi, 'uscire'],
      [/\btornare\s+indietro\b/gi, 'tornare'],
      [/\bripetere\s+di\s+nuovo\b/gi, 'ripetere'],
      [/\bricordare\s+a\s+memoria\b/gi, 'memorizzare'],
      [/\bannullare\s+definitivamente\b/gi, 'annullare'],
      [/\bcompletamente\s+vuoto\b/gi, 'vuoto'],
      [/\bcompletamente\s+finito\b/gi, 'finito'],
      [/\bcompletamente\s+pieno\b/gi, 'pieno'],
      [/\bassolutamente\s+certo\b/gi, 'certo'],
      [/\bassolutamente\s+necessario\b/gi, 'necessario'],
      [/\bassolutamente\s+essenziale\b/gi, 'essenziale'],
      [/\bunico\s+nel\s+suo\s+genere\b/gi, 'unico'],
      [/\bprevisioni\s+future\b/gi, 'previsioni'],
      [/\besperienza\s+vissuta\b/gi, 'esperienza'],
      [/\bal\s+giorno\s+d'?oggi\b/gi, 'oggi'],
      [/\bai\s+nostri\s+giorni\b/gi, 'oggi'],
      [/\bin\s+pratica\b/gi, 'in pratica (spesso superfluo)'],
      [/\bin\s+sostanza\b/gi, 'in sostanza (spesso superfluo)'],
      [/\babbinato\s+insieme\b/gi, 'abbinato'],
      [/\bcollaborare\s+insieme\b/gi, 'collaborare'],
      [/\bopinione\s+personale\b/gi, 'opinione'],
      [/\bfatto\s+reale\b/gi, 'fatto'],
      [/\bvera\s+verit[aà]\b/gi, 'verità'],
      [/\bnuova\s+innovazione\b/gi, 'innovazione'],
      [/\brisultato\s+finale\b/gi, 'risultato']
    ],
    WEAK_VERBS: new Set([
      'fare','fa','fai','fanno','facciamo','fatto','facendo',
      'avere','ha','hai','ho','abbiamo','hanno','avuto','avendo',
      'essere','è','sono','era','erano','stato','stata','stati','state',
      'dare','do','dà','danno','dato','dando',
      'andare','va','vai','vanno','andiamo','andato','andando'
    ]),
    FILLER_WORDS: new Set([
      'tipo','cio[eè]','praticamente','sostanzialmente','diciamo','insomma',
      'comunque','allora','magari','beh','mah','boh','no','si','okay',
      'fondamentalmente','effettivamente','onestamente','francamente'
    ]),
    WEAK_OPENER_RE: /^\s*(c'?[eè]\s|ci\s+sono|ci\s+era|ci\s+erano|[eè]\s|sono\s+stati|sono\s+state)/i,
    // Italian passive: essere / venire / andare + past participle (-ato/-ito/-uto)
    PASSIVE_RE: /\b(?:[eè]|sono|era|erano|sar[aà]|saranno|essere|stato|stata|stati|state|viene|vengono|veniva|venivano|venuto|venuti|vanno|andava|andavano)\s+(?:[a-zà-ÿ]+\s+)?([a-zà-ÿ]+(?:ato|ito|uto|ata|ita|uta|ati|iti|uti|ate|ite|ute))\b/gi,
    PASSIVE_FALSE_POSITIVES: new Set([
      'sposato','sposata','sposati','sposate',
      'preoccupato','preoccupata','preoccupati','preoccupate',
      'interessato','interessata','interessati','interessate',
      'preparato','preparata','preparati','preparate',
      'abituato','abituata','abituati','abituate',
      'soddisfatto','soddisfatta','soddisfatti','soddisfatte',
      'arrabbiato','arrabbiata','arrabbiati','arrabbiate',
      'stancato','stancata','stancati','stancate',
      'deluso','delusa','delusi','deluse',
      'preoccupato','annoiato','annoiata','annoiati','annoiate',
      'qualificato','qualificata','qualificati','qualificate',
      'coinvolto','coinvolta','coinvolti','coinvolte',
      'sposato','laureato','laureata','laureati','laureate'
    ]),
    NOMINALIZATION_PHRASES: [
      [/\bfare\s+una\s+scelta\b/gi, 'scegliere'],
      [/\bfare\s+una\s+decisione\b/gi, 'decidere'],
      [/\bfare\s+un'?analisi\b/gi, 'analizzare'],
      [/\bfare\s+un'?ipotesi\b/gi, 'ipotizzare'],
      [/\bfare\s+un\s+annuncio\b/gi, 'annunciare'],
      [/\bfare\s+una\s+richiesta\b/gi, 'richiedere'],
      [/\bfare\s+uso\s+di\b/gi, 'usare'],
      [/\bprendere\s+in\s+considerazione\b/gi, 'considerare'],
      [/\bprendere\s+una\s+decisione\b/gi, 'decidere'],
      [/\bdare\s+attenzione\s+a\b/gi, 'considerare / notare'],
      [/\bdare\s+(?:un'?)?approvazione\s+a\b/gi, 'approvare'],
      [/\bavere\s+un\s+impatto\s+su\b/gi, 'influenzare'],
      [/\bavere\s+una\s+discussione\b/gi, 'discutere'],
      [/\bdare\s+(?:una\s+)?spiegazione\b/gi, 'spiegare'],
      [/\bfornire\s+assistenza\s+a\b/gi, 'aiutare'],
      [/\bfornire\s+(?:una\s+)?guida\b/gi, 'guidare'],
      [/\beffettuare\s+un'?analisi\b/gi, 'analizzare'],
      [/\bsvolgere\s+un'?indagine\b/gi, 'indagare']
    ],
    CLICHE_PHRASES: [
      /\balla\s+fine\s+della\s+fiera\b/gi,
      /\bin\s+fin\s+dei\s+conti\b/gi,
      /\bad\s+ogni\s+modo\b/gi,
      /\bin\s+ogni\s+caso\b/gi,
      /\bdulcis\s+in\s+fundo\b/gi,
      /\bultimo\s+ma\s+non\s+per\s+importanza\b/gi,
      /\bun\s+punto\s+di\s+svolta\s+cruciale\b/gi,
      /\bla\s+punta\s+dell'?iceberg\b/gi,
      /\bpensare\s+fuori\s+dagli?\s+schemi\b/gi,
      /\bsolo\s+il\s+tempo\s+ce\s+lo\s+dir[aà]\b/gi,
      /\btornare\s+al\s+tavolo\s+da\s+disegno\b/gi,
      /\bil\s+meglio\s+dei\s+due\s+mondi\b/gi,
      /\bsvolta\s+epocale\b/gi,
      /\bandando\s+avanti\b/gi,
      /\bin\s+poche\s+parole\b/gi,
      /\bdetto\s+fatto\b/gi
    ],
    FORMAL_MARKERS: new Set([
      'inoltre','tuttavia','pertanto','dunque','nondimeno','ciononostante',
      'peraltro','altres[iì]','ossia','vale','dire','difatti','invero',
      'qualora','laddove','sebbene','bench[eé]','poich[eé]'
    ]),
    INFORMAL_MARKERS: new Set([
      'tipo','boh','mah','beh','magari','comunque','insomma','allora','cioè',
      'davvero','praticamente','sostanzialmente','onestamente','francamente',
      'tantissimo','un\'ottimo','okay','ok'
    ]),
    // Italian uses apostrophes for elision a lot — too generic to be reliable
    // as a contraction count, so we treat apostrophe-following-letter+'+t/s/etc
    // patterns instead. Leave empty: contractions are not an Italian register
    // signal the way they are in English.
    CONTRACTIONS: /(?!)/g,
    ADVERB_SKIP: new Set([
      'mente','presente','dipendente','indipendente','sufficiente','frequente'
    ]),
    ADVERB_SUFFIX: 'mente'
  }
};

function _lex(language) {
  return LEXICONS[language] || LEXICONS['en-US'];
}

/* ==================================================================== */
/* Shared tokenisation utilities                                         */
/* ==================================================================== */

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

function cleanSpan(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim();
}

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

// Lightweight English suffix stripping for repetition stemming.
function stemEN(word) {
  if (word.length <= 4) return word;
  const suffixes = ['ingly','edly','ies','ied','ing','ied','ed','es','er','est','ly','s'];
  for (const s of suffixes) {
    if (word.length > s.length + 2 && word.endsWith(s)) return word.slice(0, -s.length);
  }
  return word;
}

// Lightweight Italian suffix stripping. Covers infinitive endings,
// past participles, plurals, gerunds, adverbs.
function stemIT(word) {
  if (word.length <= 4) return word;
  const suffixes = [
    'amente','azione','azioni','mente',
    'ando','endo',
    'ato','ata','ati','ate',
    'ito','ita','iti','ite',
    'uto','uta','uti','ute',
    'are','ere','ire',
    'ano','ono','ava','eva','iva',
    'i','e','a','o'
  ];
  for (const s of suffixes) {
    if (word.length > s.length + 2 && word.endsWith(s)) return word.slice(0, -s.length);
  }
  return word;
}

function stem(word, language) {
  return language === 'it-IT' ? stemIT(word) : stemEN(word);
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/e$/, '');
  const groups = word.match(/[aeiouyàèéìíîòóùú]+/g);
  return groups ? Math.max(1, groups.length) : 1;
}

/* ==================================================================== */
/* R4 — lexical repetition                                              */
/* ==================================================================== */

const REPETITION_TIERS = [
  { count: 4, window: 40 },
  { count: 5, window: 70 }
];

function detectRepetition(text, language) {
  const lex = _lex(language);
  const tokens = tokenize(text);
  const issues = [];
  const stems = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].word;
    if (w.length <= 3 || lex.STOPWORDS.has(w)) continue;
    const s = stem(w, language);
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
    const msgPrefix = language === 'it-IT' ? 'Ripetizione' : 'Repeated word family';
    const msgSuffix = language === 'it-IT' ? 'volte in stretta vicinanza' : 'times in close proximity';
    const suggestion = language === 'it-IT'
      ? 'Varia il lessico — usa sinonimi, pronomi, o ristruttura.'
      : 'Vary the wording — use synonyms, pronouns, or restructure.';

    issues.push({
      id: 'rep-' + stemKey + '-' + first.start,
      category: 'repetition',
      severity: entry.positions.length >= 6 ? 'high' : 'medium',
      message: msgPrefix + ' "' + stemKey + '" (varianti: ' + surfaceList + ') compare ' +
               entry.positions.length + ' ' + msgSuffix + '.',
      suggestion: suggestion,
      span: {
        text: first.raw,
        searchText: first.raw,
        occurrences: entry.positions.length
      }
    });
  }

  return { issues: issues, stats: { repeatedFamilies: issues.length } };
}

/* ==================================================================== */
/* R5 — semantic redundancy                                             */
/* ==================================================================== */

function detectRedundancy(text, language) {
  const lex = _lex(language);
  const issues = [];

  const msgRedundant = language === 'it-IT' ? 'Frase ridondante' : 'Redundant phrase';
  const msgConsider  = language === 'it-IT' ? 'Considera'        : 'Consider';
  const msgIntCluster = language === 'it-IT'
    ? 'Più intensificatori nella stessa frase'
    : 'Multiple intensifiers in one sentence';
  const sugIntCluster = language === 'it-IT'
    ? 'Mantieni al massimo un intensificatore; preferisci un aggettivo più forte.'
    : 'Keep at most one intensifier; pick a stronger adjective.';

  for (const [pattern, replacement] of lex.REDUNDANT_PHRASES) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      issues.push({
        id: 'red-' + m.index,
        category: 'redundancy',
        severity: 'medium',
        message: msgRedundant + ': "' + cleanSpan(m[0]) + '".',
        suggestion: msgConsider + ' "' + replacement + '".',
        span: { text: cleanSpan(m[0]), start: m.index, end: m.index + m[0].length }
      });
      if (m.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  const sentences = splitSentences(text);
  for (const s of sentences) {
    const sentTokens = tokenize(s.text);
    const ints = sentTokens.filter(t => lex.INTENSIFIERS.has(t.word));
    if (ints.length >= 2) {
      issues.push({
        id: 'red-int-' + s.start,
        category: 'redundancy',
        severity: 'low',
        message: msgIntCluster + ': ' + ints.map(t => '"' + t.word + '"').join(', '),
        suggestion: sugIntCluster,
        span: { text: ints[0].raw, start: s.start + ints[0].start, end: s.start + ints[0].end }
      });
    }
  }

  return { issues: issues, stats: { redundantPhrasesChecked: lex.REDUNDANT_PHRASES.length } };
}

/* ==================================================================== */
/* R6 — stylistic weakness                                              */
/* ==================================================================== */

const MAX_INTENSIFIER_RATIO = 0.05;
const MAX_WEAK_VERB_RATIO   = 0.05;
const MAX_FILLER_RATIO      = 0.025;
const MAX_ADVERB_RATIO      = 0.06;
const MAX_WEAK_OPENERS      = 3;

function detectStyleIssues(text, language) {
  const lex = _lex(language);
  const isIT = language === 'it-IT';
  const issues = [];
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { issues: issues, stats: { intensifierRatio: 0, weakVerbRatio: 0, passiveCount: 0,
             fillerRatio: 0, adverbRatio: 0, weakOpeners: 0 } };
  }

  const intensifiers = tokens.filter(t => lex.INTENSIFIERS.has(t.word));
  const intRatio = intensifiers.length / tokens.length;
  if (intRatio > MAX_INTENSIFIER_RATIO) {
    issues.push({
      id: 'sty-int-ratio',
      category: 'style',
      severity: intRatio > MAX_INTENSIFIER_RATIO * 2 ? 'high' : 'medium',
      message: (isIT ? 'Eccesso di intensificatori: ' : 'Intensifier overuse: ') +
               intensifiers.length + '/' + tokens.length + ' parole (' +
               (intRatio * 100).toFixed(1) + '%).',
      suggestion: isIT
        ? 'Sostituisci coppie intensificatore+aggettivo con un aggettivo più forte.'
        : 'Replace intensifier+adjective pairs with stronger single adjectives.'
    });
  }

  const weak = tokens.filter(t => lex.WEAK_VERBS.has(t.word));
  const weakRatio = weak.length / tokens.length;
  if (weakRatio > MAX_WEAK_VERB_RATIO) {
    issues.push({
      id: 'sty-weak-ratio',
      category: 'style',
      severity: 'low',
      message: (isIT
                  ? 'Uso elevato di verbi deboli (fare/avere/essere/...): '
                  : 'High use of weak verbs (make/do/get/have/...): ') +
               weak.length + (isIT ? ' occorrenze.' : ' occurrences.'),
      suggestion: isIT
        ? 'Preferisci verbi specifici (es. "condurre", "ottenere", "realizzare").'
        : 'Prefer specific verbs ("conduct", "achieve", "obtain", ...).'
    });
  }

  // Passive voice (with adjectival-participle skip list).
  lex.PASSIVE_RE.lastIndex = 0;
  let m;
  let passiveCount = 0;
  while ((m = lex.PASSIVE_RE.exec(text)) !== null) {
    const participle = (m[1] || '').toLowerCase();
    if (lex.PASSIVE_FALSE_POSITIVES.has(participle)) {
      if (m.index === lex.PASSIVE_RE.lastIndex) lex.PASSIVE_RE.lastIndex++;
      continue;
    }
    passiveCount++;
    issues.push({
      id: 'sty-pas-' + m.index,
      category: 'style',
      severity: 'low',
      message: (isIT ? 'Possibile forma passiva: ' : 'Possible passive voice: ') +
               '"' + cleanSpan(m[0]) + '".',
      suggestion: isIT
        ? 'Riscrivi in forma attiva dove possibile.'
        : 'Rewrite in the active voice where appropriate.',
      span: { text: cleanSpan(m[0]), start: m.index, end: m.index + m[0].length }
    });
    if (m.index === lex.PASSIVE_RE.lastIndex) lex.PASSIVE_RE.lastIndex++;
  }

  // Nominalizations.
  for (const [pattern, replacement] of lex.NOMINALIZATION_PHRASES) {
    pattern.lastIndex = 0;
    let nm;
    while ((nm = pattern.exec(text)) !== null) {
      issues.push({
        id: 'sty-nom-' + nm.index,
        category: 'style',
        severity: 'low',
        message: (isIT ? 'Nominalizzazione: ' : 'Nominalization: ') +
                 '"' + cleanSpan(nm[0]) + '".',
        suggestion: (isIT ? 'Usa la forma verbale: "' : 'Use the verb form: "') +
                    replacement + '".',
        span: { text: cleanSpan(nm[0]), start: nm.index, end: nm.index + nm[0].length }
      });
      if (nm.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // Clichés.
  for (const pattern of lex.CLICHE_PHRASES) {
    pattern.lastIndex = 0;
    let cm;
    while ((cm = pattern.exec(text)) !== null) {
      issues.push({
        id: 'sty-cliche-' + cm.index,
        category: 'style',
        severity: 'low',
        message: (isIT ? 'Cliché: ' : 'Cliché: ') + '"' + cleanSpan(cm[0]) + '".',
        suggestion: isIT
          ? 'Riformula con parole tue.'
          : 'Rephrase in your own words.',
        span: { text: cleanSpan(cm[0]), start: cm.index, end: cm.index + cm[0].length }
      });
      if (cm.index === pattern.lastIndex) pattern.lastIndex++;
    }
  }

  // Filler word ratio.
  const fillers = tokens.filter(function (t) { return lex.FILLER_WORDS.has(t.word); });
  const fillerRatio = fillers.length / tokens.length;
  if (fillers.length >= 3 && fillerRatio > MAX_FILLER_RATIO) {
    const sample = Array.from(new Set(fillers.map(function (t) { return t.word; }))).slice(0, 5);
    issues.push({
      id: 'sty-filler',
      category: 'style',
      severity: 'low',
      message: (isIT ? 'Parole-riempitivo rilevate (' : 'Filler words detected (') +
               fillers.length + '): ' + sample.join(', ') + '.',
      suggestion: isIT
        ? 'Elimina i riempitivi — la maggior parte delle frasi è più forte senza.'
        : 'Cut filler words — most sentences read stronger without them.'
    });
  }

  // Adverbs ending in language-specific suffix.
  const adverbs = tokens.filter(function (t) {
    return t.word.length > 4 && t.word.endsWith(lex.ADVERB_SUFFIX) && !lex.ADVERB_SKIP.has(t.word);
  });
  const adverbRatio = adverbs.length / tokens.length;
  if (adverbs.length >= 4 && adverbRatio > MAX_ADVERB_RATIO) {
    issues.push({
      id: 'sty-adverb',
      category: 'style',
      severity: 'low',
      message: (isIT ? 'Uso elevato di avverbi: ' : 'Heavy adverb use: ') +
               adverbs.length + ' ' +
               (isIT ? 'parole in "-mente"' : 'words ending in "-ly"') + ' (' +
               (adverbRatio * 100).toFixed(1) + '%).',
      suggestion: isIT
        ? 'Preferisci verbi più forti rispetto a costruzioni avverbio+verbo.'
        : 'Prefer stronger verbs over adverb+verb constructions ("ran quickly" → "sprinted").'
    });
  }

  // Weak sentence openers.
  const sentences = splitSentences(text);
  let weakOpeners = 0;
  for (const s of sentences) {
    if (lex.WEAK_OPENER_RE.test(s.text)) weakOpeners++;
  }
  if (weakOpeners >= MAX_WEAK_OPENERS) {
    issues.push({
      id: 'sty-weak-openers',
      category: 'style',
      severity: 'low',
      message: weakOpeners + ' ' + (isIT
        ? 'frasi iniziano con aperture deboli ("c\'è", "è", …).'
        : 'sentences start with weak openers ("there is", "it is" …).'),
      suggestion: isIT
        ? 'Inizia con il vero soggetto invece che con un\'espressione esistenziale.'
        : 'Lead with the real subject of the sentence instead of an expletive.'
    });
  }

  // Sentence-start variety.
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
        message: topCount + '/' + sentences.length + ' ' +
                 (isIT ? 'frasi iniziano con "' : 'sentences start with "') + topWord + '".',
        suggestion: isIT
          ? 'Varia gli incipit per evitare monotonia.'
          : 'Vary sentence openings to keep the prose from feeling monotonous.'
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

/* ==================================================================== */
/* R7 — clarity (sentence length + Flesch (EN) / Gulpease (IT))         */
/* ==================================================================== */

const LONG_SENTENCE_WORDS = 45;

function detectClarityIssues(text, language) {
  const isIT = language === 'it-IT';
  const issues = [];
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { issues: issues, stats: { avgSentenceWords: 0, flesch: null, gulpease: null } };
  }

  let totalWords = 0;
  let totalSyllables = 0;
  let totalLetters = 0;
  for (const s of sentences) {
    const sentTokens = tokenize(s.text);
    totalWords += sentTokens.length;
    for (const t of sentTokens) {
      totalSyllables += countSyllables(t.word);
      totalLetters += t.word.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    }

    if (sentTokens.length > LONG_SENTENCE_WORDS) {
      const cleanFull = cleanSpan(s.text);
      const display = truncateAtWord(cleanFull, 90);
      issues.push({
        id: 'cla-len-' + s.start,
        category: 'clarity',
        severity: sentTokens.length > LONG_SENTENCE_WORDS * 1.5 ? 'high' : 'medium',
        message: (isIT ? 'Frase lunga: ' : 'Long sentence: ') + sentTokens.length +
                 (isIT ? ' parole.' : ' words.'),
        suggestion: isIT
          ? 'Spezza in due o più frasi più brevi.'
          : 'Split into two or more shorter sentences.',
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
  let gulpease = null;

  if (totalWords > 0) {
    if (isIT) {
      // Gulpease index: 89 + (300*S − 10*L) / W.  Higher = easier.
      // <40 very difficult; 40–60 difficult; 60–80 medium; >80 easy.
      gulpease = 89 + (300 * sentences.length - 10 * totalLetters) / totalWords;
      gulpease = Math.max(0, Math.min(100, Number(gulpease.toFixed(1))));
      if (gulpease < 40) {
        issues.push({
          id: 'cla-gulpease',
          category: 'clarity',
          severity: 'high',
          message: 'Indice Gulpease ' + gulpease + ' (molto difficile).',
          suggestion: 'Accorcia le frasi e usa parole più brevi e comuni.'
        });
      } else if (gulpease < 60) {
        issues.push({
          id: 'cla-gulpease',
          category: 'clarity',
          severity: 'medium',
          message: 'Indice Gulpease ' + gulpease + ' (difficile).',
          suggestion: 'Frasi più brevi o lessico più semplice migliorerebbero la leggibilità.'
        });
      }
    } else {
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
  }

  return {
    issues: issues,
    stats: {
      avgSentenceWords: Number(avgWords.toFixed(1)),
      flesch: flesch,
      gulpease: gulpease,
      sentences: sentences.length
    }
  };
}

/* ==================================================================== */
/* R8 — consistency                                                     */
/* ==================================================================== */

function detectConsistencyIssues(text, language) {
  const lex = _lex(language);
  const issues = [];
  const tokens = tokenize(text);
  const buckets = new Map();

  for (const t of tokens) {
    if (t.word.length < 3 || lex.STOPWORDS.has(t.word)) continue;
    if (!buckets.has(t.word)) buckets.set(t.word, new Map());
    const m = buckets.get(t.word);
    m.set(t.raw, (m.get(t.raw) || 0) + 1);
  }

  const isIT = language === 'it-IT';
  let inconsistentTerms = 0;
  for (const [lower, surfaces] of buckets.entries()) {
    if (surfaces.size < 2) continue;
    const surfaceList = Array.from(surfaces.entries());
    const hasUpper = surfaceList.some(([s]) => /[A-Z]/.test(s));
    if (!hasUpper) continue;
    const variants = surfaceList.map(([s, c]) => s + ' ×' + c).join(', ');
    issues.push({
      id: 'con-cap-' + lower,
      category: 'consistency',
      severity: 'low',
      message: (isIT ? 'Maiuscole incoerenti per "' : 'Inconsistent capitalisation of "') +
               lower + '": ' + variants + '.',
      suggestion: isIT
        ? 'Scegli una sola forma e usala in tutto il testo.'
        : 'Pick one form and use it throughout.'
    });
    inconsistentTerms++;
  }

  return { issues: issues, stats: { inconsistentTerms: inconsistentTerms } };
}

/* ==================================================================== */
/* R9 — tone                                                            */
/* ==================================================================== */

function classifyTone(text, language) {
  const lex = _lex(language);
  const isIT = language === 'it-IT';
  const tokens = tokenize(text);
  const total = tokens.length || 1;

  let formal = 0;
  let informal = 0;
  for (const t of tokens) {
    if (lex.FORMAL_MARKERS.has(t.word)) formal++;
    if (lex.INFORMAL_MARKERS.has(t.word)) informal++;
  }
  const contractionMatches = text.match(lex.CONTRACTIONS);
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
      message: (isIT ? 'Tono misto: ' : 'Tone is mixed: ') +
               (isIT ? 'segni formali (' : 'formal markers (') + formal +
               (isIT ? ') e informali (' : ') and informal markers (') + informal + ').',
      suggestion: isIT
        ? 'Scegli un tono di riferimento e allinea il testo.'
        : 'Decide on a target tone and align throughout.'
    });
  }

  return {
    issues: issues,
    stats: { label: label, formal: formal, informal: informal, contractions: contractions }
  };
}

/* ==================================================================== */
/* R10 — overall textual-quality score                                  */
/* ==================================================================== */

function overallScore(parts, language) {
  const isIT = language === 'it-IT';
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
  if (isIT) {
    if      (score >= 85) verdict = 'Forte — solo lievi ritocchi consigliati.';
    else if (score >= 70) verdict = 'Buono — qualche miglioramento editoriale possibile.';
    else if (score >= 50) verdict = 'Misto — diverse questioni da affrontare.';
    else                  verdict = 'Debole — serve una revisione editoriale importante.';
  } else {
    if      (score >= 85) verdict = 'Strong — only minor edits suggested.';
    else if (score >= 70) verdict = 'Good — a few editorial improvements possible.';
    else if (score >= 50) verdict = 'Mixed — several issues worth addressing.';
    else                  verdict = 'Weak — needs substantial editorial revision.';
  }

  return { score: score, totalIssues: total, verdict: verdict };
}

/* ==================================================================== */
/* Entry point                                                          */
/* ==================================================================== */

function runAnalysis(text, language) {
  // Default to Italian when no language is provided — the project is for
  // an Italian university.
  if (language !== 'en-US' && language !== 'it-IT') language = 'it-IT';

  const result = {
    repetition:  detectRepetition(text, language),
    redundancy:  detectRedundancy(text, language),
    clarity:     detectClarityIssues(text, language),
    style:       detectStyleIssues(text, language),
    consistency: detectConsistencyIssues(text, language),
    tone:        classifyTone(text, language)
  };
  result.overall = overallScore(result, language);
  result.meta = {
    analyzedAt: new Date().toISOString(),
    charCount: text.length,
    wordCount: tokenize(text).length,
    version: '1.3.0',
    language: language
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
    splitSentences: splitSentences,
    LEXICONS: LEXICONS
  };
}
