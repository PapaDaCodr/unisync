import { PackageManager } from "./detector";
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
export declare function syncLockFile(projectDir: string, canonicalManager: PackageManager): SyncResult;
/**
 * Get the lock file name for a given package manager.
 */
export declare function getLockFileName(manager: PackageManager): string;
/**
 * Get all lock file names except the canonical one.
 */
export declare function getNonCanonicalLockFiles(canonical: PackageManager): string[];
