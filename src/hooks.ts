import fs from "fs";
import path from "path";
import { PackageManager } from "./detector";
import { EnforceMode } from "./config";

const PSYNC_MARKER_START = "# >>> unisync hooks >>>";
const PSYNC_MARKER_END = "# <<< unisync hooks <<<";

const LOCK_FILE_MAP: Record<PackageManager, string> = {
  npm: "package-lock.json",
  yarn: "yarn.lock",
  pnpm: "pnpm-lock.yaml",
  bun: "bun.lock",
};

/**
 * Install git hooks for unisync.
 * Appends to existing hooks rather than overwriting — plays nice with husky, etc.
 */
export function installHooks(
  projectDir: string,
  canonicalManager: PackageManager,
  preferredManager: PackageManager = canonicalManager,
  enforce: EnforceMode = "warn",
): void {
  const gitDir = findGitDir(projectDir);
  if (!gitDir) {
    throw new Error("Not a git repository. Run 'git init' first.");
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const canonicalLock = LOCK_FILE_MAP[canonicalManager];

  // Pre-commit: either enforce sync (block) or just warn on drift (warn)
  writeHook(hooksDir, "pre-commit", preCommitScript(canonicalLock, preferredManager, enforce));

  // Post-merge: reinstall after pulling changes
  writeHook(hooksDir, "post-merge", postMergeScript(canonicalLock, preferredManager));

  // Post-checkout: reinstall after switching branches
  writeHook(hooksDir, "post-checkout", postCheckoutScript(canonicalLock, preferredManager));
}

/**
 * Remove unisync hooks from all hook files.
 */
export function uninstallHooks(projectDir: string): void {
  const gitDir = findGitDir(projectDir);
  if (!gitDir) return;

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) return;

  for (const hookName of ["pre-commit", "post-merge", "post-checkout"]) {
    const hookPath = path.join(hooksDir, hookName);
    if (!fs.existsSync(hookPath)) continue;

    const content = fs.readFileSync(hookPath, "utf-8");
    if (!content.includes(PSYNC_MARKER_START)) continue;

    // Remove the psync section
    const startIdx = content.indexOf(PSYNC_MARKER_START);
    const endIdx = content.indexOf(PSYNC_MARKER_END);
    if (startIdx === -1 || endIdx === -1) continue;

    const before = content.substring(0, startIdx).trimEnd();
    const after = content.substring(endIdx + PSYNC_MARKER_END.length).trimStart();
    const cleaned = (before + "\n" + after).trim();

    if (cleaned === "#!/bin/sh" || cleaned === "") {
      // Hook is now empty — remove it
      fs.unlinkSync(hookPath);
    } else {
      fs.writeFileSync(hookPath, cleaned + "\n");
    }
  }
}

function writeHook(hooksDir: string, hookName: string, script: string): void {
  const hookPath = path.join(hooksDir, hookName);
  let content = "";

  if (fs.existsSync(hookPath)) {
    content = fs.readFileSync(hookPath, "utf-8");
    // Remove old psync section if it exists
    if (content.includes(PSYNC_MARKER_START)) {
      const startIdx = content.indexOf(PSYNC_MARKER_START);
      const endIdx = content.indexOf(PSYNC_MARKER_END);
      if (startIdx !== -1 && endIdx !== -1) {
        const before = content.substring(0, startIdx).trimEnd();
        const after = content.substring(endIdx + PSYNC_MARKER_END.length);
        content = before + after;
      }
    }
  } else {
    content = "#!/bin/sh";
  }

  content = content.trimEnd() + "\n\n" + script + "\n";
  fs.writeFileSync(hookPath, content);
  fs.chmodSync(hookPath, 0o755);
}

function getExecCmd(manager: PackageManager): string {
  switch (manager) {
    case "bun": return "bun x";
    case "pnpm": return "pnpm exec";
    case "yarn": return "yarn dlx";
    default: return "npx --yes";
  }
}

function preCommitScript(
  canonicalLock: string,
  preferred: PackageManager,
  enforce: EnforceMode,
): string {
  const exec = getExecCmd(preferred);
  if (enforce === "block") {
    return `${PSYNC_MARKER_START}
# unisync: enforce=block — sync canonical lock file on commit
if git diff --cached --name-only | grep -q "^package.json$"; then
  ${exec} psync sync --stage
  git add package.json ${canonicalLock}
fi
${PSYNC_MARKER_END}`;
  }
  // enforce=warn: log drift, never mutate. Never exits non-zero.
  return `${PSYNC_MARKER_START}
# unisync: enforce=warn — report drift without mutating
if git diff --cached --name-only | grep -q "^package.json$"; then
  if ! ${exec} psync sync --check >/dev/null 2>&1; then
    echo "unisync: [warn] ${canonicalLock} would drift from package.json"
    echo "unisync:        run your install command to sync, or switch to enforce=block"
  fi
fi
${PSYNC_MARKER_END}`;
}

function postMergeScript(canonicalLock: string, preferred: PackageManager): string {
  const exec = getExecCmd(preferred);
  return `${PSYNC_MARKER_START}
# unisync: reinstall after merge if lock file changed
CHANGED_FILES=$(git diff HEAD@{1} --name-only 2>/dev/null || true)
if echo "$CHANGED_FILES" | grep -q "^${canonicalLock}$"; then
  echo "unisync: ${canonicalLock} changed, running install..."
  ${exec} psync install
fi
${PSYNC_MARKER_END}`;
}

function postCheckoutScript(canonicalLock: string, preferred: PackageManager): string {
  const exec = getExecCmd(preferred);
  return `${PSYNC_MARKER_START}
# unisync: reinstall after branch switch if lock file changed
# Only run on branch switches ($3 == 1), not file checkouts
if [ "$3" = "1" ]; then
  CHANGED_FILES=$(git diff "$1" "$2" --name-only 2>/dev/null || true)
  if echo "$CHANGED_FILES" | grep -q "^${canonicalLock}$"; then
    echo "unisync: ${canonicalLock} changed, running install..."
    ${exec} psync install
  fi
fi
${PSYNC_MARKER_END}`;
}

function findGitDir(startDir: string): string | null {
  let dir = path.resolve(startDir);

  while (true) {
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir)) {
      // .git can be a file (worktrees) or a directory
      const stat = fs.statSync(gitDir);
      if (stat.isDirectory()) return gitDir;
      // If it's a file, read the gitdir pointer
      const content = fs.readFileSync(gitDir, "utf-8").trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) return path.resolve(dir, match[1]);
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
