#!/usr/bin/env node
/**
 * Node test harness for the Advanced Editorial Assistant analysis engine.
 *
 * The engine in src/main/Analysis.gs is dependency-free V8 JavaScript and
 * runs unchanged here. Apps Script wrappers (DocumentApp, HtmlService)
 * are never imported.
 *
 * Each test loads a fixture text and asserts properties of the result.
 * No external test framework: we use a tiny assert/run wrapper to keep
 * the project zero-dependency.
 */

const fs   = require('fs');
const path = require('path');

// Load Analysis.gs by copying it to a tempfile with a .js extension so
// node's require can pick it up.
const analysisGs = fs.readFileSync(path.join(__dirname, '..', 'main', 'Analysis.gs'), 'utf8');
const tmpJs = path.join(require('os').tmpdir(), 'aea_analysis_' + process.pid + '.js');
fs.writeFileSync(tmpJs, analysisGs);
const aea = require(tmpJs);
fs.unlinkSync(tmpJs);

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name: name, ok: true });
  } catch (e) {
    failed++;
    results.push({ name: name, ok: false, error: e });
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'eq failed') + ' — expected ' + expected + ', got ' + actual);
  }
}
function ge(actual, expected, msg) {
  if (!(actual >= expected)) {
    throw new Error((msg || 'ge failed') + ' — expected >= ' + expected + ', got ' + actual);
  }
}
function le(actual, expected, msg) {
  if (!(actual <= expected)) {
    throw new Error((msg || 'le failed') + ' — expected <= ' + expected + ', got ' + actual);
  }
}
function truthy(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy, got ' + v);
}
function hasCategoryIssue(result, category, predicate, msg) {
  const issues = result[category].issues;
  if (!issues.some(predicate)) {
    throw new Error((msg || 'no matching issue in ' + category) +
      '\n  issues: ' + JSON.stringify(issues.map(i => i.message)));
  }
}

function load(fixture) {
  return fs.readFileSync(path.join(__dirname, fixture), 'utf8');
}

function runEN(text) { return aea.runAnalysis(text, 'en-US'); }
function runIT(text) { return aea.runAnalysis(text, 'it-IT'); }

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

test('problems sample → low overall score', () => {
  const r = runEN(load('sample_problems.txt'));
  le(r.overall.score, 70, 'expected score ≤ 70 for problematic text');
  truthy(r.overall.totalIssues > 0, 'expected at least one issue');
});

test('repetition: tight 4-occurrence cluster flagged', () => {
  const tight = 'The meeting was held. The meeting was useful. The meeting ended. The meeting will resume.';
  const r = runEN(tight);
  hasCategoryIssue(r, 'repetition',
    i => /meet/i.test(i.message),
    'expected a repetition issue for tight "meeting" cluster');
});

test('repetition: spread occurrences NOT flagged (no false positive)', () => {
  // 4 occurrences but spread over ~100 tokens — should NOT flag in v0.6.
  const spread = 'The meeting was held. ' + 'We discussed many topics. '.repeat(15) +
                 'Then another meeting. ' + 'More discussion happened. '.repeat(15) +
                 'A third meeting. ' + 'Even more discussion. '.repeat(15) +
                 'The final meeting concluded.';
  const r = runEN(spread);
  const hasMeet = r.repetition.issues.some(i => /meet/i.test(i.message));
  if (hasMeet) throw new Error('false positive: rule mode should not flag spread repetition');
});

test('problems sample → redundancy of "crucial turning point"', () => {
  const r = runEN(load('sample_problems.txt'));
  hasCategoryIssue(r, 'redundancy',
    i => /turning point/i.test(i.message),
    'expected redundancy issue for "crucial turning point"');
});

test('problems sample → at least one long-sentence clarity warning', () => {
  const r = runEN(load('sample_problems.txt'));
  hasCategoryIssue(r, 'clarity',
    i => /Long sentence/.test(i.message),
    'expected a long-sentence warning');
});

test('formal sample → high overall score, formal tone', () => {
  const r = runEN(load('sample_formal.txt'));
  ge(r.overall.score, 75, 'expected score ≥ 75 for a clean formal text');
  eq(r.tone.stats.label, 'formal', 'expected formal tone');
});

test('informal sample → informal tone label', () => {
  const r = runEN(load('sample_informal.txt'));
  truthy(['informal','mixed'].indexOf(r.tone.stats.label) >= 0,
    'expected informal or mixed tone, got ' + r.tone.stats.label);
  truthy(r.tone.stats.contractions > 0,
    'expected at least one contraction, got ' + r.tone.stats.contractions);
});

test('passive sample → at least one passive-voice style issue', () => {
  const r = runEN(load('sample_passive.txt'));
  hasCategoryIssue(r, 'style',
    i => /passive/i.test(i.message),
    'expected a passive-voice issue');
});

test('consistency sample → flags inconsistent capitalisation', () => {
  const r = runEN(load('sample_consistency.txt'));
  hasCategoryIssue(r, 'consistency',
    i => /capitalisation|capitalization/i.test(i.message),
    'expected a consistency issue');
});

test('style: filler-word overuse flagged', () => {
  const txt = 'I just really actually wanted to basically simply explain that, ' +
              'I just really thought it was actually quite simple. Really.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /filler/i.test(i.message),
    'expected a filler-word style issue');
});

test('style: weak openers ("There is...") flagged', () => {
  const txt = 'There is a problem. There are many tasks. There was confusion. It is unclear. There were delays.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /weak opener/i.test(i.message),
    'expected a weak-opener style issue');
});

test('style: adverb overuse flagged', () => {
  const txt = 'She quickly walked carefully along the path, slowly noticing how brightly the sun shone, ' +
              'eagerly listening intently as birds sang loudly and softly, happily smiling broadly.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /adverb/i.test(i.message),
    'expected an adverb overuse style issue');
});

test('repetition: spread 5 occurrences in 70 tokens IS flagged (dual-tier)', () => {
  const txt = 'The team met on Monday. We discussed many topics across several areas. ' +
              'The team agreed on a plan. Another five points were debated next. ' +
              'The team reconvened on Tuesday. Five new items came up for discussion. ' +
              'The team finalised the agenda. Three more details were sorted then. ' +
              'The team adjourned satisfied.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'repetition', i => /team/i.test(i.message),
    'expected dual-tier repetition flag for "team"');
});

test('style: nominalization flagged ("make a decision")', () => {
  const txt = 'We need to make a decision about this. The board will also give consideration to ' +
              'the proposal. The committee should take into consideration the risk profile.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /Nominalization/.test(i.message),
    'expected a nominalization issue');
});

test('style: cliché flagged ("at the end of the day")', () => {
  const txt = 'At the end of the day, all things considered, this is the best of both worlds.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /Cliché/.test(i.message),
    'expected a cliché issue');
});

test('style: sentence-start variety flagged', () => {
  const txt = 'The team met. The plan was reviewed. The notes were filed. ' +
              'The agenda was confirmed. The next meeting was scheduled.';
  const r = runEN(txt);
  hasCategoryIssue(r, 'style', i => /sentences start with/.test(i.message),
    'expected a sentence-start variety issue');
});

test('passive false positive ("I am interested") NOT flagged', () => {
  const txt = 'I am interested in the role. She is married. We are committed to this approach. ' +
              'He is dedicated to the team. They are pleased with the outcome.';
  const r = runEN(txt);
  const hasPassive = r.style.issues.some(i => /passive/i.test(i.message));
  if (hasPassive) throw new Error('false positive: adjectival "is interested"-style phrases flagged as passive');
});

test('empty text → score 100, no issues', () => {
  const r = runEN('   ');
  eq(r.overall.score, 100);
  eq(r.overall.totalIssues, 0);
});

test('result shape is stable', () => {
  const r = runEN(load('sample_problems.txt'));
  ['repetition','redundancy','clarity','style','consistency','tone','overall','meta'].forEach(k => {
    truthy(r[k] !== undefined, 'missing key ' + k);
  });
  truthy(Array.isArray(r.repetition.issues), 'repetition.issues should be an array');
  truthy(typeof r.meta.wordCount === 'number', 'meta.wordCount should be a number');
});

/* ------------------------------------------------------------------ */
/* Italian (it-IT) regression tests                                    */
/* ------------------------------------------------------------------ */

test('it-IT: language tag set in meta', () => {
  const r = runIT('Questo è un breve testo italiano.');
  eq(r.meta.language, 'it-IT', 'expected meta.language to be it-IT');
});

test('it-IT: repetition flagged on a tight Italian cluster', () => {
  const txt = 'La riunione era importante. La riunione è continuata. ' +
              'Durante la riunione abbiamo discusso molto. La riunione è finita tardi.';
  const r = runIT(txt);
  hasCategoryIssue(r, 'repetition', i => /riunion/i.test(i.message),
    'expected a repetition issue for "riunione"');
});

test('it-IT: redundancy flagged ("salire su", "uscire fuori")', () => {
  const txt = 'Abbiamo dovuto salire su per le scale e poi uscire fuori dall\'edificio velocemente.';
  const r = runIT(txt);
  hasCategoryIssue(r, 'redundancy', i => /salire/i.test(i.message),
    'expected redundancy for "salire su"');
  hasCategoryIssue(r, 'redundancy', i => /uscire/i.test(i.message),
    'expected redundancy for "uscire fuori"');
});

test('it-IT: nominalization flagged ("prendere in considerazione")', () => {
  const txt = 'Il comitato deve prendere in considerazione la proposta e poi fare una decisione.';
  const r = runIT(txt);
  hasCategoryIssue(r, 'style', i => /Nominalizzazione/i.test(i.message),
    'expected nominalization issue');
});

test('it-IT: cliché flagged ("alla fine della fiera")', () => {
  const txt = 'Alla fine della fiera, in fin dei conti, è stata una svolta epocale.';
  const r = runIT(txt);
  hasCategoryIssue(r, 'style', i => /Cliché/i.test(i.message),
    'expected a cliché issue');
});

test('it-IT: Gulpease index computed instead of Flesch', () => {
  const r = runIT('Questa è una frase breve. Anche questa è breve. Tre frasi totali.');
  truthy(r.clarity.stats.gulpease != null, 'expected Gulpease to be set');
  eq(r.clarity.stats.flesch, null, 'expected Flesch to be null in it-IT mode');
});

test('it-IT: verdict text is in Italian', () => {
  const txt = 'Salire su, uscire fuori, tornare indietro. ' +
              'Assolutamente essenziale. Risultato finale. Previsioni future.';
  const r = runIT(txt);
  truthy(/forte|buono|misto|debole/i.test(r.overall.verdict),
    'expected Italian verdict, got: ' + r.overall.verdict);
});

test('en-US still works after defaults moved to it-IT', () => {
  const r = runEN(load('sample_formal.txt'));
  eq(r.meta.language, 'en-US');
  ge(r.overall.score, 75);
});

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

console.log('\nAEA analysis engine — test run\n');
results.forEach(r => {
  const tag = r.ok ? '✓ PASS' : '✗ FAIL';
  console.log('  ' + tag + '  ' + r.name);
  if (!r.ok) console.log('       ' + r.error.message);
});
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed === 0 ? 0 : 1);
