"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.npmParser = exports.npmGenerator = void 0;
/**
 * Generate and parse package-lock.json (lockfileVersion 3).
 *
 * Format reference:
 *   { lockfileVersion: 3, packages: { "": { root }, "node_modules/pkg": { ... } } }
 */
exports.npmGenerator = {
    generate(graph, rootPkg) {
        const packages = {};
        // Root entry
        packages[""] = {
            name: rootPkg.name ?? "",
            version: rootPkg.version ?? "1.0.0",
            license: "MIT",
            ...(rootPkg.dependencies && { dependencies: rootPkg.dependencies }),
            ...(rootPkg.devDependencies && { devDependencies: rootPkg.devDependencies }),
            ...(rootPkg.optionalDependencies && {
                optionalDependencies: rootPkg.optionalDependencies,
            }),
        };
        // Sort entries for deterministic output
        const sortedKeys = [...graph.keys()].sort();
        for (const key of sortedKeys) {
            const pkg = graph.get(key);
            const entry = {
                version: pkg.version,
            };
            if (pkg.resolved)
                entry.resolved = pkg.resolved;
            if (pkg.integrity)
                entry.integrity = pkg.integrity;
            if (pkg.dev)
                entry.dev = true;
            if (pkg.optional)
                entry.optional = true;
            if (pkg.dependencies)
                entry.dependencies = pkg.dependencies;
            if (pkg.optionalDependencies)
                entry.optionalDependencies = pkg.optionalDependencies;
            if (pkg.peerDependencies)
                entry.peerDependencies = pkg.peerDependencies;
            if (pkg.engines)
                entry.engines = pkg.engines;
            if (pkg.os)
                entry.os = pkg.os;
            if (pkg.cpu)
                entry.cpu = pkg.cpu;
            if (pkg.bin)
                entry.bin = pkg.bin;
            packages[key] = entry;
        }
        const lockFile = {
            name: rootPkg.name ?? "",
            version: rootPkg.version ?? "1.0.0",
            lockfileVersion: 3,
            requires: true,
            packages,
        };
        return JSON.stringify(lockFile, null, 2) + "\n";
    },
};
exports.npmParser = {
    parse(content) {
        const graph = new Map();
        const lock = JSON.parse(content);
        const packages = lock.packages ?? {};
        for (const [key, value] of Object.entries(packages)) {
            // Skip root entry
            if (key === "")
                continue;
            const pkg = value;
            graph.set(key, {
                name: extractNameFromPath(key),
                version: pkg.version ?? "0.0.0",
                resolved: pkg.resolved,
                integrity: pkg.integrity,
                dev: pkg.dev ?? false,
                optional: pkg.optional ?? undefined,
                dependencies: pkg.dependencies,
                optionalDependencies: pkg.optionalDependencies,
                peerDependencies: pkg.peerDependencies,
                engines: pkg.engines,
                os: pkg.os,
                cpu: pkg.cpu,
                bin: pkg.bin,
            });
        }
        return graph;
    },
};
function extractNameFromPath(nmPath) {
    // "node_modules/@scope/pkg" → "@scope/pkg"
    // "node_modules/pkg" → "pkg"
    // "node_modules/a/node_modules/@scope/b" → "@scope/b"
    const parts = nmPath.split("node_modules/");
    return parts[parts.length - 1];
}
