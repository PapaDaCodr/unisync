import fs from "fs";
import path from "path";
import { PackageManager } from "./detector";

const PSYNC_MARKER_START = "# >>> package-sync hooks >>>";
const PSYNC_MARKER_END = "# <<< package-sync hooks <<<";

const LOCK_FILE_MAP: Record<PackageManager, string> = {
  npm: "package-lock.json",
  yarn: "yarn.lock",
  pnpm: "pnpm-lock.yaml",
  bun: "bun.lock",
};

/**
 * Install git hooks for package-sync.
 * Appends to existing hooks rather than overwriting — plays nice with husky, etc.
 */
export function installHooks(
  projectDir: string,
  canonicalManager: PackageManager,
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

  // Pre-commit: sync lock file before committing
  writeHook(hooksDir, "pre-commit", preCommitScript(canonicalLock));

  // Post-merge: reinstall after pulling changes
  writeHook(hooksDir, "post-merge", postMergeScript(canonicalLock));

  // Post-checkout: reinstall after switching branches
  writeHook(hooksDir, "post-checkout", postCheckoutScript(canonicalLock));
}

/**
 * Remove package-sync hooks from all hook files.
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

function preCommitScript(canonicalLock: string): string {
  return `${PSYNC_MARKER_START}
# package-sync: sync canonical lock file on commit
if git diff --cached --name-only | grep -q "^package.json$"; then
  if command -v npx >/dev/null 2>&1; then
    npx --yes psync sync --stage
    git add package.json ${canonicalLock}
  fi
fi
${PSYNC_MARKER_END}`;
}

function postMergeScript(canonicalLock: string): string {
  return `${PSYNC_MARKER_START}
# package-sync: reinstall after merge if lock file changed
CHANGED_FILES=$(git diff HEAD@{1} --name-only 2>/dev/null || true)
if echo "$CHANGED_FILES" | grep -q "^${canonicalLock}$"; then
  if command -v npx >/dev/null 2>&1; then
    echo "package-sync: ${canonicalLock} changed, running install..."
    npx --yes psync install
  fi
fi
${PSYNC_MARKER_END}`;
}

function postCheckoutScript(canonicalLock: string): string {
  return `${PSYNC_MARKER_START}
# package-sync: reinstall after branch switch if lock file changed
# Only run on branch switches ($3 == 1), not file checkouts
if [ "$3" = "1" ]; then
  CHANGED_FILES=$(git diff "$1" "$2" --name-only 2>/dev/null || true)
  if echo "$CHANGED_FILES" | grep -q "^${canonicalLock}$"; then
    if command -v npx >/dev/null 2>&1; then
      echo "package-sync: ${canonicalLock} changed, running install..."
      npx --yes psync install
    fi
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
