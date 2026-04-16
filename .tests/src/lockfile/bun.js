"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bunParser = exports.bunGenerator = void 0;
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
exports.bunGenerator = {
    generate(graph, rootPkg) {
        const workspaces = {};
        const packages = {};
        // Root workspace
        const rootWs = {};
        if (rootPkg.name)
            rootWs.name = rootPkg.name;
        if (rootPkg.dependencies)
            rootWs.dependencies = rootPkg.dependencies;
        if (rootPkg.devDependencies)
            rootWs.devDependencies = rootPkg.devDependencies;
        if (rootPkg.optionalDependencies)
            rootWs.optionalDependencies = rootPkg.optionalDependencies;
        workspaces[""] = rootWs;
        // Packages — bun uses a tuple format: [resolvedId, hash, integrityHash, ...]
        const sortedKeys = [...graph.keys()].sort();
        for (const key of sortedKeys) {
            const pkg = graph.get(key);
            if (key.indexOf("node_modules", "node_modules/".length) !== -1)
                continue;
            const entry = [
                `${pkg.name}@${pkg.version}`,
            ];
            // Bun stores resolved URL as second element if available
            if (pkg.resolved) {
                entry.push(pkg.resolved);
            }
            else {
                entry.push("");
            }
            // Integrity as third element
            if (pkg.integrity) {
                entry.push({ integrity: pkg.integrity });
            }
            packages[pkg.name] = entry;
        }
        const lockFile = {
            lockfileVersion: 0,
            workspaces,
            packages,
        };
        return JSON.stringify(lockFile, null, 2) + "\n";
    },
};
exports.bunParser = {
    parse(content) {
        const graph = new Map();
        const lock = JSON.parse(content);
        const packages = lock.packages ?? {};
        // Collect root dependency info to determine dev status
        const rootWs = lock.workspaces?.[""] ?? {};
        const devDeps = new Set(Object.keys(rootWs.devDependencies ?? {}));
        for (const [name, value] of Object.entries(packages)) {
            if (!Array.isArray(value) || value.length === 0)
                continue;
            const resolvedId = value[0];
            // Parse "express@4.21.0" → version 4.21.0
            const atIdx = resolvedId.lastIndexOf("@");
            const version = atIdx > 0 ? resolvedId.substring(atIdx + 1) : "0.0.0";
            const resolved = typeof value[1] === "string" ? value[1] : undefined;
            const meta = typeof value[2] === "object" && value[2] !== null ? value[2] : undefined;
            graph.set(`node_modules/${name}`, {
                name,
                version,
                resolved: resolved || undefined,
                integrity: meta?.integrity,
                dev: devDeps.has(name),
            });
        }
        return graph;
    },
};
