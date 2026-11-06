import { brand } from "@/config/brand";

export type StatusPageKind = "not-found" | "expired" | "unavailable";

const COPY: Record<StatusPageKind, { title: string; body: string }> = {
  "not-found": {
    title: "This link doesn't exist",
    body: "Check the address, or make a new short link.",
  },
  expired: {
    title: "This link has expired",
    body: "Whoever shared it set it to stop working.",
  },
  unavailable: {
    title: "We couldn't open this link right now",
    body: "Try again in a moment.",
  },
};

// Every attribute is double-quoted, so a single quote is safe unescaped.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// The one place hex literals are allowed: a self-contained document has no
// access to the app's CSS variables. Values mirror DESIGN.md.
const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#fffdf9;color:#1a1a1a;font:15px/22px system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:768px;padding:48px 16px}
@media(min-width:768px){main{padding:48px 24px}}
h1{margin:0 0 8px;font:500 24px/30px Georgia,"Times New Roman",serif;letter-spacing:-.01em;text-wrap:balance}
@media(min-width:768px){h1{font-size:30px;line-height:36px}}
p{margin:0 0 24px;color:#6b6b6b;text-wrap:pretty}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 20px;border-radius:9999px;font-weight:500;text-decoration:none}
a.primary{background:#2563eb;color:#fff}
a.primary:hover{background:#1d4ed8}
a.secondary{color:#2563eb;padding:0 8px}
a.secondary:hover{color:#1d4ed8;text-decoration:underline}
a:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
`;

/** A complete, self-contained HTML document. */
export function renderStatusPage(
  kind: StatusPageKind,
  opts: { homeUrl: string; retryUrl?: string },
): string {
  const { title, body } = COPY[kind];
  const home = escapeHtml(opts.homeUrl);
  const retry = escapeHtml(opts.retryUrl ?? opts.homeUrl);
  const goHome = `Go to ${escapeHtml(brand.name)}`;
  const actions =
    kind === "unavailable"
      ? `<a class="primary" href="${retry}">Try again</a>\n<a class="secondary" href="${home}">${goHome}</a>`
      : kind === "expired"
        ? `<a class="primary" href="${home}">Make your own short link</a>`
        : `<a class="primary" href="${home}">${goHome}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
<div class="row">
${actions}
</div>
</main>
</body>
</html>
`;
}
