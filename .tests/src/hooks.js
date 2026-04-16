"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uninstallHooks = exports.installHooks = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PSYNC_MARKER_START = "# >>> unisync hooks >>>";
const PSYNC_MARKER_END = "# <<< unisync hooks <<<";
const LOCK_FILE_MAP = {
    npm: "package-lock.json",
    yarn: "yarn.lock",
    pnpm: "pnpm-lock.yaml",
    bun: "bun.lock",
};
/**
 * Install git hooks for unisync.
 * Appends to existing hooks rather than overwriting — plays nice with husky, etc.
 */
function installHooks(projectDir, canonicalManager, preferredManager = canonicalManager) {
    const gitDir = findGitDir(projectDir);
    if (!gitDir) {
        throw new Error("Not a git repository. Run 'git init' first.");
    }
    const hooksDir = path_1.default.join(gitDir, "hooks");
    if (!fs_1.default.existsSync(hooksDir)) {
        fs_1.default.mkdirSync(hooksDir, { recursive: true });
    }
    const canonicalLock = LOCK_FILE_MAP[canonicalManager];
    // Pre-commit: sync lock file before committing (runs on canonical manager standard)
    writeHook(hooksDir, "pre-commit", preCommitScript(canonicalLock, preferredManager));
    // Post-merge: reinstall after pulling changes
    writeHook(hooksDir, "post-merge", postMergeScript(canonicalLock, preferredManager));
    // Post-checkout: reinstall after switching branches
    writeHook(hooksDir, "post-checkout", postCheckoutScript(canonicalLock, preferredManager));
}
exports.installHooks = installHooks;
/**
 * Remove unisync hooks from all hook files.
 */
function uninstallHooks(projectDir) {
    const gitDir = findGitDir(projectDir);
    if (!gitDir)
        return;
    const hooksDir = path_1.default.join(gitDir, "hooks");
    if (!fs_1.default.existsSync(hooksDir))
        return;
    for (const hookName of ["pre-commit", "post-merge", "post-checkout"]) {
        const hookPath = path_1.default.join(hooksDir, hookName);
        if (!fs_1.default.existsSync(hookPath))
            continue;
        const content = fs_1.default.readFileSync(hookPath, "utf-8");
        if (!content.includes(PSYNC_MARKER_START))
            continue;
        // Remove the psync section
        const startIdx = content.indexOf(PSYNC_MARKER_START);
        const endIdx = content.indexOf(PSYNC_MARKER_END);
        if (startIdx === -1 || endIdx === -1)
            continue;
        const before = content.substring(0, startIdx).trimEnd();
        const after = content.substring(endIdx + PSYNC_MARKER_END.length).trimStart();
        const cleaned = (before + "\n" + after).trim();
        if (cleaned === "#!/bin/sh" || cleaned === "") {
            // Hook is now empty — remove it
            fs_1.default.unlinkSync(hookPath);
        }
        else {
            fs_1.default.writeFileSync(hookPath, cleaned + "\n");
        }
    }
}
exports.uninstallHooks = uninstallHooks;
function writeHook(hooksDir, hookName, script) {
    const hookPath = path_1.default.join(hooksDir, hookName);
    let content = "";
    if (fs_1.default.existsSync(hookPath)) {
        content = fs_1.default.readFileSync(hookPath, "utf-8");
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
    }
    else {
        content = "#!/bin/sh";
    }
    content = content.trimEnd() + "\n\n" + script + "\n";
    fs_1.default.writeFileSync(hookPath, content);
    fs_1.default.chmodSync(hookPath, 0o755);
}
function getExecCmd(manager) {
    switch (manager) {
        case "bun": return "bun x";
        case "pnpm": return "pnpm exec";
        case "yarn": return "yarn dlx";
        default: return "npx --yes";
    }
}
function preCommitScript(canonicalLock, preferred) {
    const exec = getExecCmd(preferred);
    return `${PSYNC_MARKER_START}
# unisync: sync canonical lock file on commit
if git diff --cached --name-only | grep -q "^package.json$"; then
  ${exec} psync sync --stage
  git add package.json ${canonicalLock}
fi
${PSYNC_MARKER_END}`;
}
function postMergeScript(canonicalLock, preferred) {
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
function postCheckoutScript(canonicalLock, preferred) {
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
function findGitDir(startDir) {
    let dir = path_1.default.resolve(startDir);
    while (true) {
        const gitDir = path_1.default.join(dir, ".git");
        if (fs_1.default.existsSync(gitDir)) {
            // .git can be a file (worktrees) or a directory
            const stat = fs_1.default.statSync(gitDir);
            if (stat.isDirectory())
                return gitDir;
            // If it's a file, read the gitdir pointer
            const content = fs_1.default.readFileSync(gitDir, "utf-8").trim();
            const match = content.match(/^gitdir:\s*(.+)$/);
            if (match)
                return path_1.default.resolve(dir, match[1]);
        }
        const parent = path_1.default.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
