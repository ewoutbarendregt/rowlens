import { describe, expect, it } from 'vitest';
import { nameMatches, normalizeName, similarNames } from './names.ts';

describe('normalizeName', () => {
  it('ignores accents, case, punctuation and extra spaces', () => {
    expect(normalizeName('  Joël   de Vries ')).toBe('joel de vries');
    expect(normalizeName("Anne-Marie O'Neil")).toBe('anne marie o neil');
  });
});

describe('nameMatches', () => {
  it.each([
    ['Jan de Vries', '', true],
    ['Jan de Vries', 'ja', true],
    ['Jan de Vries', 'vri', true],
    ['Jan de Vries', 'DE V', true],
    ['Joël Bakker', 'joel', true],
    ['Jan de Vries', 'ries', false],
    ['Jan de Vries', 'piet', false],
  ])('%s with %j → %s', (name, query, expected) => {
    expect(nameMatches(name, query)).toBe(expected);
  });
});

describe('similarNames', () => {
  it.each([
    ['Jan de Vries', 'jan de vries', true],
    ['Joël de Vries', 'Joel de Vries', true],
    ['Jan', 'Jan de Vries', true],
    ['Jansen', 'Janssen', true],
    ['Marieke Visser', 'Mareike Visser', true],
    ['Anna', 'Anne', true],
    ['Jan', 'Jon', true],
    ['Jan', 'Piet', false],
    ['Anna Bakker', 'Hanna Smit', false],
    ['Jan de Vries', 'Jan Smit', false],
    ['', 'Jan', false],
  ])('%s ~ %s → %s', (a, b, expected) => {
    expect(similarNames(a, b)).toBe(expected);
    expect(similarNames(b, a)).toBe(expected);
  });
});
