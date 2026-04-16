export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";
interface LockFileEntry {
    file: string;
    manager: PackageManager;
}
/**
 * Walk up from `startDir` looking for a lock file or a package.json with a "packageManager" field.
 * Returns the first match — closest to the working directory wins.
 */
export declare function detectManager(startDir?: string): PackageManager | null;
/**
 * Check if a package manager is installed on the system.
 */
export declare function isManagerInstalled(manager: PackageManager): Promise<boolean>;
/**
 * List every lock file found in `dir` (non-recursive, single level).
 */
export declare function listLockFiles(dir?: string): LockFileEntry[];
export {};
