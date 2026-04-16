import { PackageManager } from "./detector";
/** Project-wide config — committed to git. */
export interface ProjectConfig {
    canonicalManager: PackageManager;
}
/** Per-developer config — gitignored. */
export interface LocalConfig {
    preferredManager: PackageManager;
}
export declare function readProjectConfig(dir?: string): ProjectConfig | null;
export declare function writeProjectConfig(dir: string, config: ProjectConfig): void;
export declare function readLocalConfig(dir?: string): LocalConfig | null;
export declare function writeLocalConfig(dir: string, config: LocalConfig): void;
/**
 * Ensure .gitignore contains the given entries.
 * Creates .gitignore if it doesn't exist.
 */
export declare function ensureGitignore(dir: string, entries: string[]): void;
