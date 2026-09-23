# Deploying app8n

app8n is local-first by default: one implicit owner, SQLite on disk, no login.
Deploying it to a machine other people can reach changes the threat model — the
backend holds Google refresh tokens and can send mail as you — so this document
covers both what to run and what to lock down.

---

## 1. The shape of a deployment

Two processes, one image:

| Process | Command | Why it is separate |
| --- | --- | --- |
| Web backend | `node server.js` | Serves the UI and the API. |
| Scheduler | `node dist/worker.cjs` | Fires cron and `gmail_poll` workflows, expires stale approval gates, closes runs whose process died. Schedules must keep running when nobody has the app open, so this cannot live inside a request lifecycle. |

Both mount the same data volume and apply migrations at boot, so whichever
starts first creates the schema.

```bash
cp .env.example .env          # fill it in — see section 2
docker compose up -d --build
curl -s localhost:3000/api/health | jq
```

Without Docker:

```bash
npm ci
npm run build && npm run build:worker
node .next/standalone/server.js   # with .next/static and public/ beside it
node dist/worker.cjs              # second process
```

## 2. Environment

The full annotated list is in `.env.example`. A production boot **refuses to
start** unless these are right — `src/lib/env.ts` runs at boot through
`src/instrumentation.ts` and exits non-zero with the specific problem, rather
than starting a server that fails later on the first real request.

| Variable | Required in production | Note |
| --- | --- | --- |
| `APP8N_ENCRYPTION_KEY` | yes | 32 bytes of base64 from `npm run vault:keygen`. Root of trust for every stored credential; lose it and they are unrecoverable. Back it up somewhere other than the server. |
| `APP_URL` | yes | The public URL. OAuth redirects and webhook URLs are built from it, so a `localhost` value in production is rejected. |
| `APP8N_ACCESS_TOKEN` | yes | See section 3. |
| `DATABASE_URL` | — | `file:./data/app8n.db`. The volume must be persistent; losing it loses linked accounts and history. |
| `ANTHROPIC_API_KEY` | no | Optional: a key saved from the settings screen lives in the vault and takes precedence. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Without them no Google account can be connected. Add `$APP_URL/api/auth/google/callback` to the client's authorised redirect URIs. |
| `APP8N_NOTIFY_WEBHOOK_URL` | no | Where approval gates go when nobody is looking at the app. See section 5. |
| `APP8N_MOCK_GOOGLE` | no | `1` swaps Google for in-memory fixtures. How CI runs; never what you want in production. |

## 3. Access control

app8n has no login. On a laptop that is correct. On a server it would mean
anyone who finds the port can act as you, so `src/proxy.ts` gates every request
when `APP8N_ACCESS_TOKEN` is set:

- API clients and the native shell send `Authorization: Bearer <token>` (or
  `x-app8n-access-token`);
- a browser opens `https://your-host/?access_token=<token>` **once** and keeps
  an httpOnly cookie for 30 days.

Two paths are deliberately exempt:

- `/api/health`, so an orchestrator can probe without holding a credential;
- `/api/hooks/*`, which authenticates each call against that workflow's own
  vault-stored secret in constant time.

Generate a token with `openssl rand -base64 32`. `APP8N_ALLOW_UNAUTHENTICATED=1`
skips the requirement for genuinely private networks; it is logged loudly at
boot, because it means exactly what it says.

Put TLS in front of it. The token, the OAuth callback and every approval
decision cross the wire.

## 4. Health and restarts

`GET /api/health` returns `200` when the database is reachable, the vault has a
key and the environment has no errors; `503` otherwise, with the specific
problems listed. It reports what is configured, never the values. The Docker
healthcheck and the compose `depends_on` both use it.

A run whose process is killed cannot close its own row. The scheduler sweeps
`running` executions older than 15 minutes on each tick and marks them failed,
so a restart mid-run leaves an accurate history rather than a ghost.

## 5. Approval notifications

An approval gate raised by the 7am scheduler is useless if it only exists on a
screen nobody is holding. Set `APP8N_NOTIFY_WEBHOOK_URL` and every background
gate POSTs a JSON payload to it:

```json
{
  "kind": "approval_required",
  "title": "app8n needs your approval",
  "message": "Send an email to dean@university.edu",
  "url": "https://your-host/approvals",
  "approvalRequestId": "…",
  "toolName": "gmail_send_email",
  "at": "2026-09-23T06:00:00.000Z"
}
```

It works with ntfy, Slack, Discord, Home Assistant or anything else that
accepts a POST — no account, SDK or push certificate. Failures are swallowed:
a notification must never fail the run that raised it.

**Native push is not wired.** `@capacitor/push-notifications` is installed, but
delivering to a device needs an APNs key and an FCM project, which this
repository does not have. When you have them, the hook to fill is
`notifyApprovalRequired` in `src/lib/notify.ts` — it is already called from
every background run, so native push is an added transport, not new plumbing.

## 6. Webhook triggers

A `webhook` workflow gets a URL and a secret from the blueprints screen
("Show webhook URL"), minted on first reveal and stored encrypted:

```bash
curl -X POST https://your-host/api/hooks/<workflow-id> \
  -H "x-app8n-webhook-secret: <secret>" \
  -H "content-type: application/json" \
  -d '{"lead":{"name":"Ada","email":"ada@example.com"}}'
```

A missing or wrong secret answers `404`, not `401`, so the endpoint cannot be
used to discover which workflow ids exist. The body reaches the run quoted as
data, explicitly labelled as not-instructions, and every gated tool still stops
at the approval card — a webhook cannot talk the agent into sending mail.

## 7. Backups

Back up two things, together:

1. the database (`data/app8n.db`, plus the `-wal` and `-shm` files, or
   `sqlite3 app8n.db ".backup"` for a consistent copy);
2. `APP8N_ENCRYPTION_KEY`.

Either without the other is useless: the database holds only ciphertext, and
the key alone decrypts nothing.

## 8. Scaling notes, honestly

- **One instance.** SQLite plus WAL is fine for a single-user backend and is
  not a cluster story. More than one web instance needs Postgres, which the
  schema is written for but the client is not yet wired to.
- **One scheduler.** Two workers would run the same cron job twice; there is no
  leader election.
- **Migrations at boot** are right for one instance. Set `APP8N_AUTO_MIGRATE=0`
  and run migrations as a release step before scaling out.

## 9. Mobile

`capacitor.config.ts` is written and `mobile/shell/index.html` exists, but the
iOS and Android projects are not generated or committed, and the `app8n://`
scheme still has to be registered in both. Point `APP8N_SERVER_URL` at the
deployment, run `npm run cap:sync`, then `cap:add:ios` / `cap:add:android`.
The OAuth flow already returns to `APP8N_MOBILE_REDIRECT_URI` rather than a web
page, so the native path is handled on the backend side.
