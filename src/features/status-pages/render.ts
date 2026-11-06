export type StatusPageKind = "not-found" | "expired";

const COPY: Record<StatusPageKind, { title: string; body: string }> = {
  "not-found": {
    title: "This link doesn't exist",
    body: "Check the address, or make a new short link.",
  },
  expired: {
    title: "This link has expired",
    body: "Its owner set it to stop working. Ask them for a fresh one.",
  },
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** A complete HTML document. Workstream B restyles it. */
export function renderStatusPage(
  kind: StatusPageKind,
  opts: { homeUrl: string },
): string {
  const { title, body } = COPY[kind];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${body}</p>
<p><a href="${escapeAttr(opts.homeUrl)}">Make a short link</a></p>
</main>
</body>
</html>
`;
}
