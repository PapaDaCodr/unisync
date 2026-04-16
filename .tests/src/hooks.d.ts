import { PackageManager } from "./detector";
/**
 * Install git hooks for unisync.
 * Appends to existing hooks rather than overwriting — plays nice with husky, etc.
 */
export declare function installHooks(projectDir: string, canonicalManager: PackageManager, preferredManager?: PackageManager): void;
/**
 * Remove unisync hooks from all hook files.
 */
export declare function uninstallHooks(projectDir: string): void;
