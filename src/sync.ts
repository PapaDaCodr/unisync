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

export interface CheckResult {
  lockFilePath: string;
  /** What the lock file would contain after sync. */
  generatedContent: string;
  /** What the lock file currently contains (empty string if absent). */
  existingContent: string;
  /** True if package.json has unpinned ranges that sync would strip. */
  packageJsonWouldChange: boolean;
  /** True if the lock file would change (differs from existing). */
  lockFileWouldChange: boolean;
  /** Total packages in the generated graph. */
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
 * Non-mutating counterpart of syncLockFile. Computes what sync would
 * produce without touching disk. Caller decides what to do with the
 * result (diff, exit non-zero, write to a report file, etc).
 */
export function checkLockFile(
  projectDir: string,
  canonicalManager: PackageManager,
): CheckResult {
  const pkgJsonPath = path.join(projectDir, "package.json");
  const originalPkgRaw = fs.existsSync(pkgJsonPath)
    ? fs.readFileSync(pkgJsonPath, "utf-8")
    : "";

  // Build an in-memory pinned snapshot without persisting it.
  const originalPkg = originalPkgRaw ? JSON.parse(originalPkgRaw) : {};
  const pinnedPkg = cloneWithPinnedVersions(originalPkg);
  const packageJsonWouldChange =
    JSON.stringify(pinnedPkg) !== JSON.stringify(originalPkg);

  const graph = resolveFromNodeModules(projectDir);
  const generator = GENERATORS[canonicalManager];
  const generatedContent = generator.generate(graph, pinnedPkg);

  const lockFileName = LOCK_FILES[canonicalManager];
  const lockFilePath = path.join(projectDir, lockFileName);
  const existingContent = fs.existsSync(lockFilePath)
    ? fs.readFileSync(lockFilePath, "utf-8")
    : "";

  return {
    lockFilePath,
    generatedContent,
    existingContent,
    packageJsonWouldChange,
    lockFileWouldChange: existingContent !== generatedContent,
    packagesResolved: graph.size,
  };
}

/**
 * In-memory version of pinner.stripRange, so checkLockFile stays pure.
 * Keeps the same carve-outs: workspace:/file:/link:/npm:/git/http, *, latest.
 */
function cloneWithPinnedVersions(pkg: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = JSON.parse(JSON.stringify(pkg));
  const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const field of fields) {
    const deps = copy[field];
    if (!deps || typeof deps !== "object") continue;
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof range !== "string") continue;
      (deps as Record<string, string>)[name] = stripRangeInPlace(range);
    }
  }
  return copy;
}

function stripRangeInPlace(version: string): string {
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
  return version.replace(/^[\^~]|^[><=]+\s*/g, "");
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
