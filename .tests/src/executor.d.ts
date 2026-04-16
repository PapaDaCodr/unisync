import { PackageManager } from "./detector";
/**
 * Run a package-manager command and stream its output to the terminal.
 * Returns the exit code.
 */
export declare function execute(manager: PackageManager, args: string[]): Promise<number>;
