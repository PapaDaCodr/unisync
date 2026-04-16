import fs from "fs";
import path from "path";

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
 * Walk up from `startDir` looking for a lock file.
 * Returns the first match — closest to the working directory wins.
 */
export function detectManager(startDir: string = process.cwd()): PackageManager | null {
  let dir = path.resolve(startDir);

  while (true) {
    for (const entry of LOCK_FILES) {
      if (fs.existsSync(path.join(dir, entry.file))) {
        return entry.manager;
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return null;
}

/**
 * List every lock file found in `dir` (non-recursive, single level).
 */
export function listLockFiles(dir: string = process.cwd()): LockFileEntry[] {
  return LOCK_FILES.filter((entry) =>
    fs.existsSync(path.join(dir, entry.file))
  );
}
