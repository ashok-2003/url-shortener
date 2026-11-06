import "server-only";
import { renderStatusPage } from "@/features/status-pages/render";

/**
 * The redirect seam (spec section 6), shared by `app/[slug]/route.ts` and,
 * later, the Worker fast path. TEMP stub: always 404. Workstream C replaces the
 * body, not the signature.
 */
export async function resolveRedirect(args: {
  request: Request;
  env: CloudflareEnv;
  waitUntil: (p: Promise<unknown>) => void;
  cf?: { country?: string | null } | null;
}): Promise<Response> {
  const origin = new URL(args.request.url).origin;
  return new Response(
    renderStatusPage("not-found", { homeUrl: `${origin}/` }),
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private, no-store",
      },
    },
  );
}
