"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRootPackageJson = exports.resolveFromNodeModules = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Walk node_modules and build a dependency graph from what's actually installed.
 * Each package's own package.json contains _resolved / _integrity fields
 * written by the package manager during install.
 */
function resolveFromNodeModules(projectDir) {
    const graph = new Map();
    const nodeModulesDir = path_1.default.join(projectDir, "node_modules");
    if (!fs_1.default.existsSync(nodeModulesDir)) {
        return graph;
    }
    const rootPkg = readRootPackageJson(projectDir);
    const devDeps = new Set(Object.keys(rootPkg.devDependencies ?? {}));
    walkNodeModules(nodeModulesDir, "", graph, devDeps);
    return graph;
}
exports.resolveFromNodeModules = resolveFromNodeModules;
function readRootPackageJson(projectDir) {
    const pkgPath = path_1.default.join(projectDir, "package.json");
    if (!fs_1.default.existsSync(pkgPath))
        return {};
    return JSON.parse(fs_1.default.readFileSync(pkgPath, "utf-8"));
}
exports.readRootPackageJson = readRootPackageJson;
function walkNodeModules(nodeModulesDir, prefix, graph, devDeps) {
    let entries;
    try {
        entries = fs_1.default.readdirSync(nodeModulesDir);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        // Skip hidden dirs and .bin
        if (entry.startsWith("."))
            continue;
        const fullPath = path_1.default.join(nodeModulesDir, entry);
        // Handle scoped packages (@scope/pkg)
        if (entry.startsWith("@")) {
            let scopedEntries;
            try {
                scopedEntries = fs_1.default.readdirSync(fullPath);
            }
            catch {
                continue;
            }
            for (const scopedEntry of scopedEntries) {
                const scopedName = `${entry}/${scopedEntry}`;
                const scopedPath = path_1.default.join(fullPath, scopedEntry);
                processPackage(scopedPath, scopedName, prefix, graph, devDeps);
            }
            continue;
        }
        processPackage(fullPath, entry, prefix, graph, devDeps);
    }
}
function processPackage(pkgDir, name, prefix, graph, devDeps) {
    const pkgJsonPath = path_1.default.join(pkgDir, "package.json");
    if (!fs_1.default.existsSync(pkgJsonPath))
        return;
    let pkgJson;
    try {
        pkgJson = JSON.parse(fs_1.default.readFileSync(pkgJsonPath, "utf-8"));
    }
    catch {
        return;
    }
    const graphKey = prefix
        ? `${prefix}/node_modules/${name}`
        : `node_modules/${name}`;
    const resolved = {
        name,
        version: pkgJson.version ?? "0.0.0",
        dev: devDeps.has(name),
        resolved: pkgJson._resolved,
        integrity: pkgJson._integrity,
    };
    // Copy dependency fields if present
    if (pkgJson.dependencies && Object.keys(pkgJson.dependencies).length > 0) {
        resolved.dependencies = pkgJson.dependencies;
    }
    if (pkgJson.optionalDependencies && Object.keys(pkgJson.optionalDependencies).length > 0) {
        resolved.optionalDependencies = pkgJson.optionalDependencies;
    }
    if (pkgJson.peerDependencies && Object.keys(pkgJson.peerDependencies).length > 0) {
        resolved.peerDependencies = pkgJson.peerDependencies;
    }
    if (pkgJson.engines && Object.keys(pkgJson.engines).length > 0) {
        resolved.engines = pkgJson.engines;
    }
    if (pkgJson.os)
        resolved.os = pkgJson.os;
    if (pkgJson.cpu)
        resolved.cpu = pkgJson.cpu;
    if (pkgJson.bin)
        resolved.bin = pkgJson.bin;
    if (pkgJson.optional)
        resolved.optional = true;
    graph.set(graphKey, resolved);
    // Recurse into nested node_modules (non-hoisted packages)
    const nestedNodeModules = path_1.default.join(pkgDir, "node_modules");
    if (fs_1.default.existsSync(nestedNodeModules)) {
        walkNodeModules(nestedNodeModules, graphKey, graph, devDeps);
    }
}
