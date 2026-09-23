# App8n ⚡

<p align="center">
  <strong>Open-source agentic automation, built for everyone.</strong><br/>
  Describe what you want in plain language. Approve anything that matters. Automate the rest.
</p>

<p align="center">
  <a href="#getting-started">Get Started</a> ·
  <a href="#contributing">Contribute</a> ·
  <a href="#what-were-building">Roadmap</a> ·
  <a href="#community">Community</a>
</p>

---

<div align="right">

**A project by NoTokenClub**
*For the curious, by the curious.*

</div>

## What is App8n?

**App8n is an open-source automation platform where you talk to your tools instead of wiring them together.**

You say what you want. An agent with real access to your apps works out the steps, runs them on your own machine, and stops to ask before it does anything you can't undo.

It reads your mail, watches your calendar, files your leads, and holds up a confirmation card before it sends, deletes, or overwrites anything.

We are building a platform where you can:

* 💬 Automate by describing the outcome, not by drawing the flowchart
* 🔗 Connect your favorite apps and services
* 🛡️ Approve or reject every high-impact action before it happens
* 🔐 Keep your credentials encrypted on your own machine
* 📱 Run it from your phone, not just a browser tab
* 🧩 Build using reusable tools and integrations
* 🔌 Extend the platform with custom integrations
* 🌍 Contribute to an open-source ecosystem

**App8n isn't just another app. It's a project we want the community to build with us.**

---

## Why are we building this?

Automation tools are powerful.

But they ask a lot of you before they give anything back. Learn the node graph. Map the fields. Debug the flow.

And AI assistants ask the opposite: trust us, we'll handle it.

We think that's a false choice.

We also believe building and experimenting with automation should be more **open, accessible, and community-driven**.

So instead of simply creating a project behind closed doors, we're building App8n in public.

We want developers, designers, AI enthusiasts, students, builders, and curious people to be able to:

* Explore how agentic automation platforms are built
* Contribute real features
* Build integrations
* Improve the product
* Learn from the codebase
* Collaborate with other builders

The goal isn't just to create software.

**The goal is to create something people can learn from, contribute to, and be proud to build together.**

---

# Open Source, From Day One

App8n is an open-source project.

That means the community isn't just using the product.

**The community helps shape it.**

Whether you're interested in:

* 🖥️ Frontend development
* ⚙️ Backend development
* 🤖 AI and automation
* 🔌 Integrations
* 🎨 UI/UX design
* 📚 Documentation
* 🧪 Testing
* 🐛 Finding bugs

There's a place for you here.

You don't need to be an expert.

If you're curious enough to learn and willing to contribute, you're welcome.

---

## Our Vision

We want App8n to become a powerful, extensible automation platform built by a global community of contributors.

A platform where someone can:

> **Say what you want → watch it work → approve what matters → get on with your day.**

No unnecessary complexity.

No gatekeeping.

No handing your passwords to a language model and hoping.

Just powerful automation and a community of people building together.

---

## What We're Building

### 💬 Conversational Automation

Chat is the home screen. You describe the outcome and the agent works out the steps, showing you each tool call as it happens.

### 🛡️ Human-in-the-Loop Safety

Tools that send, delete, or overwrite are gated. When one is called the run **halts**, writes the pending action to the database, and waits. You approve, edit the parameters, or reject.

A scheduled job can sit blocked overnight and resume exactly where it stopped.

### 🔐 Credential Isolation

OAuth tokens and API keys live in an AES-256-GCM vault on your disk, under a master key you generate and hold.

The agent names a tool and passes arguments. A local runtime proxy is what actually holds the token and makes the call. **The model is never given a credential**, so there is no path by which a prompt injection can leak one.

### 📱 Mobile as a First-Class Client

The backend is fully headless. The phone isn't a companion app, it's the primary interface — with swipe-to-confirm approval cards, native OAuth, and a configurable backend URL.

### 🔗 Integrations

Google Workspace ships today: Gmail, Calendar, Drive, Sheets, Docs and Tasks.

Connecting more applications, APIs, databases and services is where the project goes next.

### 🧩 Tools

Every automation is made up of reusable building blocks.

Triggers.
Actions.
Logic.
Data transformations.
AI.
And more.

### ⚡ Blueprints

Automations you can install, inspect on a visual canvas, pause and resume. Three ship with the project.

### 🏃 Workflow Execution

A background worker runs schedules and polls for new mail, independently of whether a browser is open.

### 🔌 Extensibility

Developers should be able to build custom tools, integrations, and functionality.

---

# Tech Stack

| Layer | What we use |
| --- | --- |
| **App** | Next.js (App Router) · React · TypeScript |
| **UI** | Tailwind CSS · shadcn/ui · Lucide · React Flow |
| **Agent** | Vercel AI SDK · Anthropic Claude |
| **Data** | SQLite via Drizzle ORM (Postgres-ready) |
| **Crypto** | Node `crypto` — AES-256-GCM with per-record AAD |
| **Scheduling** | Croner, in a standalone worker process |
| **Mobile** | Capacitor (iOS + Android) |

Our focus is to keep the project:

* ⚡ Fast
* 🧩 Modular
* 🔌 Extensible
* 🛠️ Developer-friendly
* 🌍 Community-driven

### How it fits together

```
src/
  app/                     Next.js App Router
    page.tsx               Chat — the home screen
    approvals/             Human-in-the-loop queue
    workflows/             Blueprint canvas + mobile list
    settings/              Connected accounts and vault-backed API key
    api/                   chat · approvals · workflows · oauth · settings
  lib/
    agent/                 Orchestrator, tool registry, approval middleware
    google/                OAuth, credential storage, connectors, mocks
    crypto/vault.ts        AES-256-GCM encrypt/decrypt
    scheduler/             Cron + mail-poll worker
    db/                    Drizzle schema and client
    blueprints.ts          The starter automations
  components/              Chat, approvals, workflows, settings, shell
scripts/                   Self-tests, key generation, seeders, worker
drizzle/                   Generated SQL migrations
mobile/shell/              Offline fallback page for the native shell
```

---

# Getting Started

**Requirements:** Node 20+ and npm. An Anthropic API key. A Google Cloud project if you want real Workspace access — you can skip that, see mock mode below.

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

Open <http://localhost:3000>. Add your Anthropic key under **Settings** (it goes into the vault, not a file) and connect a Google account.

### Try it without any credentials

```bash
APP8N_MOCK_GOOGLE=1 npm run dev
```

Every connector is swapped for an in-memory fixture. The agent, the tool loop, the approval gate and all the blueprints run end to end against fake mail and a fake calendar — no Google project, no network. This is also how the test suites run, so it's the fastest way to start contributing.

### Running the background worker

The web app serves the UI and the chat endpoint. Scheduled and polling automations need a second process:

```bash
npm run worker
```

It's a plain Node process on a 30-second tick, deliberately not a Next.js primitive — your automations should keep firing whether or not a browser is open. It also expires approval gates nobody answered and closes runs whose process went away.

### Deploying it

```bash
cp .env.example .env          # fill in APP_URL, APP8N_ACCESS_TOKEN, the vault key
docker compose up -d --build  # the backend and the scheduler
curl -s localhost:3000/api/health
```

The server validates its environment at boot and refuses to start a production
deployment that is unprotected or misconfigured, rather than failing later on a
real request. Access control, notifications, webhook triggers, backups and the
known scaling limits are all in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Environment Variables

Copy `.env.example` to `.env.local`. Nothing in `.env.local` is ever committed.

### Required

| Variable | What it does |
| --- | --- |
| `APP8N_ENCRYPTION_KEY` | Master key for the AES-256-GCM vault. Generate with `npm run vault:keygen`. **Losing this makes every stored credential unrecoverable** — there is no backdoor, by design. |
| `DATABASE_URL` | Defaults to `file:./data/app8n.db`. Point at Postgres to run against a server. |

### Model provider

| Variable | What it does |
| --- | --- |
| `ANTHROPIC_API_KEY` | Optional. A key saved through **Settings** lives in the vault and takes precedence; the environment variable is the fallback. Prefer the vault — every run resolves through it, so a key entered on your phone also governs the background worker. |
| `OPENAI_API_KEY`, `OLLAMA_BASE_URL` | Reserved for alternative providers. |

### Google Workspace OAuth

Create an **OAuth 2.0 Web Application** client at [console.cloud.google.com](https://console.cloud.google.com), enable the Gmail, Calendar, Drive, Sheets, Docs and Tasks APIs, and add your redirect URI to the client's authorised list.

| Variable | What it does |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Must match Google exactly. `http://localhost:3000/api/auth/google/callback` for local dev. |
| `APP8N_MOCK_GOOGLE` | Set to `1` to replace every connector with an in-memory fixture. |

### Deployment

| Variable | What it does |
| --- | --- |
| `APP8N_ACCESS_TOKEN` | Required once the backend is reachable by anything but your own machine: every request must present it, as `Authorization: Bearer …` or by opening `/?access_token=…` once. Generate with `openssl rand -base64 32`. |
| `APP8N_ALLOW_UNAUTHENTICATED` | Skips that requirement for genuinely private networks. Logged loudly at boot. |
| `APP8N_NOTIFY_WEBHOOK_URL` | Where approval gates go when nobody has the app open — any endpoint that accepts a JSON POST (ntfy, Slack, Discord, Home Assistant). |
| `APP8N_AUTO_MIGRATE` | `0` to stop the server and worker migrating at boot, when a release step does it instead. |

### App and mobile

| Variable | What it does |
| --- | --- |
| `APP_URL` | Public URL of this backend. Used to build OAuth redirects. |
| `APP8N_LOCAL_USER_EMAIL` | The single implicit owner of the local-first backend. |
| `APP8N_SERVER_URL` | Backend the **native shell** loads. Read at `cap sync` time — use your LAN IP for device testing. |
| `NEXT_PUBLIC_APP8N_API_URL` | Backend the **client** calls. Leave blank for same-origin web. |
| `APP8N_MOBILE_REDIRECT_URI` | Deep link the backend redirects to after mobile OAuth. Must match the scheme registered natively. |

---

## Native Mobile Builds

The native shell doesn't bundle a backend. The engine needs SQLite, cron scheduling and long-lived OAuth tokens, none of which survive inside a static mobile bundle — so Capacitor loads your running instance and adds the native pieces around it: system browser OAuth, deep links, push notifications.

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

### Registering the deep link

Mobile OAuth opens Google in the system browser (`ASWebAuthenticationSession` on iOS, Custom Tabs on Android) rather than an embedded webview — Google blocks embedded webviews for sign-in, and an in-app view could read the password anyway. The backend redirects back to `app8n://auth/callback`, which each platform must be told to claim.

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

Then set `APP8N_MOBILE_REDIRECT_URI` to the same value, and add your backend's `/api/auth/google/callback` URL to the authorised redirect URIs on the Google OAuth client.

> `cap add ios` needs CocoaPods and `cap add android` needs the Android SDK. Neither is vendored here, so `ios/` and `android/` are generated on your machine rather than committed.

---

## Starter Blueprints

`npm run seed:blueprints` installs three automations that exercise the whole system. They're seeded rows, not hard-coded behaviour — edit or delete any of them.

| Blueprint | Trigger | What it demonstrates |
| --- | --- | --- |
| **College Debar & Schedule Assistant** | Weekdays 18:00 | Attendance measured against real calendar sessions, courses ranked against the 75% threshold, and an appeal drafted with the actual counts — then held at the approval gate before it reaches a dean. |
| **Gmail Lead to Google Sheets Pipeline** | On new mail | Poll-driven extraction with a deduplication step, because polling *will* show you the same thread twice. |
| **Daily Calendar & Drive Briefing** | Weekdays 07:00 | Multi-service composition: calendar, conflict detection, Drive and Gmail folded into one Google Doc. |

Re-running refreshes the definitions but leaves a blueprint you paused paused. Pass `--reset` to restore the shipped statuses too.

For a pending approval card to play with: `npm run seed:demo`

---

# Contributing

We'd love to have you.

The easiest way to start:

1. ⭐ Star the repository
2. 🍴 Fork the project
3. 🔍 Check the open issues
4. 🏷️ Look for `good first issue`
5. 💻 Pick something and start building
6. 🚀 Open a pull request

Even small contributions matter.

A bug fix.

A documentation improvement.

A UI tweak.

A new integration.

A typo.

Everything helps.

## Before You Start

Please check:

* [`CONTRIBUTING.md`](./CONTRIBUTING.md)
* [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
* Open issues and discussions
* The project roadmap

We'd recommend commenting on an issue before starting major work so contributors don't accidentally build the same thing.

## Local Development

```bash
npm install
cp .env.example .env.local && npm run vault:keygen
npm run db:migrate
APP8N_MOCK_GOOGLE=1 npm run dev
```

## Before You Open a Pull Request

```bash
npm run typecheck
npm run lint
npm run vault:selftest      # crypto: round-trips, tampering, AAD binding
npm run google:selftest     # connectors and tool schemas
npm run agent:selftest      # orchestrator, approval gate, scheduler, blueprints
npm run build
```

All of these must pass. The self-tests run entirely against mocks and a scratch database — no credentials, no network, no reason to skip them.

## House Rules

**The approval gate is not optional.** Any tool that sends, deletes or overwrites something outside the machine must be registered with `requiresApproval: true`. If you're adding a connector, decide this deliberately and say why in the PR.

**The model never touches a secret.** Tools receive arguments and return data; tokens are resolved inside the runtime proxy. If a change would put a credential into a model prompt or a tool result, it needs a different design.

**Every tool needs a display label.** Add an entry to `src/lib/tool-display.ts` when you register a tool. `agent:selftest` fails if you forget, because the alternative is a tool that shows up in chat as a meaningless "Working…" pill.

**Migrations are generated, not hand-written.** Change `src/lib/db/schema.ts`, then run `npm run db:generate` and commit the SQL.

**Comments should explain why, not what.** The codebase leans on this heavily — if a piece of code looks odd, the reason it's that way belongs next to it.

## Good First Issues

* Additional Workspace connectors (Contacts, Chat, Keep)
* Non-Google providers behind the same tool interface (Slack, Notion, Linear)
* Push notification delivery for approvals parked by the background worker
* A blueprint gallery with one-tap install
* Accessibility passes on the swipe-to-approve control

---

# Built by NoTokenClub

## Who are we?

**NoTokenClub is a community of builders, researchers, tinkerers, and curious people exploring technology.**

We're interested in building things.

Not just talking about them.

NoTokenClub started with a simple idea:

> **Bring curious people together and give them something interesting to build.**

We explore AI, software, research, technology, and ideas that are worth experimenting with.

No unnecessary hype.

No gatekeeping.

NoTokenClub is built around curiosity.

### For the curious, by the curious.

App8n is one of our attempts to turn that curiosity into something real.

---

# Built Together

We're intentionally building App8n as a community project.

We want contributors to have real ownership over the things they build.

Have an idea?

Open an issue.

Want to build a feature?

Pick it up.

Want to design something better?

Show us.

Want to create an integration?

Let's build it.

This isn't:

> "Here's the code. Good luck."

We want to build an environment where contributors can learn, collaborate, experiment, and ship things together.

---

# Security

The vault is only as strong as `APP8N_ENCRYPTION_KEY`. Keep it out of version control, back it up somewhere you trust, and rotate it by re-authorising accounts rather than trying to re-encrypt in place.

Found a vulnerability? Please report it privately — see [`SECURITY.md`](./SECURITY.md) — rather than opening a public issue.

---

# Community

Building software is better with other people.

Whether you're a contributor, a developer, designer, student, researcher, or someone who just wants to learn — you're welcome here.

### 🌐 Website

[NoTokenClub](https://notokenclub.netlify.app)

### 💬 Join the Conversation

* GitHub Discussions
* GitHub Issues
* NoTokenClub Community

---

# Our Philosophy

We believe:

**Curiosity is enough to start.**

You don't need to know everything before contributing.

You don't need to be a senior developer.

You don't need a perfect portfolio.

You just need to be willing to learn, experiment, break things, fix them, and build.

That's what this project is about.

---

# License

Apache License 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright © NoTokenClub and the App8n contributors.

---

<div align="center">

# ⚡ App8n

### Automate. Build. Contribute.

**An open-source project by NoTokenClub**

<br/>

### For the curious, by the curious.

⭐ **If you believe in the project, consider starring the repository.**

</div>
