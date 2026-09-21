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

/**
 * A minimal self-contained HTML page for the endpoints a person opens from an email
 * (confirm / unsubscribe). No external resources, noindex, and no Referer leak of the token.
 * @param {{ res: any, status?: number, title: string, heading: string, body: string, form?: string }} p
 */
export function htmlPage({ res, status = 200, title, heading, body, form = '' }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer'); // the token is in the URL — never pass it on
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(status).send(`<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${title} | Олександр Кравченко</title>
<style>
  :root { --blue-deep:#1B3A5C; --blue-sky:#5BA4D9; --milk:#F5F0EA; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:24px; background:var(--milk); color:#1a1a1a; line-height:1.6;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  main { max-width:560px; width:100%; background:#fff; border-radius:12px; padding:32px; }
  h1 { font-size:1.5rem; color:var(--blue-deep); margin:0 0 1rem; }
  p { margin:0 0 1rem; }
  button { background:var(--blue-deep); color:var(--milk); border:0; border-radius:8px;
    padding:14px 24px; font:inherit; font-weight:600; cursor:pointer; min-height:48px; }
  button:hover { background:#24517f; }
  a { color:var(--blue-deep); }
  .muted { color:#555; font-size:.95rem; }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  ${body}
  ${form}
  <p class="muted"><a href="https://www.parkinsandr.tech/">parkinsandr.tech</a></p>
</main>
</body>
</html>`);
}
