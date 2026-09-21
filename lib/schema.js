// Runtime validation for API request bodies (boundary validation, Zod v4).
import { z } from 'zod';

export const CommentInput = z.object({
  slug: z.string().min(1).max(120),
  parent_id: z.number().int().positive().optional(),
  author_name: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(4000),
  consent: z.literal(true),
  turnstileToken: z.string().min(1).max(4096),
  // Honeypot: bots fill it; humans never see it. Schema lets it through so the
  // handler can log `honeypot_tripped` explicitly (a .max(0) here would make
  // that handler branch unreachable — generic 400 with no signal).
  hp: z.string().max(200).optional(),
});

/** @typedef {z.infer<typeof CommentInput>} CommentInput */

/** The four sections a reader can subscribe to; an empty list means "everything". */
export const TOPICS = ['parkinson', 'code', 'creative', 'journal'];

export const SubscribeInput = z.object({
  // 254 is the RFC 5321 maximum; lowercased here so the citext unique index and the HMAC agree
  email: z.string().trim().toLowerCase().email().max(254),
  topics: z.array(z.enum(TOPICS)).max(TOPICS.length).default([]),
  consent: z.literal(true),
  turnstileToken: z.string().min(1).max(4096),
  source: z.string().max(120).optional(),
  // Honeypot: let it through so the handler can log `honeypot_tripped` (a .max(0) here would make
  // that branch unreachable — a generic 400 with no signal).
  hp: z.string().max(200).optional(),
});

/** A token arriving from an emailed link: base64url, never logged, never echoed back. */
export const TokenInput = z.object({
  token: z.string().trim().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/),
});

/** @typedef {z.infer<typeof SubscribeInput>} SubscribeInput */
