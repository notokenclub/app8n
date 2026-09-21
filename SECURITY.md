# Security Policy

App8n holds OAuth tokens and API keys for your real accounts, and it takes actions on your behalf. We take reports seriously.

## Supported Versions

App8n is pre-1.0 and under active development. Only the latest `main` receives security fixes.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅ |
| Tagged pre-releases | ❌ |

## Reporting a Vulnerability

**Please do not open a public issue for a security vulnerability.**

Use [GitHub's private vulnerability reporting](https://github.com/notokenclub/app8n/security/advisories/new) on this repository. That opens a private advisory visible only to you and the maintainers.

Please include:

* What the issue is and roughly how severe you think it is
* Steps to reproduce, or a proof of concept
* The commit or version you tested against
* Any suggested fix, if you have one

**What to expect:**

* An acknowledgement within a few days
* An assessment and a plan, or an explanation of why we don't consider it a vulnerability
* Credit in the advisory when it's fixed, unless you'd rather stay anonymous

We're a volunteer community project, not a company with an on-call rotation. We'll be honest with you about timelines rather than promise an SLA we can't keep.

## Scope

Things we especially want to hear about:

* **Credential exposure** — any path by which a stored OAuth token or API key reaches a model prompt, a tool result, a log line, or an API response. The vault is designed so the model never sees a secret; a hole in that is the most serious class of bug in this project.
* **Approval gate bypass** — anything that lets a `requiresApproval` tool execute without a human decision, or lets an approval be replayed, forged, or resolved by someone who shouldn't be able to.
* **Prompt injection with real consequences** — content in an email, document or calendar event that causes the agent to take an unapproved action or exfiltrate data.
* **Cross-user data access** — this is a local-first single-user app by default, but the schema is multi-user and queries are meant to be ownership-scoped.
* **Vault weaknesses** — issues in the AES-256-GCM implementation, AAD binding, key derivation, or anything that makes ciphertext malleable.

Out of scope:

* Anything requiring an attacker who already has your `APP8N_ENCRYPTION_KEY` or filesystem access. That key is the root of trust by design — if it leaks, every stored credential is compromised, and there is no backdoor that would change that.
* Vulnerabilities in Google's or Anthropic's services. Report those to them.
* Missing hardening headers on a local-first dev server.

## Operator Responsibilities

If you deploy App8n somewhere other than your own machine:

* Keep `APP8N_ENCRYPTION_KEY` out of version control and back it up. Losing it makes every stored credential unrecoverable.
* Serve over HTTPS. `cleartext` is enabled for the mobile shell only when you point it at an `http://` URL for local development.
* Rotate the master key by re-authorising accounts rather than attempting to re-encrypt in place.
