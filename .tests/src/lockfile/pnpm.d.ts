import { LockFileGenerator, LockFileParser } from "./types";
/**
 * Generate and parse pnpm-lock.yaml.
 *
 * We use a minimal YAML writer/reader — no external YAML library needed.
 * We only handle the subset of YAML that pnpm-lock.yaml uses.
 *
 * Format (lockfileVersion 9):
 *   lockfileVersion: '9.0'
 *   settings:
 *     autoInstallPeers: true
 *   importers:
 *     .:
 *       dependencies:
 *         express:
 *           specifier: 4.21.0
 *           version: 4.21.0
 *   packages:
 *     express@4.21.0:
 *       resolution: {integrity: sha512-...}
 *       dependencies:
 *         accepts: 1.3.8
 */
export declare const pnpmGenerator: LockFileGenerator;
export declare const pnpmParser: LockFileParser;
