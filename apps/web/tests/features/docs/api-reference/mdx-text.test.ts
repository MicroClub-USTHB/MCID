import { describe, expect, it } from 'vitest';

import { cellText, linkText } from '@/features/docs/api-reference/mdx-text';

describe('cellText', () => {
  it('escapes a pipe so it cannot end the cell', () => {
    expect(cellText('a | b')).toBe('a \\| b');
  });

  it('keeps an author-written escaped pipe from cancelling the escape', () => {
    expect(cellText('a \\| b')).toBe('a \\\\\\| b');
  });

  it('leaves backslashes inside code spans alone', () => {
    expect(cellText('use `a\\b` here')).toBe('use `a\\b` here');
  });

  it('keeps the escape on a leading # and joins lines', () => {
    expect(cellText('#1\nsecond')).toBe('\\#1 second');
  });

  it('returns an empty string for no text', () => {
    expect(cellText(undefined)).toBe('');
  });
});

describe('linkText', () => {
  it('escapes brackets, pipes and the backslashes before them', () => {
    expect(linkText('List [all] \\[x\\] | y')).toBe('List \\[all\\] \\\\\\[x\\\\\\] \\| y');
  });
});
