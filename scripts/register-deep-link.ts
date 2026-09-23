/**
 * Registers the OAuth deep-link scheme in the generated native projects.
 *
 * `cap add ios` / `cap add android` scaffold projects that know nothing about
 * `app8n://`. Without the entries written here, mobile OAuth completes at
 * Google, redirects, and strands the user on a page the app never receives —
 * the exact failure the handoff warns about.
 *
 * Runs as part of `npm run cap:sync`, so the scheme is reapplied every time
 * the native projects are regenerated. Idempotent, and a no-op (with a note)
 * when a platform has not been added yet.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const IOS_PLIST = "ios/App/App/Info.plist";
const ANDROID_MANIFEST = "android/app/src/main/AndroidManifest.xml";

/** `app8n://auth/callback` -> `app8n`. The scheme is the half the OS routes on. */
export function schemeFrom(redirectUri: string): string {
  const scheme = redirectUri.split("://")[0]?.trim();
  if (!scheme) {
    throw new Error(
      `APP8N_MOBILE_REDIRECT_URI ("${redirectUri}") has no URL scheme.`,
    );
  }
  return scheme;
}

export interface PatchResult {
  changed: boolean;
  contents: string;
}

/**
 * Adds a CFBundleURLTypes entry for the scheme.
 *
 * Appended to the root `<dict>` rather than parsed into a plist model: the
 * file is Apple-generated and stable, and a full plist round-trip would
 * reorder keys and produce a diff nobody can review.
 */
export function patchInfoPlist(xml: string, scheme: string): PatchResult {
  const existing = xml.indexOf("<key>CFBundleURLTypes</key>");

  // Scoped to the URL-types section on purpose: the app's own name appears as
  // `<string>app8n</string>` under CFBundleName, and matching that anywhere in
  // the file would report the scheme as registered on a project where it is
  // not, leaving mobile OAuth broken in exactly the way this script prevents.
  if (existing !== -1 && xml.slice(existing).includes(`<string>${scheme}</string>`)) {
    return { changed: false, contents: xml };
  }

  const entry = `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>ai.app8n.client.oauth</string>
\t\t\t<key>CFBundleTypeRole</key>
\t\t\t<string>Editor</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>${scheme}</string>
\t\t\t</array>
\t\t</dict>
\t</array>
`;

  // An existing CFBundleURLTypes array is extended rather than duplicated;
  // two arrays with the same key make the plist invalid.
  if (existing !== -1) {
    const arrayStart = xml.indexOf("<array>", existing);
    if (arrayStart === -1) {
      throw new Error("CFBundleURLTypes is present but malformed.");
    }
    const insertAt = arrayStart + "<array>".length;
    const dict = `\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>ai.app8n.client.oauth</string>\n\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t<string>Editor</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${scheme}</string>\n\t\t\t</array>\n\t\t</dict>`;
    return {
      changed: true,
      contents: xml.slice(0, insertAt) + dict + xml.slice(insertAt),
    };
  }

  const close = xml.lastIndexOf("</dict>");
  if (close === -1) throw new Error("Info.plist has no root <dict>.");

  return {
    changed: true,
    contents: xml.slice(0, close) + entry + xml.slice(close),
  };
}

/** Adds the BROWSABLE intent filter Android routes `app8n://` through. */
export function patchAndroidManifest(xml: string, scheme: string): PatchResult {
  if (xml.includes(`android:scheme="${scheme}"`)) {
    return { changed: false, contents: xml };
  }

  const close = xml.indexOf("</activity>");
  if (close === -1) throw new Error("AndroidManifest.xml has no <activity>.");

  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" />
            </intent-filter>

`;

  return {
    changed: true,
    contents: xml.slice(0, close) + filter + xml.slice(close),
  };
}

function apply(
  relativePath: string,
  label: string,
  patch: (xml: string, scheme: string) => PatchResult,
  scheme: string,
): void {
  const path = resolve(process.cwd(), relativePath);
  if (!existsSync(path)) {
    console.log(
      `  skip  ${label} — not generated yet (run \`npm run cap:add:${label.toLowerCase()}\`)`,
    );
    return;
  }

  const result = patch(readFileSync(path, "utf8"), scheme);
  if (!result.changed) {
    console.log(`  ok    ${label} already registers ${scheme}://`);
    return;
  }

  writeFileSync(path, result.contents);
  console.log(`  wrote ${label} now registers ${scheme}://`);
}

function main(): void {
  if (process.loadEnvFile) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // No .env.local — fall back to the ambient environment.
    }
  }

  const redirectUri =
    process.env.APP8N_MOBILE_REDIRECT_URI ?? "app8n://auth/callback";
  const scheme = schemeFrom(redirectUri);

  console.log(`\n  registering deep link ${redirectUri}\n`);
  apply(IOS_PLIST, "iOS", patchInfoPlist, scheme);
  apply(ANDROID_MANIFEST, "Android", patchAndroidManifest, scheme);
  console.log();
}

// Only run when invoked directly, so the self-test can import the patchers.
if (process.argv[1]?.endsWith("register-deep-link.ts")) {
  main();
}
