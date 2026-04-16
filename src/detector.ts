import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

interface LockFileEntry {
  file: string;
  manager: PackageManager;
}

const LOCK_FILES: LockFileEntry[] = [
  { file: "yarn.lock", manager: "yarn" },
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "bun.lockb", manager: "bun" },
  { file: "bun.lock", manager: "bun" },
  { file: "package-lock.json", manager: "npm" },
];

/**
 * Walk up from `startDir` looking for a lock file or a package.json with a "packageManager" field.
 * Returns the first match — closest to the working directory wins.
 */
export function detectManager(startDir: string = process.cwd()): PackageManager | null {
  let dir = path.resolve(startDir);

  while (true) {
    // 1. Check for lock files (strongest signal)
    for (const entry of LOCK_FILES) {
      if (fs.existsSync(path.join(dir, entry.file))) {
        return entry.manager;
      }
    }

    // 2. Check package.json "packageManager" field
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.packageManager && typeof pkg.packageManager === "string") {
          const [name] = pkg.packageManager.split("@");
          if (["npm", "yarn", "pnpm", "bun"].includes(name)) {
            return name as PackageManager;
          }
        }
      } catch {
        // Ignore malformed package.json
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return null;
}

/**
 * Check if a package manager is installed on the system.
 */
export async function isManagerInstalled(manager: PackageManager): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "command -v";
  try {
    execSync(`${cmd} ${manager}`, { stdio: "ignore" });
    return true;
  } catch {
    if (process.platform === "win32") {
      try {
        execSync(`where ${manager}.cmd`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * List every lock file found in `dir` (non-recursive, single level).
 */
export function listLockFiles(dir: string = process.cwd()): LockFileEntry[] {
  return LOCK_FILES.filter((entry) =>
    fs.existsSync(path.join(dir, entry.file))
  );
}
