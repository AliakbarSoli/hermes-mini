# hermes-mini — agent handoff

Personal Telegram daily-task assistant («هرمس» tiny version) for Amir
(Telegram user ID `2006571563`, the only user). Fully on the Cloudflare
**free plan** — no payment method on the account, and none may be added.

## Current state (2026-10-19)

- LIVE: Worker `hermes-mini` at `https://hermes-mini.abroon234.workers.dev`
- Telegram webhook set with secret token; `getWebhookInfo` clean
- D1 `hermes-mini` (id `fae0312a-cfb0-4432-a1d4-0dcf1339f76b`), migration
  `0001_init.sql` applied
- Cron `*/15` attached; reminder fires at 08:00 Asia/Tehran
  (`REMINDER_HOUR` var, minute < 15 guard in code)
- E2E verified: simulated `/add` + `/today` → 200 ok → row in D1
- One leftover test row in DB: «تست نهایی ربات» — user may `/del 1`
- Everything is UNCOMMITTED on purpose (user's git rules): never commit or
  push without a fresh explicit ask in the current turn; never merge; MRs only.

## Layout

- `src/index.ts` — the whole worker: `fetch` (webhook) + `scheduled` (reminder)
- `migrations/0001_init.sql` — `tasks` table
- `wrangler.jsonc` — vars (`ALLOWED_TELEGRAM_ID`, `AI_MODEL`,
  `REMINDER_HOUR`), D1 binding, AI binding, cron, observability on
- Secrets (names only — values never go into files/logs/output):
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

## Commands

```bash
npx tsc --noEmit                                        # verification baseline
npx wrangler deploy
npx wrangler tail                                       # live logs
npx wrangler d1 migrations apply hermes-mini --remote
npx wrangler d1 execute hermes-mini --remote --json --command "SELECT ..."
```

Auth: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` come from
`~/.zshenv` — an account-owned token (`cfat_` prefix). Never echo or persist
it. For Cloudflare API facts and gotchas load the user-level `cf-ops` skill.

## Behavior spec

- Commands: `/add`, `/today` | `/list`, `/done N`, `/undone N`, `/del N`,
  `/start` | `/help` — replies in Persian
- Free text → Workers AI (`env.AI.run`, model = `AI_MODEL` var, default
  `@cf/meta/llama-3.1-8b-instruct`) must return strict JSON action
  `{action: add|done|undone|list|chat, ...}`. Parse failure falls back to
  adding the text as a new task — never lose user input.
- "today" = Asia/Tehran calendar day via `Intl`
- Only `ALLOWED_TELEGRAM_ID` is served; other senders are ignored silently.
  If the var is empty the bot replies with the sender's numeric ID
  (bootstrap path).

## Gotchas (all hit live — don't rediscover them)

- Workers onboarding in the dashboard auto-creates a Zero Trust Access app
  named "All Workers" (destination `all_workers`) that 302-redirects every
  workers.dev request to a cloudflareaccess login page → webhooks die. If
  the bot goes silent, check Access apps FIRST. Dashboard only — the
  account token can read but not mutate them.
- workers.dev is filtered inside Iran — the user's own browser can't open
  it (he browses through a VPN). Telegram's servers reach it fine.
- The account-owned API token cannot register a workers.dev subdomain
  (`10405`), and cron attach fails (`10063`) until one exists. Subdomain
  `abroon234` now exists.
- `tg.amirabroun.ir` custom domain is ALREADY attached to this worker (with
  an issued cert), but the `amirabroun.ir` zone is still `pending` — the
  registrar NS flip hasn't happened. When the zone activates: uncomment the
  `routes` block in `wrangler.jsonc`, set `workers_dev: false`, redeploy,
  and re-run `setWebhook` with the new URL.

## Backlog — propose to the user first, then execute

User rule: new work streams start with an upfront approach proposal; he
picks. Test code is ask-first. Candidates:

- Validate the AI action against a real schema (today: regex + JSON.parse)
- Multi-day support: history, `/week`, carry-over of unfinished tasks
- Telegram 429/flood retry and proper error path (`tg()` is
  fire-and-forget today)
- Model experiments: `@cf/qwen/qwen3-30b-a3b-fp8` (cheaper, better Persian)
- Tests (vitest + workers pool) — ask first
