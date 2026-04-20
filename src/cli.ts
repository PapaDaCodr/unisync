#!/usr/bin/env node

import { detectManager, listLockFiles, PackageManager, isManagerInstalled } from "./detector";
import {
  readProjectConfig,
  writeProjectConfig,
  readLocalConfig,
  writeLocalConfig,
  ensureGitignore,
} from "./config";
import { installHooks, uninstallHooks } from "./hooks";
import { syncLockFile, getNonCanonicalLockFiles, getLockFileName } from "./sync";
import { execute } from "./executor";
import { autoBootstrap } from "./bootstrap";
import readline from "readline";
import path from "path";
import fs from "fs"

// Read our own version once, used for bootstrap fingerprinting.
function readPsyncVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const MANAGERS: PackageManager[] = ["npm", "yarn", "pnpm", "bun"];

async function main(): Promise<void> {
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
    case "auto":
      return auto();
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

async function init(): Promise<void> {
  const cwd = process.cwd();

  console.log("unisync — project setup\n");

  // 1. Detect or ask for canonical manager
  const locks = listLockFiles(cwd);
  let canonical: PackageManager;

  if (locks.length === 1) {
    canonical = locks[0].manager;
    console.log(`Detected ${locks[0].file} — using "${canonical}" as canonical manager.`);
  } else if (locks.length > 1) {
    console.log("Multiple lock files detected:");
    locks.forEach((l) => console.log(`  - ${l.file} (${l.manager})`));
    canonical = await prompt(
      "\nWhich should be the canonical (committed) manager? ",
      MANAGERS,
    ) as PackageManager;
  } else {
    console.log("No lock file detected.");
    canonical = await prompt(
      "Which package manager should be canonical? (" + MANAGERS.join("/") + "): ",
      MANAGERS,
    ) as PackageManager;
  }

  // 2. Write project config — warn-mode by default for safe rollout
  writeProjectConfig(cwd, { canonicalManager: canonical, enforce: "warn" });
  console.log(`\nCreated .psyncrc.json (canonical: ${canonical}, enforce: warn)`);

  // 3. Update .gitignore
  const nonCanonical = getNonCanonicalLockFiles(canonical);
  ensureGitignore(cwd, [...nonCanonical, ".psyncrc.local.json", ".psync/"]);
  console.log("Updated .gitignore (non-canonical lock files + local config)");

  // 4. Wire psync into the project's preinstall so teammates bootstrap automatically.
  addPreinstallHook(cwd);

  // 5. Install git hooks (warn mode to start — flip to block once team is settled)
  try {
    installHooks(cwd, canonical, canonical, "warn");
    console.log("Installed git hooks (pre-commit, post-merge, post-checkout)");
  } catch (err) {
    console.warn(`Warning: could not install git hooks: ${(err as Error).message}`);
  }

  // 6. Instructions
  console.log(`
Setup complete! Here's what happens now:

  1. You work normally with "${canonical}"
  2. Teammates clone and run their usual install (npm / yarn / pnpm / bun)
  3. The preinstall hook auto-bootstraps them — no command to remember
  4. Git hooks keep ${getLockFileName(canonical)} in sync automatically

Share this with your team:
  npx unisync setup
`);
}

// ── psync setup ────────────────────────────────────────────────────
// For collaborators: pick preferred manager, install hooks, run install.

async function setup(): Promise<void> {
  const cwd = process.cwd();

  const projectConfig = readProjectConfig(cwd);
  if (!projectConfig) {
    console.error(
      'psync: no .psyncrc.json found.  Run "psync init" first.',
    );
    process.exit(1);
  }

  console.log(`unisync — developer setup`);
  console.log(`Canonical manager: ${projectConfig.canonicalManager}\n`);

  // 1. Ask preferred manager
  const preferred = await prompt(
    "Which package manager do you use? (" + MANAGERS.join("/") + "): ",
    MANAGERS,
  ) as PackageManager;

  // 2. Write local config
  writeLocalConfig(cwd, { preferredManager: preferred });
  console.log(`\nSaved preference: ${preferred} (in .psyncrc.local.json, gitignored)`);

  // 3. Install git hooks
  try {
    installHooks(cwd, projectConfig.canonicalManager, preferred, projectConfig.enforce ?? "warn");
    console.log("Installed git hooks");
  } catch (err) {
    console.warn(`Warning: could not install git hooks: ${(err as Error).message}`);
  }

  // 4. Run install with preferred manager
  console.log(`\nRunning ${preferred} install...\n`);
  const code = await execute(preferred, ["install"]);
  if (code !== 0) {
    console.error(`\npsync: "${preferred} install" exited with code ${code}`);
    process.exit(code);
  }

  console.log(`\nDone! Just use "${preferred}" normally — psync handles the rest.`);
}

// ── psync detect ───────────────────────────────────────────────────

function detect(): void {
  const cwd = process.cwd();

  const projectConfig = readProjectConfig(cwd);
  const localConfig = readLocalConfig(cwd);
  const detectedManager = detectManager(cwd);
  const locks = listLockFiles(cwd);

  console.log("unisync status\n");

  if (projectConfig) {
    console.log(`  Canonical manager : ${projectConfig.canonicalManager}`);
    console.log(`  Enforce mode      : ${projectConfig.enforce ?? "warn"}`);
  } else {
    console.log("  Canonical manager : not configured (run 'psync init')");
  }

  if (localConfig) {
    console.log(`  Preferred manager : ${localConfig.preferredManager}`);
  } else {
    console.log("  Preferred manager : not configured (run 'psync setup')");
  }

  if (detectedManager) {
    console.log(`  Detected (lock)   : ${detectedManager}`);
  }

  if (locks.length > 0) {
    console.log(`  Lock files found  : ${locks.map((l) => l.file).join(", ")}`);
  } else {
    console.log("  Lock files found  : none");
  }
}

// ── psync sync ─────────────────────────────────────────────────────
// Manually sync: pin versions + regenerate canonical lock from node_modules.

function sync(args: string[]): void {
  const cwd = process.cwd();
  const check = args.includes("--check");

  const projectConfig = readProjectConfig(cwd);
  if (!projectConfig) {
    // Fall back to detection
    const detected = detectManager(cwd);
    if (!detected) {
      console.error('psync: no canonical manager configured. Run "psync init" first.');
      process.exit(1);
    }
    if (check) {
      // Phase 1 placeholder: --check is a no-op until Phase 2 ships real diff.
      return;
    }
    console.log(`psync: no config found, using detected manager: ${detected}`);
    syncLockFile(cwd, detected);
    return;
  }

  if (check) {
    // Phase 1 placeholder: --check is a no-op until Phase 2 ships real diff.
    return;
  }

  const result = syncLockFile(cwd, projectConfig.canonicalManager);
  console.log(
    `psync: sync complete — ${result.packagesResolved} packages, ` +
      `versions ${result.versionsPinned ? "pinned" : "unchanged"}`,
  );
}

// Adds `preinstall: npx --yes psync auto || true` to the project's
// package.json so every install (npm/yarn/pnpm/bun) auto-bootstraps.
// Leaves an existing preinstall script alone if it already runs psync.
function addPreinstallHook(cwd: string): void {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const raw = fs.readFileSync(pkgPath, "utf-8");
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw);
  } catch {
    console.warn("psync: skipping preinstall wiring — package.json is not valid JSON");
    return;
  }

  const scripts = ((pkg.scripts as Record<string, string> | undefined) ?? {});
  const desired = "npx --yes psync auto || true";
  const current = scripts.preinstall;

  if (current && current.includes("psync auto")) return;

  if (current && current.trim().length > 0) {
    scripts.preinstall = `${desired} && ${current}`;
  } else {
    scripts.preinstall = desired;
  }
  pkg.scripts = scripts;

  const indentMatch = raw.match(/^(\s+)"/m);
  const indent = indentMatch ? indentMatch[1].length : 2;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
  console.log("Added preinstall hook to package.json (teammates auto-bootstrap on install)");
}

// ── psync auto ─────────────────────────────────────────────────────
// Invoked from a package.json preinstall script. Idempotent, silent on
// success, NEVER exits non-zero — a failing bootstrap must not break install.

function auto(): void {
  try {
    const result = autoBootstrap(process.cwd(), readPsyncVersion());
    if (process.env.PSYNC_AUTO_DEBUG) {
      console.log(`psync auto: ${result.status}${result.detail ? " — " + result.detail : ""}`);
    }
  } catch (err) {
    if (process.env.PSYNC_AUTO_DEBUG) {
      console.error(`psync auto: unexpected error: ${(err as Error).message}`);
    }
  }
  // Always exit 0. Never block install.
}

// ── psync install ──────────────────────────────────────────────────
// Run the developer's preferred manager install (used by post-merge hook).

async function install(): Promise<void> {
  const cwd = process.cwd();

  const localConfig = readLocalConfig(cwd);
  const preferred = localConfig?.preferredManager ?? detectManager(cwd) ?? "npm";

  console.log(`psync: running ${preferred} install...`);
  const code = await execute(preferred, ["install"]);
  process.exit(code);
}

// ── psync doctor ───────────────────────────────────────────────────

async function doctor(): Promise<void> {
  const cwd = process.cwd();
  console.log("unisync doctor — diagnostic report\n");

  let healthy = true;

  // 1. Config Check
  const projectConfig = readProjectConfig(cwd);
  if (projectConfig) {
    console.log(`  [OK] Project config found (.psyncrc.json)`);
    console.log(`       Canonical manager: ${projectConfig.canonicalManager}`);
  } else {
    console.log(`  [!!] No project config found. Run "psync init".`);
    healthy = false;
  }

  const localConfig = readLocalConfig(cwd);
  if (localConfig) {
    console.log(`  [OK] Local preference found (.psyncrc.local.json)`);
    console.log(`       Preferred manager: ${localConfig.preferredManager}`);
  } else {
    console.log(`  [--] No local preference set. This is fine, will use detected.`);
  }

  // 2. Manager Check
  console.log("\n  Checking package managers:");
  for (const mgr of MANAGERS) {
    const installed = await isManagerInstalled(mgr);
    console.log(`       ${installed ? "[OK]" : "[  ]"} ${mgr}`);
    if (projectConfig?.canonicalManager === mgr && !installed) {
      console.log(`       [!!] Warning: Canonical manager "${mgr}" is not in your PATH.`);
      healthy = false;
    }
  }

  // 3. Git Check
  const hasGit = await isManagerInstalled("git" as PackageManager);
  if (hasGit) {
    const hooksDir = path.join(cwd, ".git", "hooks");
    if (fs.existsSync(hooksDir)) {
      console.log(`\n  [OK] Git hooks directory found`);
    } else {
      console.log(`\n  [!!] Git directory found but no hooks. Run "psync hooks install".`);
      healthy = false;
    }
  } else {
    console.log(`\n  [!!] Git is not installed.`);
    healthy = false;
  }

  if (healthy) {
    console.log("\n  Result: Environment looks healthy! ✨");
  } else {
    console.log("\n  Result: Some issues found. Resolve them for best results.");
    process.exit(1);
  }
}

// ── psync verify ───────────────────────────────────────────────────

function verify(): void {
  const cwd = process.cwd();

  const projectConfig = readProjectConfig(cwd);
  if (!projectConfig) {
    console.error('psync: no canonical manager configured. Run "psync init" first.');
    process.exit(1);
  }

  const canonical = projectConfig.canonicalManager;
  const lockFileName = getLockFileName(canonical);
  const lockFilePath = path.join(cwd, lockFileName);

  if (!fs.existsSync(lockFilePath)) {
    console.error(`psync: canonical lock file "${lockFileName}" missing.`);
    process.exit(1);
  }

  const existingContent = fs.readFileSync(lockFilePath, "utf-8");
  
  // Perform a sync
  syncLockFile(cwd, canonical);
  const newContent = fs.readFileSync(lockFilePath, "utf-8");

  // If we changed it, it wasn't verified
  if (existingContent !== newContent) {
    console.error(`\npsync: [FAIL] Canonical lock file "${lockFileName}" was out of sync!`);
    console.error(`             It has been updated. Please commit the changes.`);
    process.exit(1);
  }

  console.log(`\npsync: [PASS] Canonical lock file "${lockFileName}" is in sync.`);
}

// ── psync hooks ────────────────────────────────────────────────────

function hooks(args: string[]): void {
  const cwd = process.cwd();
  const sub = args[0];

  if (sub === "install") {
    const config = readProjectConfig(cwd);
    if (!config) {
      console.error('psync: no .psyncrc.json found. Run "psync init" first.');
      process.exit(1);
    }
    const localConfig = readLocalConfig(cwd);
    installHooks(cwd, config.canonicalManager, localConfig?.preferredManager, config.enforce ?? "warn");
    console.log(`psync: git hooks installed (enforce: ${config.enforce ?? "warn"})`);
    return;
  }

  if (sub === "uninstall") {
    uninstallHooks(cwd);
    console.log("psync: git hooks removed");
    return;
  }

  console.error("Usage: psync hooks [install|uninstall]");
  process.exit(1);
}

// ── psync help ─────────────────────────────────────────────────────

function help(): void {
  console.log(`
unisync (psync) — Use any package manager. One lock file stays in charge.

Commands:
  psync init          Set up the canonical manager for this project (project owner)
  psync setup         Configure your preferred manager (collaborators)
  psync auto          Silent bootstrap (wired into preinstall — you rarely run this)
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

function prompt(question: string, valid: string[]): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const ask = (): void => {
      rl.question(question, (answer: string) => {
        const trimmed = answer.trim().toLowerCase();
        if (valid.includes(trimmed)) {
          rl.close();
          resolve(trimmed);
        } else {
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
