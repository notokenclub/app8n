<div align="center">

# app8n

**An open-source agentic OS for your digital life.**

Talk to it like a person. It reads your mail, guards your calendar, files your leads
and asks permission before it does anything you can't take back.

Built by **NoToken Club** · Apache 2.0 · Local-first

</div>

---

## What this is

Automation tools make you draw the flowchart. Assistants make you trust a black box.
app8n is the argument that you should not have to choose.

You describe what you want in plain language. An agent with real Google Workspace
tools works out the steps, executes them on your own machine, and stops at a
confirmation card before anything irreversible — sending an email, deleting an event,
overwriting a document. Nothing leaves your machine except the model call, and the
model never sees a raw credential.

**Pronounced "app-eight-n."**

### The three things that make it different

**Mobile is the primary interface, not a companion app.** The backend is fully
headless; the phone is a first-class client that points at it over a configurable URL.
Approvals are swipe-to-confirm cards, because the point of a human gate is defeated if
it can be dismissed by the thumb that was already scrolling.

**Credentials are isolated from the model.** OAuth tokens and API keys live in an
AES-256-GCM vault on disk, keyed by a master key you generate and hold. The agent names
a tool and passes arguments; a local runtime proxy is what actually holds the token and
places the call. There is no path by which a prompt injection reads a refresh token,
because the model is never given one.

**Approval is a hard gate, not a notification.** Tools are marked `requiresApproval` at
the registry level. When one is called the run *halts* — the pending action is written
to the database, the loop parks, and the conversation resumes only when a human
approves, edits or rejects it. A scheduled job can sit blocked overnight and pick up
exactly where it stopped.

---

## Quick start

**Requirements:** Node 20+, npm. An Anthropic API key. A Google Cloud project if you
want real Workspace access — you can skip it, see mock mode below.

```bash
git clone https://github.com/notokenclub/app8n.git
cd app8n
npm install

cp .env.example .env.local
npm run vault:keygen          # prints APP8N_ENCRYPTION_KEY — paste it into .env.local
npm run db:migrate            # creates data/app8n.db
npm run seed:blueprints       # installs the three starter automations

npm run dev
```

Open <http://localhost:3000>. Add your Anthropic key under **Settings** (it goes into
the vault, not a file) and connect a Google account.

### Try it without any credentials

```bash
APP8N_MOCK_GOOGLE=1 npm run dev
```

Every connector is swapped for an in-memory fixture. The agent, the tool loop, the
approval gate and all three blueprints run end to end against fake mail and a fake
calendar, with no Google project and no network. This is also how the test suites run.

### The background worker

The web app serves the UI and the chat endpoint. Scheduled and polling workflows need a
second process:

```bash
npm run worker
```

It is a plain Node process on a 30-second tick, deliberately not a Next.js primitive —
your automations should keep firing whether or not a browser is open.

---

## Native mobile builds

The native shell does not bundle a backend. The engine needs SQLite, cron scheduling
and long-lived OAuth tokens, none of which survive inside a static mobile bundle, so
Capacitor loads your running instance and adds the native pieces around it: system
browser OAuth, deep links, push notifications.

```bash
# 1. Point the shell at a backend the phone can actually reach.
#    localhost on a device means the device itself — use your LAN IP.
export APP8N_SERVER_URL="http://192.168.1.20:3000"

# 2. Generate the native projects (once).
npm run cap:add:ios       # requires Xcode + CocoaPods
npm run cap:add:android   # requires Android Studio + SDK

# 3. Push config and web assets into them (after every config change).
npm run cap:sync

# 4. Open in the native IDE, then run on a simulator or device.
npm run cap:open:ios
npm run cap:open:android
```

### Register the deep link

Mobile OAuth opens Google in the system browser (`ASWebAuthenticationSession` on iOS,
Custom Tabs on Android) rather than an embedded webview — Google blocks embedded
webviews for sign-in, and an in-app view could read the password anyway. The backend
redirects back to `app8n://auth/callback`, which each platform must be told to claim.

**iOS** — `ios/App/App/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>app8n</string></array>
  </dict>
</array>
```

**Android** — inside `<activity>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="app8n" android:host="auth" />
</intent-filter>
```

Then set `APP8N_MOBILE_REDIRECT_URI` in `.env.local` to the same value, and add your
backend's `/api/auth/google/callback` URL to the authorised redirect URIs on the Google
OAuth client.

> `cap add ios` needs CocoaPods and `cap add android` needs the Android SDK. Neither is
> vendored here, so the `ios/` and `android/` directories are generated on your machine
> rather than committed.

---

## Environment variables

Copy `.env.example` to `.env.local`. Nothing in `.env.local` is ever committed.

### Required

| Variable | What it does |
| --- | --- |
| `APP8N_ENCRYPTION_KEY` | Master key for the AES-256-GCM vault. Generate with `npm run vault:keygen`. **Losing this makes every stored credential unrecoverable** — there is no backdoor, by design. |
| `DATABASE_URL` | Defaults to `file:./data/app8n.db`. Point at Postgres to run against a server. |

### Model provider

| Variable | What it does |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional. A key saved through **Settings** lives in the vault and takes precedence; the environment variable is the fallback. Prefer the vault — every run resolves through it, so a key entered on a phone also governs the background worker. |
| `OPENAI_API_KEY`, `OLLAMA_BASE_URL` | Reserved for alternative providers. |

### Google Workspace OAuth

Create an **OAuth 2.0 Web Application** client at
[console.cloud.google.com](https://console.cloud.google.com), enable the Gmail,
Calendar, Drive, Sheets, Docs and Tasks APIs, and add your redirect URI to the client's
authorised list.

| Variable | What it does |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Must match Google exactly. `http://localhost:3000/api/auth/google/callback` for local dev. |
| `APP8N_MOCK_GOOGLE` | Set to `1` to replace every connector with an in-memory fixture. No credentials, no network. |

### App and mobile

| Variable | What it does |
| --- | --- |
| `APP_URL` | Public URL of this backend. Used to build OAuth redirects. |
| `APP8N_LOCAL_USER_EMAIL` | The single implicit owner of the local-first backend. |
| `APP8N_SERVER_URL` | Backend the **native shell** loads. Read at `cap sync` time — use your LAN IP for device testing. |
| `NEXT_PUBLIC_APP8N_API_URL` | Backend the **client** calls. Leave blank for same-origin web; set it when the client is served from somewhere else. |
| `APP8N_MOBILE_REDIRECT_URI` | Deep link the backend redirects to after mobile OAuth. Must match the scheme registered natively. |

---

## Starter blueprints

`npm run seed:blueprints` installs three automations that exercise the whole system.
They are seeded rows, not hard-coded behaviour — edit or delete any of them. Re-running
refreshes the definitions but leaves a blueprint you paused paused; pass `--reset` to
restore the shipped statuses too.

| Blueprint | Trigger | What it demonstrates |
| --- | --- | --- |
| **College Debar & Schedule Assistant** | Weekdays 18:00 | Attendance measured against real calendar sessions, courses ranked against the 75% threshold, and an appeal drafted with the actual counts — then held at the approval gate before it reaches a dean. |
| **Gmail Lead to Google Sheets Pipeline** | On new mail | Poll-driven extraction with a deduplication step, because polling *will* show you the same thread twice. |
| **Daily Calendar & Drive Briefing** | Weekdays 07:00 | Multi-service composition: calendar, conflict detection, Drive and Gmail folded into one Google Doc. |

All three are marked **agentic** — the steps are a plan the agent adapts, not a script
it replays. Each contains at least one judgement that cannot be expressed as a fixed
call ("is this course actually at risk", "is this really a lead"), and a blueprint that
runs reliably while answering the wrong question is not worth shipping. A blueprint with
`is_agentic` false gets the same steps as a strict ordered sequence instead.

For a pending approval card to play with:

```bash
npm run seed:demo
```

---

## Project layout

```
src/
  app/                     Next.js App Router
    page.tsx               Chat — the home screen
    approvals/             HITL queue
    workflows/             Blueprint canvas + mobile list
    settings/              Google accounts and vault-backed API key
    api/                   chat, approvals, workflows, oauth, settings
  lib/
    agent/                 Orchestrator, tool registry, approval middleware, prompt
    google/                OAuth, credential storage, per-service connectors, mocks
    crypto/vault.ts        AES-256-GCM encrypt/decrypt with per-record AAD
    scheduler/             Cron + Gmail-poll worker, due-job selection
    db/                    Drizzle schema and client
    blueprints.ts          The three starter automations
  components/              Chat, approvals, workflows, settings, shell
scripts/                   Self-tests, key generation, seeders, worker entrypoint
drizzle/                   Generated SQL migrations
mobile/shell/              Offline fallback page for the native shell
```

---

## Contributing

Contributions are genuinely welcome — this is a young project and the surface area is
large. Please open an issue before starting anything substantial so we can agree on the
shape of it first.

### Getting set up

```bash
npm install
cp .env.example .env.local && npm run vault:keygen
npm run db:migrate
APP8N_MOCK_GOOGLE=1 npm run dev
```

### Before you open a pull request

```bash
npm run typecheck
npm run lint
npm run vault:selftest      # crypto: round-trips, tampering, AAD binding
npm run google:selftest     # connectors and tool schemas
npm run agent:selftest      # orchestrator, approval gate, scheduler, blueprints
npm run build
```

All five must pass. The self-tests run entirely against mocks and a scratch database —
no credentials, no network, no reason to skip them.

### House rules

**The approval gate is not optional.** Any tool that sends, deletes or overwrites
something outside this machine must be registered with `requiresApproval: true`. If you
are adding a connector, decide this deliberately and say why in the PR.

**The model never touches a secret.** Tools receive arguments and return data; tokens
are resolved inside the runtime proxy. If a change would put a credential into a model
prompt or a tool result, it needs a different design.

**Every tool needs a display label.** Add an entry to `src/lib/tool-display.ts` when you
register a tool. `agent:selftest` fails if you forget, because the alternative is a tool
that shows up in chat as a meaningless "Working…" pill.

**Migrations are generated, not hand-written.** Change `src/lib/db/schema.ts`, then run
`npm run db:generate` and commit the SQL.

**Read the Next.js docs in `node_modules/next/dist/docs/` before writing App Router
code.** This tracks a version with breaking changes against most published examples and
most model training data.

**Comments should explain why, not what.** The codebase leans on this heavily — if a
piece of code looks odd, the reason it is that way belongs next to it.

### Good first issues

- Additional Workspace connectors (Contacts, Chat, Keep)
- Non-Google providers behind the same tool interface (Slack, Notion, Linear)
- Push notification delivery for approvals parked by the background worker
- A blueprint gallery with one-tap install
- Accessibility passes on the swipe-to-approve control

---

## Security

The vault is only as strong as `APP8N_ENCRYPTION_KEY`. Keep it out of version control,
back it up somewhere you trust, and rotate it by re-authorising accounts rather than
attempting to re-encrypt in place.

Found a vulnerability? Please report it privately rather than opening a public issue.

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright © NoToken Club and app8n contributors.
