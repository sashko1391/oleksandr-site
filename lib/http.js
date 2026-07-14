// Shared HTTP helpers for API routes.

/**
 * Log a structured error and reply with a generic JSON error (no internals leaked).
 * @param {{ status: (c: number) => { json: (b: unknown) => unknown } }} res
 * @param {number} code
 * @param {string} event
 * @param {unknown} err
 */
export function jsonError(res, code, event, err) {
  console.error(JSON.stringify({ level: 'error', event, msg: String(err) }));
  return res.status(code).json({ error: 'temporarily unavailable' });
}
