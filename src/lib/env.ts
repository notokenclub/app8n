/**
 * Deployment preflight.
 *
 * Local development is deliberately permissive — mock mode exists so the whole
 * product runs with no credentials at all. A deployed backend is a different
 * proposition: it holds other people's Google tokens, it can send mail, and it
 * is reachable from the network. These checks run once at boot (see
 * `src/instrumentation.ts`) and refuse to start a production server that is
 * missing something it cannot safely do without.
 */

export interface EnvIssue {
  variable: string;
  message: string;
}

export interface EnvReport {
  errors: EnvIssue[];
  warnings: EnvIssue[];
}

function has(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function isLoopback(url: string | undefined): boolean {
  if (!url) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

/** Validates the environment for the mode it is actually running in. */
export function checkEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): EnvReport {
  const errors: EnvIssue[] = [];
  const warnings: EnvIssue[] = [];
  const production = env.NODE_ENV === "production";

  // The vault key is the root of trust. Without it every credential write
  // fails at the point of use rather than at boot, which is the worst place
  // to find out.
  if (!has(env, "APP8N_ENCRYPTION_KEY")) {
    (production ? errors : warnings).push({
      variable: "APP8N_ENCRYPTION_KEY",
      message:
        "The credential vault has no master key. Generate one with `npm run vault:keygen`.",
    });
  } else {
    try {
      const raw = Buffer.from(env.APP8N_ENCRYPTION_KEY ?? "", "base64");
      if (raw.length !== 32) {
        errors.push({
          variable: "APP8N_ENCRYPTION_KEY",
          message: `Expected 32 bytes of base64, got ${raw.length}. Re-generate with \`npm run vault:keygen\`.`,
        });
      }
    } catch {
      errors.push({
        variable: "APP8N_ENCRYPTION_KEY",
        message: "Not valid base64. Re-generate with `npm run vault:keygen`.",
      });
    }
  }

  if (production) {
    if (isLoopback(env.APP_URL)) {
      errors.push({
        variable: "APP_URL",
        message:
          "Set this to the public URL of the deployment. OAuth redirects and webhook URLs are built from it.",
      });
    }

    // An exposed deployment with no access token is an unauthenticated agent
    // holding someone's Google tokens. Mock mode is exempt: there is nothing
    // real behind it.
    if (
      !has(env, "APP8N_ACCESS_TOKEN") &&
      env.APP8N_MOCK_GOOGLE !== "1" &&
      env.APP8N_ALLOW_UNAUTHENTICATED !== "1"
    ) {
      errors.push({
        variable: "APP8N_ACCESS_TOKEN",
        message:
          "A deployed backend must be protected. Set a long random token, or set APP8N_ALLOW_UNAUTHENTICATED=1 if this really is a private network.",
      });
    }

    if (!has(env, "ANTHROPIC_API_KEY")) {
      warnings.push({
        variable: "ANTHROPIC_API_KEY",
        message:
          "No model key in the environment. Runs will depend on a key saved in the vault from the settings screen.",
      });
    }

    if (env.APP8N_MOCK_GOOGLE === "1") {
      warnings.push({
        variable: "APP8N_MOCK_GOOGLE",
        message:
          "Mock mode is on: Google connectors return fixtures, not real data.",
      });
    } else if (!has(env, "GOOGLE_CLIENT_ID") || !has(env, "GOOGLE_CLIENT_SECRET")) {
      warnings.push({
        variable: "GOOGLE_CLIENT_ID",
        message:
          "Google OAuth is not configured, so no account can be connected.",
      });
    }
  }

  // The access token exists but is trivially guessable.
  const token = env.APP8N_ACCESS_TOKEN?.trim();
  if (token && token.length < 24) {
    (production ? errors : warnings).push({
      variable: "APP8N_ACCESS_TOKEN",
      message: "Too short to be a credential. Use at least 24 random characters.",
    });
  }

  if (has(env, "APP8N_ALLOW_UNAUTHENTICATED")) {
    warnings.push({
      variable: "APP8N_ALLOW_UNAUTHENTICATED",
      message:
        "Access checks are disabled. Anyone who can reach this server can act as its owner.",
    });
  }

  return { errors, warnings };
}

export function formatEnvReport(report: EnvReport): string {
  return [
    ...report.errors.map((issue) => `  ✗ ${issue.variable}: ${issue.message}`),
    ...report.warnings.map((issue) => `  ! ${issue.variable}: ${issue.message}`),
  ].join("\n");
}

/**
 * Called at server boot. Throws in production when something is wrong, and
 * only warns in development, where half-configured is the normal state.
 */
export function assertEnvironment(): EnvReport {
  const report = checkEnvironment();

  if (report.warnings.length > 0) {
    console.warn(
      `app8n environment warnings:\n${formatEnvReport({ errors: [], warnings: report.warnings })}`,
    );
  }

  if (report.errors.length > 0) {
    const detail = formatEnvReport({ errors: report.errors, warnings: [] });
    if (process.env.NODE_ENV === "production") {
      throw new Error(`app8n cannot start:\n${detail}`);
    }
    console.warn(`app8n environment problems:\n${detail}`);
  }

  return report;
}
