import { LockFileGenerator, LockFileParser } from "./types";
/**
 * Generate and parse package-lock.json (lockfileVersion 3).
 *
 * Format reference:
 *   { lockfileVersion: 3, packages: { "": { root }, "node_modules/pkg": { ... } } }
 */
export declare const npmGenerator: LockFileGenerator;
export declare const npmParser: LockFileParser;
