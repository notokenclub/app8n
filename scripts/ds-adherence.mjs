#!/usr/bin/env node
// Design-system adherence check.
//
// `_adherence.oxlintrc.json` codifies the Zelleo rules as oxlint
// `no-restricted-syntax` selectors, but oxlint does not implement that rule,
// so this script reads the same config and enforces the parts of it that
// apply to application code:
//
//   * no raw hex colours, no raw px values, no non-system font families
//   * no imports from design-system component internals
//   * per-component prop contracts and enum values (from the same selectors)
//
// It is deliberately literal about the config: every message printed here is
// the message the config itself carries.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CONFIG = JSON.parse(
  readFileSync(join(ROOT, "src/ds/_adherence.oxlintrc.json"), "utf8"),
);
const SCAN_DIR = join(ROOT, "src");
// The design system's own sources are the law, not a subject of it.
const SKIP = [join(ROOT, "src/ds")];

const restricted = CONFIG.rules["no-restricted-syntax"].slice(1);
const importGroups =
  CONFIG.rules["no-restricted-imports"][1].patterns[0].group.map((pattern) =>
    pattern.replace(/\/\*\*$/, ""),
  );
const importMessage = CONFIG.rules["no-restricted-imports"][1].patterns[0].message;

/** Literal rules: hex colours, px values, font families. */
const literalRules = restricted
  .filter((rule) => rule.selector.startsWith("Literal[value=/"))
  .map((rule) => ({
    pattern: new RegExp(
      rule.selector.slice("Literal[value=/".length, rule.selector.lastIndexOf("/")),
      rule.selector.endsWith("i]") ? "i" : "",
    ),
    message: rule.message,
  }));

/** Component prop contracts, keyed by component name. */
const propRules = new Map();
for (const rule of restricted) {
  const declared = rule.selector.match(
    /JSXOpeningElement\[name\.name='(\w+)'\] > JSXAttribute > JSXIdentifier\[name!=\/\^\(\?:(.+?)\)\$\/\]/,
  );
  if (declared) {
    const entry = propRules.get(declared[1]) ?? { props: null, enums: [] };
    entry.props = new Set(declared[2].split("|"));
    entry.message = rule.message;
    propRules.set(declared[1], entry);
    continue;
  }
  const enumRule = rule.selector.match(
    /JSXOpeningElement\[name\.name='(\w+)'\] > JSXAttribute\[name\.name='(\w+)'\] > Literal\[value!=\/\^\(\?:(.+?)\)\$\/\]/,
  );
  if (enumRule) {
    const entry = propRules.get(enumRule[1]) ?? { props: null, enums: [] };
    entry.enums.push({
      prop: enumRule[2],
      values: new Set(enumRule[3].split("|")),
      message: rule.message,
    });
    propRules.set(enumRule[1], entry);
  }
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.some((skip) => path === skip || path.startsWith(`${skip}/`))) continue;
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(tsx|ts|jsx|js|css)$/.test(path)) out.push(path);
  }
  return out;
}

const violations = [];
function report(file, line, message, text) {
  violations.push(`${relative(ROOT, file)}:${line}  ${message}\n    ${text.trim()}`);
}

for (const file of files(SCAN_DIR)) {
  // Block comments are stripped whole-file: they explain the rules and are
  // the one place a px measurement may legitimately be written down.
  const source = readFileSync(file, "utf8");
  const lines = source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n");

  lines.forEach((text, index) => {
    // Comments explain the rules; they are not code and cannot style anything.
    let code = text.replace(/\/\/.*$/, "");
    // `font-family: var(--font-…)` is the approved way to reach a family: the
    // names themselves live in `tokens/fonts.css`. Safe-area insets are read
    // from the viewport, and their fallback can only be written as a length.
    code = code
      .replace(/font-family:\s*var\(--font-[\w-]+\)/g, "")
      .replace(/env\(safe-area-inset-[\w-]+,\s*0px\)/g, "");
    if (code.trim() === "" || code.trim().startsWith("*")) return;

    // A media query's breakpoint is a viewport measurement, not a spacing
    // step, and the system has no token for it.
    code = code.replace(/\(m(?:in|ax)-width:[^)]*\)/g, "");
    for (const rule of literalRules) {
      // A `var(--token)` reference is the approved way to reach a value, and
      // the token sheets themselves are where the raw values legitimately live.
      if (/\/ds\/tokens\//.test(file)) continue;
      // The hex rule is narrowed to colour positions: `#4471` in an invoice
      // subject is not a colour, and the selector cannot tell the difference.
      const colourPosition =
        file.endsWith(".css") ||
        /colou?r|background|fill|stroke|border|shadow|style/i.test(code);
      if (rule.message.startsWith("Raw hex") && !colourPosition) continue;
      if (rule.pattern.test(code)) {
        report(file, index + 1, rule.message, text);
      }
    }

    const importMatch = code.match(/from\s+["']([^"']+)["']/);
    if (importMatch) {
      const specifier = importMatch[1].replace(/^(\.\/|@\/ds\/)/, "");
      if (importGroups.some((group) => specifier.startsWith(group))) {
        report(file, index + 1, importMessage, text);
      }
    }
  });

  // Prop contracts. JSX attributes are matched inside each opening tag, which
  // is enough for the flat, literal-prop usage this codebase writes.
  for (const [name, entry] of propRules) {
    const tag = new RegExp(`<${name}\\b`, "g");
    for (const match of source.matchAll(tag)) {
      const line = source.slice(0, match.index).split("\n").length;
      let depth = 0;
      let end = match.index + match[0].length;
      while (end < source.length) {
        const char = source[end];
        if (char === "{") depth += 1;
        else if (char === "}") depth -= 1;
        else if (char === ">" && depth === 0) break;
        end += 1;
      }
      const attrs = source
        .slice(match.index + match[0].length, end)
        // Props whose value is an expression cannot be checked for an enum
        // value, and nested elements inside them are not this tag's props.
        .replace(/\{[\s\S]*?\}/g, "{…}");
      if (entry.props) {
        for (const attr of attrs.matchAll(/(?:^|\s)([A-Za-z][\w-]*)=/g)) {
          // Two documented carve-outs, both required to keep behaviour that
          // predates the design system:
          //
          //   * ARIA labelling — a control the system renders as an icon has
          //     no other accessible name;
          //   * the native attributes below, which `Button`, `IconButton` and
          //     `Input` forward onto the underlying element through `...rest`
          //     by construction: the button `type` (a bare <button> inside a
          //     form defaults to submit), and the attributes that make a
          //     password field a password field and let Enter submit it.
          const forwarded = {
            Button: ["type"],
            IconButton: ["type"],
            Input: [
              "type",
              "inputMode",
              "autoComplete",
              "spellCheck",
              "onKeyDown",
            ],
          };
          const allowed =
            entry.props.has(attr[1]) ||
            attr[1].startsWith("aria-") ||
            (forwarded[name] ?? []).includes(attr[1]);
          if (!allowed) {
            report(file, line, entry.message, `<${name} ${attr[1]}=…>`);
          }
        }
      }
      for (const enumRule of entry.enums) {
        const used = attrs.match(
          new RegExp(`${enumRule.prop}=["']([^"']+)["']`),
        );
        if (used && !enumRule.values.has(used[1])) {
          report(file, line, enumRule.message, `<${name} ${enumRule.prop}="${used[1]}">`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`Design-system adherence: ${violations.length} violation(s)\n`);
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Design-system adherence: no violations.");
