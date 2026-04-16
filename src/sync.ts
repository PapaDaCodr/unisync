import path from "path";
import { PackageManager } from "./detector";
import { resolveFromNodeModules, readRootPackageJson } from "./lockfile/resolver";
import { npmGenerator } from "./lockfile/npm";
import { yarnGenerator } from "./lockfile/yarn";
import { pnpmGenerator } from "./lockfile/pnpm";
import { bunGenerator } from "./lockfile/bun";
import { pinVersions } from "./pinner";
import { LockFileGenerator } from "./lockfile/types";
import fs from "fs";

const GENERATORS: Record<PackageManager, LockFileGenerator> = {
  npm: npmGenerator,
  yarn: yarnGenerator,
  pnpm: pnpmGenerator,
  bun: bunGenerator,
};

const LOCK_FILES: Record<PackageManager, string> = {
  npm: "package-lock.json",
  yarn: "yarn.lock",
  pnpm: "pnpm-lock.yaml",
  bun: "bun.lock",
};

export interface SyncResult {
  lockFilePath: string;
  versionsPinned: boolean;
  packagesResolved: number;
}

/**
 * The core sync operation:
 * 1. Pin versions in package.json (strip ^/~)
 * 2. Walk node_modules to build the dependency graph
 * 3. Generate the canonical lock file
 */
export function syncLockFile(
  projectDir: string,
  canonicalManager: PackageManager,
): SyncResult {
  // Step 1: Pin versions
  const pinned = pinVersions(projectDir);
  if (pinned) {
    console.log("psync: pinned exact versions in package.json");
  }

  // Step 2: Resolve installed packages
  const graph = resolveFromNodeModules(projectDir);
  if (graph.size === 0) {
    console.warn("psync: node_modules is empty — run your package manager's install first");
  }

  // Step 3: Read root package.json (after pinning)
  const rootPkg = readRootPackageJson(projectDir);

  // Step 4: Generate canonical lock file
  const generator = GENERATORS[canonicalManager];
  const lockContent = generator.generate(graph, rootPkg);

  const lockFileName = LOCK_FILES[canonicalManager];
  const lockFilePath = path.join(projectDir, lockFileName);
  fs.writeFileSync(lockFilePath, lockContent);

  console.log(`psync: generated ${lockFileName} (${graph.size} packages)`);

  return {
    lockFilePath,
    versionsPinned: pinned,
    packagesResolved: graph.size,
  };
}

/**
 * Get the lock file name for a given package manager.
 */
export function getLockFileName(manager: PackageManager): string {
  return LOCK_FILES[manager];
}

/**
 * Get all lock file names except the canonical one.
 */
export function getNonCanonicalLockFiles(canonical: PackageManager): string[] {
  return Object.entries(LOCK_FILES)
    .filter(([mgr]) => mgr !== canonical)
    .map(([, file]) => file)
    .concat(["bun.lockb"]); // Always ignore binary bun lock
}
