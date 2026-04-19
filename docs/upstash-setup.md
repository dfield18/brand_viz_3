# Upstash Redis — Free-tier rate limit setup

The free-tier flow (`/api/free-run/execute`) enforces a daily cap on anonymous
runs (`FREE_TIER_RUNS_PER_IP_PER_DAY`, `FREE_TIER_RUNS_PER_SESSION_PER_DAY`)
via Upstash Redis through `@upstash/ratelimit`. Without Upstash configured,
those limits silently fail open — an attacker could trigger unlimited runs
and rack up OpenAI + Gemini spend.

This doc wires Upstash to Vercel in ~3 minutes.

---

## Option A — Vercel Marketplace (recommended)

The Vercel Marketplace integration automatically provisions the database
**and** sets `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on all
environments (production, preview, development) with one click.

1. Open the project on Vercel → **Storage** tab → **Create Database**.
2. Pick **Upstash for Redis** from the Marketplace.
3. Choose the **free** plan (10k commands/day is more than enough — each
   free run costs 2 commands).
4. Region: pick whatever matches your Functions region (default `us-east-1`
   is fine).
5. Connect the database to this project when prompted.

Vercel will inject the two env vars automatically. Redeploy the project
(or wait for the next git push) and the warnings in logs will go away.

## Option B — Manual env vars

If you want to manage the Upstash account directly:

1. Sign up / log in at <https://console.upstash.com>.
2. **Create a new Redis database** (free tier, Global region).
3. Open the database → **REST API** section. Copy:
   - **UPSTASH_REDIS_REST_URL**
   - **UPSTASH_REDIS_REST_TOKEN**
4. In Vercel: **Project → Settings → Environment Variables**. Add both,
   checked for **Production**, **Preview**, and **Development**.
5. Trigger a redeploy: `vercel --prod` or push to `main`.

---

## Verify it's working

After deploy, run a free-tier report once. Then check Vercel logs:

```
vercel logs --follow
```

The `[rateLimit] Upstash not configured` warnings should be gone.

Hit the endpoint 11 times from the same IP within 24h and the 11th call
should return:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1713528000000
Retry-After: 86400
```

---

## Enable strict mode (defense-in-depth)

By default the app is **fail-open with warnings** for free-tier tiers if
Upstash is missing or throws. Once Upstash is proven stable, flip strict
mode on so an Upstash outage fails closed (returns 503) rather than
silently opening the floodgates:

```
FREE_TIER_RATE_LIMIT_STRICT=true
```

Add it alongside the two Upstash env vars on Vercel. In strict mode:

- Upstash not configured + free-tier endpoint → **503**
- Upstash throws a runtime error (network/auth) + free-tier endpoint → **503**
- All other tiers (`read`, `write`, `expensive`) still fail open since their
  only risk is internal QPS, not external dollars.

Strict mode is off by default because a bad Upstash config would hard-break
the landing page for anonymous visitors. Leave it off until Upstash has
been live for at least one deploy cycle without warnings.

---

## Tuning the limits

All three knobs are env-backed in `src/config/freeTier.ts`:

| Env var                                | Default | Purpose                                |
| -------------------------------------- | ------- | -------------------------------------- |
| `FREE_TIER_RUNS_PER_IP_PER_DAY`        | `10`    | Daily cap per client IP                |
| `FREE_TIER_RUNS_PER_SESSION_PER_DAY`   | `10`    | Daily cap per anonymous session cookie |
| `FREE_TIER_RATE_LIMIT_STRICT`          | `false` | Fail closed on Upstash issues          |

Lower the numbers if you see abuse; raise them for a launch-day bump.

---

## Where the code lives

- Rate-limit tiers + helpers: `src/lib/rateLimit.ts`
- Free-tier config (env-backed constants): `src/config/freeTier.ts`
- Enforcement point: top of `POST /api/free-run/execute`
  (`src/app/api/free-run/execute/route.ts`)
