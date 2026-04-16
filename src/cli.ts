#!/usr/bin/env node

import { detectManager, listLockFiles, PackageManager } from "./detector";
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
import readline from "readline";

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

  console.log("package-sync — project setup\n");

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

  // 2. Write project config
  writeProjectConfig(cwd, { canonicalManager: canonical });
  console.log(`\nCreated .psyncrc.json (canonical: ${canonical})`);

  // 3. Update .gitignore
  const nonCanonical = getNonCanonicalLockFiles(canonical);
  ensureGitignore(cwd, [...nonCanonical, ".psyncrc.local.json"]);
  console.log("Updated .gitignore (non-canonical lock files + local config)");

  // 4. Install git hooks
  try {
    installHooks(cwd, canonical);
    console.log("Installed git hooks (pre-commit, post-merge, post-checkout)");
  } catch (err) {
    console.warn(`Warning: could not install git hooks: ${(err as Error).message}`);
  }

  // 5. Instructions
  console.log(`
Setup complete! Here's what happens now:

  1. You work normally with "${canonical}"
  2. Collaborators clone the repo and run: npx package-sync setup
  3. They pick their preferred manager and work normally
  4. Git hooks keep ${getLockFileName(canonical)} in sync automatically

Share this with your team:
  npx package-sync setup
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

  console.log(`package-sync — developer setup`);
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
    installHooks(cwd, projectConfig.canonicalManager);
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

  console.log("package-sync status\n");

  if (projectConfig) {
    console.log(`  Canonical manager : ${projectConfig.canonicalManager}`);
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

  const projectConfig = readProjectConfig(cwd);
  if (!projectConfig) {
    // Fall back to detection
    const detected = detectManager(cwd);
    if (!detected) {
      console.error('psync: no canonical manager configured. Run "psync init" first.');
      process.exit(1);
    }
    console.log(`psync: no config found, using detected manager: ${detected}`);
    syncLockFile(cwd, detected);
    return;
  }

  const result = syncLockFile(cwd, projectConfig.canonicalManager);
  console.log(
    `psync: sync complete — ${result.packagesResolved} packages, ` +
      `versions ${result.versionsPinned ? "pinned" : "unchanged"}`,
  );
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
    installHooks(cwd, config.canonicalManager);
    console.log("psync: git hooks installed");
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
package-sync (psync) — Use any package manager. One lock file stays in charge.

Commands:
  psync init          Set up the canonical manager for this project (project owner)
  psync setup         Configure your preferred manager (collaborators)
  psync detect        Show current configuration and detected lock files
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
