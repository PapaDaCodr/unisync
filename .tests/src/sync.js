"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNonCanonicalLockFiles = exports.getLockFileName = exports.syncLockFile = void 0;
const path_1 = __importDefault(require("path"));
const resolver_1 = require("./lockfile/resolver");
const npm_1 = require("./lockfile/npm");
const yarn_1 = require("./lockfile/yarn");
const pnpm_1 = require("./lockfile/pnpm");
const bun_1 = require("./lockfile/bun");
const pinner_1 = require("./pinner");
const fs_1 = __importDefault(require("fs"));
const GENERATORS = {
    npm: npm_1.npmGenerator,
    yarn: yarn_1.yarnGenerator,
    pnpm: pnpm_1.pnpmGenerator,
    bun: bun_1.bunGenerator,
};
const LOCK_FILES = {
    npm: "package-lock.json",
    yarn: "yarn.lock",
    pnpm: "pnpm-lock.yaml",
    bun: "bun.lock",
};
/**
 * The core sync operation:
 * 1. Pin versions in package.json (strip ^/~)
 * 2. Walk node_modules to build the dependency graph
 * 3. Generate the canonical lock file
 */
function syncLockFile(projectDir, canonicalManager) {
    // Step 1: Pin versions
    const pinned = (0, pinner_1.pinVersions)(projectDir);
    if (pinned) {
        console.log("psync: pinned exact versions in package.json");
    }
    // Step 2: Resolve installed packages
    const graph = (0, resolver_1.resolveFromNodeModules)(projectDir);
    if (graph.size === 0) {
        console.warn("psync: node_modules is empty — run your package manager's install first");
    }
    // Step 3: Read root package.json (after pinning)
    const rootPkg = (0, resolver_1.readRootPackageJson)(projectDir);
    // Step 4: Generate canonical lock file
    const generator = GENERATORS[canonicalManager];
    const lockContent = generator.generate(graph, rootPkg);
    const lockFileName = LOCK_FILES[canonicalManager];
    const lockFilePath = path_1.default.join(projectDir, lockFileName);
    fs_1.default.writeFileSync(lockFilePath, lockContent);
    console.log(`psync: generated ${lockFileName} (${graph.size} packages)`);
    return {
        lockFilePath,
        versionsPinned: pinned,
        packagesResolved: graph.size,
    };
}
exports.syncLockFile = syncLockFile;
/**
 * Get the lock file name for a given package manager.
 */
function getLockFileName(manager) {
    return LOCK_FILES[manager];
}
exports.getLockFileName = getLockFileName;
/**
 * Get all lock file names except the canonical one.
 */
function getNonCanonicalLockFiles(canonical) {
    return Object.entries(LOCK_FILES)
        .filter(([mgr]) => mgr !== canonical)
        .map(([, file]) => file)
        .concat(["bun.lockb"]); // Always ignore binary bun lock
}
exports.getNonCanonicalLockFiles = getNonCanonicalLockFiles;
