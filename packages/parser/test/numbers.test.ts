import { describe, expect, it } from 'vitest';
import { toNumber } from '../src/numbers.js';

describe('toNumber', () => {
  it('converts a comma decimal separator', () => {
    expect(toNumber('56,5')).toBe(56.5);
  });

  it('converts an apostrophe decimal separator', () => {
    expect(toNumber("56'5")).toBe(56.5);
  });

  it('converts a dot decimal separator', () => {
    expect(toNumber('56.5')).toBe(56.5);
  });

  it('treats a dot followed by exactly 3 digits as a thousands separator', () => {
    expect(toNumber('2.400')).toBe(2400);
  });

  it('parses plain integers', () => {
    expect(toNumber('180')).toBe(180);
  });

  it('does NOT treat a dot followed by 1 digit as a thousands separator', () => {
    expect(toNumber('56.5')).toBe(56.5);
  });

  it('does NOT treat a dot followed by 2 digits as a thousands separator', () => {
    expect(toNumber('22.50')).toBe(22.5);
  });
});
