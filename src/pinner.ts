import fs from "fs";
import path from "path";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

/**
 * Strip range prefixes (^, ~, >=, etc.) from all dependency versions in
 * package.json so every package manager resolves to the exact same version.
 *
 * Returns true if any changes were made.
 */
export function pinVersions(projectDir: string): boolean {
  const pkgPath = path.join(projectDir, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  let changed = false;

  for (const field of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;

    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string") continue;
      const pinned = stripRange(range);
      if (pinned !== range) {
        deps[name] = pinned;
        changed = true;
      }
    }
  }

  if (changed) {
    // Preserve original formatting indent (detect from raw content)
    const indent = detectIndent(raw);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
  }

  return changed;
}

/**
 * Strip version range prefixes: ^, ~, >=, >, <=, <, =
 * Leaves workspace:, file:, link:, npm:, git+, http protocols untouched.
 * Leaves "*" and "latest" untouched.
 */
function stripRange(version: string): string {
  // Don't touch non-registry specifiers
  if (
    version.startsWith("workspace:") ||
    version.startsWith("file:") ||
    version.startsWith("link:") ||
    version.startsWith("npm:") ||
    version.startsWith("git") ||
    version.startsWith("http") ||
    version === "*" ||
    version === "latest"
  ) {
    return version;
  }

  // Strip leading ^, ~, >=, >, <=, <, =
  return version.replace(/^[\^~]|^[><=]+\s*/g, "");
}

function detectIndent(json: string): number {
  const match = json.match(/^(\s+)"/m);
  return match ? match[1].length : 2;
}
