import { describe, it, expect } from 'vitest';
import { CommentInput } from '../lib/schema.js';

const base = {
  slug: 'journal/vira-i-religiya',
  author_name: 'Оля',
  body: 'Гарний текст, дякую.',
  consent: true,
  turnstileToken: 'tok',
};

describe('CommentInput', () => {
  it('accepts a valid top-level comment', () => {
    expect(CommentInput.safeParse(base).success).toBe(true);
  });
  it('accepts a valid reply with positive parent_id', () => {
    expect(CommentInput.safeParse({ ...base, parent_id: 5 }).success).toBe(true);
  });
  it('rejects a filled honeypot', () => {
    expect(CommentInput.safeParse({ ...base, hp: 'bot' }).success).toBe(false);
  });
  it('requires consent === true', () => {
    expect(CommentInput.safeParse({ ...base, consent: false }).success).toBe(false);
  });
  it('rejects empty body and over-long name', () => {
    expect(CommentInput.safeParse({ ...base, body: '   ' }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, author_name: 'x'.repeat(61) }).success).toBe(false);
  });
  it('rejects non-positive / non-integer parent_id', () => {
    expect(CommentInput.safeParse({ ...base, parent_id: 0 }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, parent_id: -3 }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, parent_id: 1.5 }).success).toBe(false);
  });
  it('trims and enforces max body length', () => {
    expect(CommentInput.safeParse({ ...base, body: 'a'.repeat(4001) }).success).toBe(false);
  });
});
