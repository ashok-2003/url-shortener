import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveRedirect } from "@/server/redirect/resolve";

function handle(request: Request) {
  const { env, ctx, cf } = getCloudflareContext();
  return resolveRedirect({
    request,
    env,
    waitUntil: ctx.waitUntil.bind(ctx),
    cf,
  });
}

export { handle as GET, handle as HEAD };
