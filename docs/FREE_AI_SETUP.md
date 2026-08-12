# El Molino Ops — Free-Only AI Router

The production assistant is intentionally provider-agnostic. It rotates through configured free lanes and falls back to local El Molino/app knowledge if every external lane is unavailable.

## Provider lanes

1. OpenRouter — `openrouter/free` only. This is OpenRouter's zero-cost router across currently available free models.
2. Google Gemini — only models listed in `GEMINI_FREE_MODELS`; use a Gemini API project that remains on the Free Tier.
3. Groq — only the configured `GROQ_FREE_MODELS`; use the free developer tier and do not upgrade billing.
4. GitHub Models — included free quota only; paid model usage must remain disabled on the GitHub account.
5. Cloudflare Workers AI — use a Workers Free account so requests hard-stop after the daily free allocation.

## Required Vercel environment variables

Add any subset. The router automatically skips missing providers.

- `OPENROUTER_API_KEY`
- `OPENROUTER_FREE_ONLY=true`
- `GEMINI_API_KEY`
- `GEMINI_FREE_ONLY=true`
- `GROQ_API_KEY`
- `GROQ_FREE_ONLY=true`
- `GITHUB_MODELS_TOKEN`
- `GITHUB_MODELS_FREE_ONLY=true`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_FREE_ONLY=true`

Optional model overrides:

- `GEMINI_FREE_MODELS`
- `GROQ_FREE_MODELS`
- `GITHUB_FREE_MODELS`
- `CLOUDFLARE_FREE_MODELS`

Never place provider secrets in client-side `NEXT_PUBLIC_*` variables.

## Failure behavior

- 429 / quota errors: cool that model down and immediately try the next lane.
- 401: cool the bad credential for 30 minutes and rotate.
- 402 / billing / insufficient credit: cool that lane for 6 hours and rotate.
- 403: cool the provider and rotate.
- 400 / 404: treat the configured model as unavailable and rotate.
- 5xx / network timeout: short cooldown and rotate.
- Every external lane fails: return the app's local El Molino knowledge fallback; never expose raw provider errors to the user.

## Production gate

`npm run build` runs `npm run test:ai` before Next.js compilation. A deployment fails if the router's quota/failover tests fail.

The public diagnostic `GET /api/ask` returns only boolean provider configuration status. It never returns API keys.
