/**
 * Zaff-It web serving worker — explicit ASSETS handler.
 * Serves the Expo web export (apps/mobile/dist) with SPA fallback
 * (wrangler.jsonc: not_found_handling = single-page-application).
 */
interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response(`Zaff-It serving error: ${String(e)}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  },
} satisfies ExportedHandler<Env>;
