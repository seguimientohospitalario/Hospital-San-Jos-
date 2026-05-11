# Hospital San José — AGENTS.md

## Repo structure

Multi-project layout with **no root package.json**. Each component is independent:

| Path | Tech | Entrypoint | Deploy target |
|---|---|---|---|
| `public/` | Vanilla JS + Supabase CDN | `index.html` | Static host (any) |
| `rpa-backend/` | Node.js 18+, Express, Puppeteer | `server.js` | Cloud (Render, Railway, etc.) |
| `cloudflare-worker/` | JavaScript (CF Workers runtime) | `worker.js` | Cloudflare Workers |
| `supabase/functions/create-user/` | Deno / Supabase Edge Functions | `index.ts` | Supabase |

## Commands

- **RPA backend start:** `node server.js` (from `rpa-backend/`)
- **Supabase local dev:** Requires [Supabase CLI](https://supabase.com/docs/reference/cli). Run `supabase start` from repo root, then invoke function via `curl` (see `supabase/functions/create-user/index.ts:27-30`)
- **Cloudflare Worker deploy:** `npx wrangler deploy` from `cloudflare-worker/` (requires `wrangler.toml`; currently absent — add one first)

No test, lint, typecheck, or format commands exist. No CI config.

## Architecture notes

- **Frontend** is a plain multi-page app (not SPA). Uses `@supabase/supabase-js@2` loaded from CDN. Auth state managed client-side via localStorage (`remember` checkbox).
- **RPA backend** scrapes `https://dondemeatiendo.essalud.gob.pe` with Puppeteer + Chromium. Optimized for serverless (`@sparticuz/chromium`). Endpoints: `POST /validate` (single), `POST /validate-batch` (batch). Sequential batch processing with 2s delay between patients.
- **Cloudflare Worker** proxies DNI lookups to `https://buscardniperu.com`. Validates 8-digit DNI, returns `fecha_nac` (dd/mm/yyyy) and `fecha_iso` (yyyy-mm-dd).
- **Supabase Edge Function** (`create-user`) is a boilerplate stub. JWT-protected (`verify_jwt = true`). Deno editor support is configured in `.vscode/settings.json` — requires `denoland.vscode-deno` extension.
- No shared code between components. Each can be deployed independently.

## Style & conventions

- Supabase client uses `snake_case` columns (e.g. `fecha_nacimiento`, `codigo_verificacion`)
- Supabase anon key is exposed in `public/js/supabase-config.js` (expected for client-side usage)
- Spanish: code comments, commit messages, UI text, and variable names
- RPA backend logs with `[Browser]`, `[RPA]`, `[Server]` prefixes
