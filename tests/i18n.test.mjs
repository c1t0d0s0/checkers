import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, detectLang } from '../js/i18n.js';

test('ja and en have the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.ja).sort(), Object.keys(STRINGS.en).sort());
});

test('language detection', () => {
  assert.equal(detectLang({ languages: ['ja-JP', 'en-US'] }), 'ja');
  assert.equal(detectLang({ languages: ['ja'] }), 'ja');
  assert.equal(detectLang({ languages: ['en-US', 'ja'] }), 'en');
  assert.equal(detectLang({ languages: ['fr-FR'] }), 'en');
  assert.equal(detectLang({ languages: [], language: 'ja-JP' }), 'ja');
  assert.equal(detectLang(undefined), 'en');
});
