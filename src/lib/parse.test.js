// Run with: npm test   (uses Node's built-in test runner, no extra packages)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, closeTruncatedJson, normalizeDeck, parseDeck } from './parse.js';

const good = {
  title: 'Cells',
  cards: [{ front: 'Powerhouse of the cell?', back: 'Mitochondria' }],
  quiz: [{ question: 'Which organelle makes ATP?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], answerIndex: 1 }],
};

test('parses clean JSON', () => {
  const r = parseDeck(JSON.stringify(good), { mode: 'both' });
  assert.equal(r.ok, true);
  assert.equal(r.deck.cards.length, 1);
  assert.equal(r.deck.quiz[0].answerIndex, 1);
  assert.deepEqual(r.warnings, []);
});

test('strips markdown fences and surrounding prose', () => {
  const text = 'Sure! Here you go:\n```json\n' + JSON.stringify(good) + '\n```\nGood luck!';
  assert.equal(extractJson(text).ok, true);
});

test('handles trailing commas', () => {
  const r = extractJson('{"title":"A","cards":[{"front":"x","back":"y"},],"quiz":[],}');
  assert.equal(r.ok, true);
  assert.equal(r.value.cards.length, 1);
});

test('recovers complete items from a truncated answer', () => {
  const cut = '{"title":"T","cards":[{"front":"a","back":"b"},{"front":"c","back":"d"},{"front":"e","ba';
  // The half-written third card survives as {"front":"e"} and is then dropped by validation.
  const value = JSON.parse(closeTruncatedJson(cut));
  assert.equal(value.cards.length, 3);

  const r = parseDeck(cut, { mode: 'cards' });
  assert.equal(r.ok, true);
  assert.equal(r.deck.cards.length, 2);
  assert.match(r.warnings[0], /cut off/);
});

test('empty and non-JSON answers fail with a reason', () => {
  assert.equal(extractJson('').ok, false);
  assert.equal(extractJson('I cannot help with that.').ok, false);
});

test('wrong shape fails instead of crashing', () => {
  assert.equal(normalizeDeck('hello').ok, false);
  assert.equal(normalizeDeck(null).ok, false);
  assert.equal(normalizeDeck({ foo: 'bar' }, { mode: 'both' }).ok, false);
  assert.equal(normalizeDeck({ cards: 'not an array' }, { mode: 'cards' }).ok, false);
});

test('accepts common alias keys', () => {
  const r = normalizeDeck({ flashcards: [{ question: 'Q', answer: 'A' }] }, { mode: 'cards' });
  assert.equal(r.ok, true);
  assert.equal(r.deck.cards[0].front, 'Q');
});

test('drops bad quiz items but keeps good ones', () => {
  const r = normalizeDeck(
    {
      title: 'Mixed',
      cards: [],
      quiz: [
        { question: 'ok', options: ['a', 'b', 'c', 'd'], answerIndex: 2 },
        { question: 'index out of range', options: ['a', 'b'], answerIndex: 7 },
        { question: 'one option', options: ['a'], answerIndex: 0 },
        { question: 'answer by text', options: ['Red', 'Blue'], answer: 'blue' },
        { question: 'answer by letter', options: ['x', 'y', 'z'], answer: 'C' },
        'garbage',
      ],
    },
    { mode: 'quiz' },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.deck.quiz.map((q) => q.answerIndex),
    [2, 1, 2],
  );
  assert.match(r.warnings.join(' '), /3 quiz questions skipped/);
});

test('removes duplicate options and keeps the answer pointing at the right one', () => {
  const r = normalizeDeck({ quiz: [{ question: 'q', options: ['A', 'a', 'B', 'C'], answerIndex: 2 }] }, { mode: 'quiz' });
  assert.deepEqual(r.deck.quiz[0].options, ['A', 'B', 'C']);
  assert.equal(r.deck.quiz[0].answerIndex, 1);
});

test('dedupes flashcards and reports it', () => {
  const r = normalizeDeck(
    { cards: [{ front: 'Same', back: '1' }, { front: 'same ', back: '2' }, { front: 'Other', back: '3' }] },
    { mode: 'cards' },
  );
  assert.equal(r.deck.cards.length, 2);
  assert.match(r.warnings[0], /duplicate/);
});

test('warns when one half of a "both" request is empty', () => {
  const r = normalizeDeck({ title: 't', cards: [{ front: 'f', back: 'b' }], quiz: [] }, { mode: 'both' });
  assert.equal(r.ok, true);
  assert.match(r.warnings[0], /only flashcards/);
});
