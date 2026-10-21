import sharp from "sharp";
import { runMigrations } from "./database/migrate";
import { seedIfEmpty } from "./database/seed";
import { adminRoutes } from "./routes/admin";
import { apiRoutes } from "./routes/api";
import { appRoutes } from "./routes/app";
import { initAssets } from "./services/assets";
import { log } from "./services/logger";
import { validateEnv } from "./utils/env";
import { render500 } from "./utils/errors";
import { handleFallback } from "./utils/fallback";
import {
  handleGuarded,
  secureRoutes,
  withSecurityHeaders,
} from "./utils/security-headers";

validateEnv();

// libvips keeps an operation cache whose defaults (50MB / 20 files / 100 items)
// are tuned for a batch image tool, not a web server rendering one OG image per
// unfurl. Every render here builds its own SVGs and composites them once, so no
// two operations are ever identical and the cache runs at a 0% hit rate — with
// the stock settings it sat pinned at 100 items for the life of the process,
// holding buffers nothing would ever ask for again. Capping it did not measurably
// move RSS, so this is about not paying for a cache we never hit rather than
// about reclaiming a known quantity. `files: 0` because every input we hand
// sharp is already a Buffer.
sharp.cache({ memory: 16, items: 20, files: 0 });

await runMigrations();
await seedIfEmpty();
await initAssets();

const server = Bun.serve({
  port: Number(process.env.PORT),
  idleTimeout: 30,
  routes: secureRoutes({
    ...appRoutes,
    ...adminRoutes,
    ...apiRoutes,
  }),
  async fetch(req) {
    return handleGuarded(req, handleFallback);
  },
  // Last-resort backstop for anything the guarded pipeline doesn't catch (e.g.
  // an error thrown in routing itself). Overriding Bun's default also stops its
  // dev error page — which can leak a stack trace — from ever being served. No
  // request is available here, so headers are stamped without compression.
  error() {
    try {
      return withSecurityHeaders(render500());
    } catch {
      return new Response("Internal Server Error", { status: 500 });
    }
  },
});

log.info("server", `Listening on port ${server.port}`);
