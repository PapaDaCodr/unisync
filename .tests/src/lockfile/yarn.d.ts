import { LockFileGenerator, LockFileParser } from "./types";
/**
 * Generate and parse yarn.lock (v1 format).
 *
 * Format:
 *   # yarn lockfile v1
 *
 *   package@range:
 *     version "1.0.0"
 *     resolved "https://registry..."
 *     integrity "sha512-..."
 *     dependencies:
 *       dep "^1.0.0"
 */
export declare const yarnGenerator: LockFileGenerator;
export declare const yarnParser: LockFileParser;
