// Runtime validation for the comment POST body (boundary validation, Zod v4).
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
