#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const detector_1 = require("./detector");
const config_1 = require("./config");
const hooks_1 = require("./hooks");
const sync_1 = require("./sync");
const executor_1 = require("./executor");
const readline_1 = __importDefault(require("readline"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const MANAGERS = ["npm", "yarn", "pnpm", "bun"];
async function main() {
    const [command, ...rest] = process.argv.slice(2);
    switch (command) {
        case "init":
            return init();
        case "setup":
            return setup();
        case "detect":
            return detect();
        case "sync":
            return sync(rest);
        case "install":
            return install();
        case "verify":
            return verify();
        case "doctor":
            return doctor();
        case "hooks":
            return hooks(rest);
        case "help":
        case "--help":
        case "-h":
        case undefined:
            return help();
        default:
            console.error(`psync: unknown command "${command}". Run "psync help" for usage.`);
            process.exit(1);
    }
}
// ── psync init ─────────────────────────────────────────────────────
// For the project owner: set canonical manager, install hooks, configure gitignore.
async function init() {
    const cwd = process.cwd();
    console.log("unisync — project setup\n");
    // 1. Detect or ask for canonical manager
    const locks = (0, detector_1.listLockFiles)(cwd);
    let canonical;
    if (locks.length === 1) {
        canonical = locks[0].manager;
        console.log(`Detected ${locks[0].file} — using "${canonical}" as canonical manager.`);
    }
    else if (locks.length > 1) {
        console.log("Multiple lock files detected:");
        locks.forEach((l) => console.log(`  - ${l.file} (${l.manager})`));
        canonical = await prompt("\nWhich should be the canonical (committed) manager? ", MANAGERS);
    }
    else {
        console.log("No lock file detected.");
        canonical = await prompt("Which package manager should be canonical? (" + MANAGERS.join("/") + "): ", MANAGERS);
    }
    // 2. Write project config
    (0, config_1.writeProjectConfig)(cwd, { canonicalManager: canonical });
    console.log(`\nCreated .psyncrc.json (canonical: ${canonical})`);
    // 3. Update .gitignore
    const nonCanonical = (0, sync_1.getNonCanonicalLockFiles)(canonical);
    (0, config_1.ensureGitignore)(cwd, [...nonCanonical, ".psyncrc.local.json"]);
    console.log("Updated .gitignore (non-canonical lock files + local config)");
    // 4. Install git hooks
    try {
        (0, hooks_1.installHooks)(cwd, canonical);
        console.log("Installed git hooks (pre-commit, post-merge, post-checkout)");
    }
    catch (err) {
        console.warn(`Warning: could not install git hooks: ${err.message}`);
    }
    // 5. Instructions
    console.log(`
Setup complete! Here's what happens now:

  1. You work normally with "${canonical}"
  2. Collaborators clone the repo and run: npx unisync setup
  3. They pick their preferred manager and work normally
  4. Git hooks keep ${(0, sync_1.getLockFileName)(canonical)} in sync automatically

Share this with your team:
  npx unisync setup
`);
}
// ── psync setup ────────────────────────────────────────────────────
// For collaborators: pick preferred manager, install hooks, run install.
async function setup() {
    const cwd = process.cwd();
    const projectConfig = (0, config_1.readProjectConfig)(cwd);
    if (!projectConfig) {
        console.error('psync: no .psyncrc.json found.  Run "psync init" first.');
        process.exit(1);
    }
    console.log(`unisync — developer setup`);
    console.log(`Canonical manager: ${projectConfig.canonicalManager}\n`);
    // 1. Ask preferred manager
    const preferred = await prompt("Which package manager do you use? (" + MANAGERS.join("/") + "): ", MANAGERS);
    // 2. Write local config
    (0, config_1.writeLocalConfig)(cwd, { preferredManager: preferred });
    console.log(`\nSaved preference: ${preferred} (in .psyncrc.local.json, gitignored)`);
    // 3. Install git hooks
    try {
        (0, hooks_1.installHooks)(cwd, projectConfig.canonicalManager, preferred);
        console.log("Installed git hooks");
    }
    catch (err) {
        console.warn(`Warning: could not install git hooks: ${err.message}`);
    }
    // 4. Run install with preferred manager
    console.log(`\nRunning ${preferred} install...\n`);
    const code = await (0, executor_1.execute)(preferred, ["install"]);
    if (code !== 0) {
        console.error(`\npsync: "${preferred} install" exited with code ${code}`);
        process.exit(code);
    }
    console.log(`\nDone! Just use "${preferred}" normally — psync handles the rest.`);
}
// ── psync detect ───────────────────────────────────────────────────
function detect() {
    const cwd = process.cwd();
    const projectConfig = (0, config_1.readProjectConfig)(cwd);
    const localConfig = (0, config_1.readLocalConfig)(cwd);
    const detectedManager = (0, detector_1.detectManager)(cwd);
    const locks = (0, detector_1.listLockFiles)(cwd);
    console.log("unisync status\n");
    if (projectConfig) {
        console.log(`  Canonical manager : ${projectConfig.canonicalManager}`);
    }
    else {
        console.log("  Canonical manager : not configured (run 'psync init')");
    }
    if (localConfig) {
        console.log(`  Preferred manager : ${localConfig.preferredManager}`);
    }
    else {
        console.log("  Preferred manager : not configured (run 'psync setup')");
    }
    if (detectedManager) {
        console.log(`  Detected (lock)   : ${detectedManager}`);
    }
    if (locks.length > 0) {
        console.log(`  Lock files found  : ${locks.map((l) => l.file).join(", ")}`);
    }
    else {
        console.log("  Lock files found  : none");
    }
}
// ── psync sync ─────────────────────────────────────────────────────
// Manually sync: pin versions + regenerate canonical lock from node_modules.
function sync(args) {
    const cwd = process.cwd();
    const projectConfig = (0, config_1.readProjectConfig)(cwd);
    if (!projectConfig) {
        // Fall back to detection
        const detected = (0, detector_1.detectManager)(cwd);
        if (!detected) {
            console.error('psync: no canonical manager configured. Run "psync init" first.');
            process.exit(1);
        }
        console.log(`psync: no config found, using detected manager: ${detected}`);
        (0, sync_1.syncLockFile)(cwd, detected);
        return;
    }
    const result = (0, sync_1.syncLockFile)(cwd, projectConfig.canonicalManager);
    console.log(`psync: sync complete — ${result.packagesResolved} packages, ` +
        `versions ${result.versionsPinned ? "pinned" : "unchanged"}`);
}
// ── psync install ──────────────────────────────────────────────────
// Run the developer's preferred manager install (used by post-merge hook).
async function install() {
    const cwd = process.cwd();
    const localConfig = (0, config_1.readLocalConfig)(cwd);
    const preferred = localConfig?.preferredManager ?? (0, detector_1.detectManager)(cwd) ?? "npm";
    console.log(`psync: running ${preferred} install...`);
    const code = await (0, executor_1.execute)(preferred, ["install"]);
    process.exit(code);
}
// ── psync doctor ───────────────────────────────────────────────────
async function doctor() {
    const cwd = process.cwd();
    console.log("unisync doctor — diagnostic report\n");
    let healthy = true;
    // 1. Config Check
    const projectConfig = (0, config_1.readProjectConfig)(cwd);
    if (projectConfig) {
        console.log(`  [OK] Project config found (.psyncrc.json)`);
        console.log(`       Canonical manager: ${projectConfig.canonicalManager}`);
    }
    else {
        console.log(`  [!!] No project config found. Run "psync init".`);
        healthy = false;
    }
    const localConfig = (0, config_1.readLocalConfig)(cwd);
    if (localConfig) {
        console.log(`  [OK] Local preference found (.psyncrc.local.json)`);
        console.log(`       Preferred manager: ${localConfig.preferredManager}`);
    }
    else {
        console.log(`  [--] No local preference set. This is fine, will use detected.`);
    }
    // 2. Manager Check
    console.log("\n  Checking package managers:");
    for (const mgr of MANAGERS) {
        const installed = await (0, detector_1.isManagerInstalled)(mgr);
        console.log(`       ${installed ? "[OK]" : "[  ]"} ${mgr}`);
        if (projectConfig?.canonicalManager === mgr && !installed) {
            console.log(`       [!!] Warning: Canonical manager "${mgr}" is not in your PATH.`);
            healthy = false;
        }
    }
    // 3. Git Check
    const hasGit = await (0, detector_1.isManagerInstalled)("git");
    if (hasGit) {
        const hooksDir = path_1.default.join(cwd, ".git", "hooks");
        if (fs_1.default.existsSync(hooksDir)) {
            console.log(`\n  [OK] Git hooks directory found`);
        }
        else {
            console.log(`\n  [!!] Git directory found but no hooks. Run "psync hooks install".`);
            healthy = false;
        }
    }
    else {
        console.log(`\n  [!!] Git is not installed.`);
        healthy = false;
    }
    if (healthy) {
        console.log("\n  Result: Environment looks healthy! ✨");
    }
    else {
        console.log("\n  Result: Some issues found. Resolve them for best results.");
        process.exit(1);
    }
}
// ── psync verify ───────────────────────────────────────────────────
function verify() {
    const cwd = process.cwd();
    const projectConfig = (0, config_1.readProjectConfig)(cwd);
    if (!projectConfig) {
        console.error('psync: no canonical manager configured. Run "psync init" first.');
        process.exit(1);
    }
    const canonical = projectConfig.canonicalManager;
    const lockFileName = (0, sync_1.getLockFileName)(canonical);
    const lockFilePath = path_1.default.join(cwd, lockFileName);
    if (!fs_1.default.existsSync(lockFilePath)) {
        console.error(`psync: canonical lock file "${lockFileName}" missing.`);
        process.exit(1);
    }
    const existingContent = fs_1.default.readFileSync(lockFilePath, "utf-8");
    // Perform a sync
    (0, sync_1.syncLockFile)(cwd, canonical);
    const newContent = fs_1.default.readFileSync(lockFilePath, "utf-8");
    // If we changed it, it wasn't verified
    if (existingContent !== newContent) {
        console.error(`\npsync: [FAIL] Canonical lock file "${lockFileName}" was out of sync!`);
        console.error(`             It has been updated. Please commit the changes.`);
        process.exit(1);
    }
    console.log(`\npsync: [PASS] Canonical lock file "${lockFileName}" is in sync.`);
}
// ── psync hooks ────────────────────────────────────────────────────
function hooks(args) {
    const cwd = process.cwd();
    const sub = args[0];
    if (sub === "install") {
        const config = (0, config_1.readProjectConfig)(cwd);
        if (!config) {
            console.error('psync: no .psyncrc.json found. Run "psync init" first.');
            process.exit(1);
        }
        const localConfig = (0, config_1.readLocalConfig)(cwd);
        (0, hooks_1.installHooks)(cwd, config.canonicalManager, localConfig?.preferredManager);
        console.log("psync: git hooks installed");
        return;
    }
    if (sub === "uninstall") {
        (0, hooks_1.uninstallHooks)(cwd);
        console.log("psync: git hooks removed");
        return;
    }
    console.error("Usage: psync hooks [install|uninstall]");
    process.exit(1);
}
// ── psync help ─────────────────────────────────────────────────────
function help() {
    console.log(`
unisync (psync) — Use any package manager. One lock file stays in charge.

Commands:
  psync init          Set up the canonical manager for this project (project owner)
  psync setup         Configure your preferred manager (collaborators)
  psync detect        Show current configuration and detected lock files
  psync doctor        Run environment health check
  psync verify        CI/CD check: verify lock file is in sync
  psync sync          Manually sync: pin versions + regenerate canonical lock
  psync install       Run your preferred manager's install
  psync hooks install Install git hooks
  psync hooks uninstall Remove git hooks

How it works:
  1. The project owner runs "psync init" to choose a canonical lock file
  2. Collaborators run "psync setup" to pick their preferred manager
  3. Everyone works normally with their own manager
  4. Git hooks automatically keep the canonical lock file in sync

  On commit  → psync pins versions + regenerates the canonical lock
  On pull    → psync runs your preferred manager's install
`.trim());
}
// ── Utility ────────────────────────────────────────────────────────
function prompt(question, valid) {
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        const ask = () => {
            rl.question(question, (answer) => {
                const trimmed = answer.trim().toLowerCase();
                if (valid.includes(trimmed)) {
                    rl.close();
                    resolve(trimmed);
                }
                else {
                    console.log(`Please enter one of: ${valid.join(", ")}`);
                    ask();
                }
            });
        };
        ask();
    });
}
main().catch((err) => {
    console.error("psync: unexpected error:", err);
    process.exit(1);
});
