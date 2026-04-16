import { LockFileGenerator, LockFileParser } from "./types";
/**
 * Generate and parse bun.lock (text-based JSON format, added in bun v1.2).
 *
 * Format:
 *   {
 *     "lockfileVersion": 0,
 *     "workspaces": { "": { "name": "...", "dependencies": { ... } } },
 *     "packages": { "express": ["express@4.21.0", { ... }] }
 *   }
 *
 * Note: bun.lockb (binary) is NOT handled here — that's a local-only format.
 * If someone wants bun as canonical, they use bun.lock (text mode).
 */
export declare const bunGenerator: LockFileGenerator;
export declare const bunParser: LockFileParser;
