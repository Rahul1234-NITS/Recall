import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTask } from './normalize.js';

const j = (v) => JSON.stringify(v);

test('summary: keeps good sections, drops empty ones', () => {
  const r = parseTask('summary', j({ title: 'Cells', tldr: 'Cells are small.', keyPoints: ['A', '- B'], sections: [{ heading: 'H', points: ['p'] }, { heading: 'Empty', points: [] }], keyTerms: [{ term: '**ATP**', definition: 'energy' }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.keyPoints, ['A', 'B']);
  assert.equal(r.value.sections.length, 1);
  assert.equal(r.value.keyTerms[0].term, 'ATP');
  assert.match(r.warnings[0], /empty section/);
});

test('summary: nothing usable fails', () => {
  assert.equal(parseTask('summary', j({ title: 'x', sections: [], keyPoints: [] })).ok, false);
  assert.equal(parseTask('summary', '"just a string"').ok, false);
});

test('lesson: accepts a string body and drops a broken checkpoint', () => {
  const r = parseTask('lesson', j({ title: 'L', hook: 'h', objectives: [], sections: [{ heading: 'One', paragraphs: 'Para 1\n\nPara 2', checkpoint: { question: 'q' } }, { heading: 'No body' }], takeaways: [] }));
  assert.equal(r.ok, true);
  assert.equal(r.value.sections.length, 1);
  assert.equal(r.value.sections[0].paragraphs.length, 2);
  assert.equal(r.value.sections[0].checkpoint, null);
  assert.match(r.warnings[0], /1 incomplete/);
});

test('notes: formulas without an expression are dropped', () => {
  const r = parseTask('notes', j({ title: 'N', sections: [{ heading: 'A', bullets: ['x'] }], formulas: [{ name: 'Ohm', expression: 'V = IR' }, { name: 'none' }], mnemonics: [], pitfalls: [] }));
  assert.equal(r.value.formulas.length, 1);
});

test('subjective: clamps marks and requires an answer key', () => {
  const r = parseTask('subjective', j({ title: 'T', questions: [{ question: 'Q1', marks: 50, modelAnswer: 'A', keyPoints: ['k'] }, { question: 'Q2', marks: 'x' }, { question: 'Q3', marks: 'x', keyPoints: ['k'] }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.questions.map((q) => q.marks), [20, 5]);
  assert.match(r.warnings[0], /1 question/);
});

test('grade: matches by id, clamps scores, totals, reports missing', () => {
  const questions = [{ id: 's1', marks: 5 }, { id: 's2', marks: 3 }, { id: 's3', marks: 2 }];
  const r = parseTask('grade', j({ results: [{ id: 's1', score: 9, feedback: 'f', covered: [], missed: [] }, { id: 's2', score: 1.26, feedback: 'f' }, { id: 'ghost', score: 3 }], overall: 'ok' }), { context: { questions } });
  assert.equal(r.ok, true);
  assert.equal(r.value.results.s1.score, 5);
  assert.equal(r.value.results.s2.score, 1.5);
  assert.equal(r.value.total, 6.5);
  assert.equal(r.value.max, 8);
  assert.ok(r.warnings.some((w) => /could not be graded/.test(w)));
  assert.equal(parseTask('grade', j({ results: [] }), { context: { questions } }).ok, false);
});

test('ask: string answer is split into paragraphs', () => {
  const r = parseTask('ask', j({ answer: 'One.\n\nTwo.', points: [], fromMaterial: false, followUps: ['a', 'b'] }));
  assert.deepEqual(r.value.paragraphs, ['One.', 'Two.']);
  assert.equal(r.value.fromMaterial, false);
});

test('extract: too little text fails', () => {
  assert.equal(parseTask('extract', j({ title: 'x', text: 'hi' })).ok, false);
  assert.equal(parseTask('extract', j({ title: 'x', text: 'A long enough piece of text here.' })).ok, true);
});

test('cards and quiz go through the deck validator', () => {
  const r = parseTask('quiz', j({ title: 'Q', quiz: [{ question: 'q', options: ['a', 'b', 'c', 'd'], answerIndex: 1 }] }));
  assert.equal(r.ok, true);
  assert.equal(r.value.quiz.length, 1);
  assert.equal(parseTask('cards', j({ cards: [] })).ok, false);
});

test('unwraps { data: {...} } and flags truncation', () => {
  const r = parseTask('notes', j({ data: { title: 'N', sections: [{ heading: 'A', bullets: ['x'] }] } }), { finishReason: 'MAX_TOKENS' });
  assert.equal(r.ok, true);
  assert.equal(r.incomplete, true);
});

test('model broke off, apologised and started over: the fresh object is used', () => {
  const fresh = { topic: 'UDP', difficulty: 'medium', flashcards: [{ front: 'What does UDP stand for?', back: 'User Datagram Protocol' }, { front: 'Is UDP reliable?', back: 'No' }] };
  const text = '{"title": "UDP StudyI apologize for the truncation. Here is the JSON:\n\n' + JSON.stringify(fresh, null, 2);
  const r = parseTask('cards', text);
  assert.equal(r.ok, true);
  assert.equal(r.value.cards.length, 2);
  assert.equal(r.incomplete, false);
});

test('a cut-off answer is not replaced by one of its own inner objects', () => {
  const text = '{"title":"T","cards":[{"front":"a","back":"b"},{"front":"c","back":"d"},{"front":"e","ba';
  const r = parseTask('cards', text);
  assert.equal(r.ok, true);
  assert.equal(r.value.cards.length, 2);
  assert.equal(r.incomplete, true);
});
