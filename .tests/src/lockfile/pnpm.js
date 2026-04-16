"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pnpmParser = exports.pnpmGenerator = void 0;
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
exports.pnpmGenerator = {
    generate(graph, rootPkg) {
        const lines = [];
        lines.push("lockfileVersion: '9.0'");
        lines.push("");
        lines.push("settings:");
        lines.push("  autoInstallPeers: true");
        lines.push("  excludeLinksFromLockfile: false");
        lines.push("");
        // Importers section (root project)
        lines.push("importers:");
        lines.push("  .:");
        const depSections = [
            ["dependencies", rootPkg.dependencies],
            ["devDependencies", rootPkg.devDependencies],
            ["optionalDependencies", rootPkg.optionalDependencies],
        ];
        for (const [sectionName, deps] of depSections) {
            if (!deps || Object.keys(deps).length === 0)
                continue;
            lines.push(`    ${sectionName}:`);
            for (const [name, specifier] of Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))) {
                // Find the resolved version in the graph
                const resolved = findByName(graph, name);
                const version = resolved?.version ?? specifier;
                lines.push(`      ${yamlKey(name)}:`);
                lines.push(`        specifier: ${yamlValue(specifier)}`);
                lines.push(`        version: ${yamlValue(version)}`);
            }
        }
        lines.push("");
        // Packages section
        lines.push("packages:");
        const sortedKeys = [...graph.keys()].sort();
        for (const key of sortedKeys) {
            const pkg = graph.get(key);
            // Skip nested node_modules — pnpm uses flat structure
            if (key.indexOf("node_modules", "node_modules/".length) !== -1)
                continue;
            lines.push("");
            lines.push(`  ${yamlKey(`${pkg.name}@${pkg.version}`)}:`);
            if (pkg.integrity) {
                lines.push(`    resolution: {integrity: ${pkg.integrity}}`);
            }
            else if (pkg.resolved) {
                lines.push(`    resolution: {tarball: ${pkg.resolved}}`);
            }
            else {
                lines.push(`    resolution: {integrity: ''}`);
            }
            if (pkg.engines) {
                const enginesStr = Object.entries(pkg.engines)
                    .map(([k, v]) => `${k}: ${yamlValue(v)}`)
                    .join(", ");
                lines.push(`    engines: {${enginesStr}}`);
            }
            if (pkg.cpu) {
                lines.push(`    cpu: [${pkg.cpu.join(", ")}]`);
            }
            if (pkg.os) {
                lines.push(`    os: [${pkg.os.join(", ")}]`);
            }
            if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
                lines.push("    dependencies:");
                for (const [dep, range] of Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b))) {
                    const resolved = findByName(graph, dep);
                    lines.push(`      ${yamlKey(dep)}: ${yamlValue(resolved?.version ?? range)}`);
                }
            }
            if (pkg.optionalDependencies && Object.keys(pkg.optionalDependencies).length > 0) {
                lines.push("    optionalDependencies:");
                for (const [dep, range] of Object.entries(pkg.optionalDependencies).sort(([a], [b]) => a.localeCompare(b))) {
                    const resolved = findByName(graph, dep);
                    lines.push(`      ${yamlKey(dep)}: ${yamlValue(resolved?.version ?? range)}`);
                }
            }
            if (pkg.dev) {
                lines.push("    dev: true");
            }
            if (pkg.optional) {
                lines.push("    optional: true");
            }
        }
        lines.push("");
        return lines.join("\n");
    },
};
exports.pnpmParser = {
    parse(content) {
        const graph = new Map();
        const lines = content.split("\n");
        let inPackages = false;
        let currentPkgId = "";
        let currentPkg = {};
        let inSubSection = "";
        function flushPkg() {
            if (!currentPkgId)
                return;
            // Parse "express@4.21.0" → name=express, version=4.21.0
            const atIdx = currentPkgId.lastIndexOf("@");
            if (atIdx <= 0)
                return;
            const name = currentPkgId.substring(0, atIdx);
            const version = currentPkgId.substring(atIdx + 1);
            graph.set(`node_modules/${name}`, {
                name,
                version,
                integrity: currentPkg.integrity,
                resolved: currentPkg.tarball,
                dev: currentPkg.dev === true || currentPkg.dev === "true",
                optional: currentPkg.optional === true || currentPkg.optional === "true",
                dependencies: currentPkg.dependencies,
                optionalDependencies: currentPkg.optionalDependencies,
            });
            currentPkgId = "";
            currentPkg = {};
            inSubSection = "";
        }
        for (const line of lines) {
            // Detect "packages:" section
            if (line === "packages:") {
                inPackages = true;
                continue;
            }
            if (!inPackages)
                continue;
            // Top-level (2-space indent) package header: "  express@4.21.0:"
            if (line.match(/^ {2}\S/) && line.endsWith(":")) {
                flushPkg();
                currentPkgId = line.trim().replace(/:$/, "").replace(/^'|'$/g, "");
                currentPkg = {};
                inSubSection = "";
                continue;
            }
            // 4-space indent: package properties
            if (line.match(/^ {4}\S/) && currentPkgId) {
                const trimmed = line.trim();
                // Check for resolution inline: "resolution: {integrity: sha512-...}"
                const resMatch = trimmed.match(/^resolution:\s*\{(.+)\}$/);
                if (resMatch) {
                    const inner = resMatch[1];
                    const intMatch = inner.match(/integrity:\s*(\S+)/);
                    if (intMatch)
                        currentPkg.integrity = intMatch[1];
                    const tarMatch = inner.match(/tarball:\s*(\S+)/);
                    if (tarMatch)
                        currentPkg.tarball = tarMatch[1];
                    inSubSection = "";
                    continue;
                }
                // Sub-section: "dependencies:", "optionalDependencies:"
                if (trimmed === "dependencies:" || trimmed === "optionalDependencies:") {
                    inSubSection = trimmed.replace(":", "");
                    if (!currentPkg[inSubSection])
                        currentPkg[inSubSection] = {};
                    continue;
                }
                // Simple key-value: "dev: true"
                const kvMatch = trimmed.match(/^(\S+):\s*(.+)$/);
                if (kvMatch) {
                    inSubSection = "";
                    const val = kvMatch[2].replace(/^'|'$/g, "");
                    currentPkg[kvMatch[1]] = val === "true" ? true : val === "false" ? false : val;
                }
                continue;
            }
            // 6-space indent: sub-section entries (dependencies)
            if (line.match(/^ {6}\S/) && currentPkgId && inSubSection) {
                const trimmed = line.trim();
                const kvMatch = trimmed.match(/^(.+?):\s*(.+)$/);
                if (kvMatch) {
                    const deps = currentPkg[inSubSection];
                    deps[kvMatch[1].replace(/^'|'$/g, "")] = kvMatch[2].replace(/^'|'$/g, "");
                }
                continue;
            }
            // Non-indented line after packages — we've left the section
            if (!line.startsWith(" ") && line.trim() !== "") {
                flushPkg();
                inPackages = false;
            }
        }
        flushPkg();
        return graph;
    },
};
function findByName(graph, name) {
    for (const [key, pkg] of graph) {
        if (pkg.name === name && !key.includes("node_modules/" + name + "/node_modules/")) {
            return pkg;
        }
    }
    return undefined;
}
function yamlKey(s) {
    // Quote keys that contain special chars
    if (s.includes("@") || s.includes("/") || s.includes(" ")) {
        return `'${s}'`;
    }
    return s;
}
function yamlValue(s) {
    if (s.includes(":") || s.includes("#") || s.includes(" ") || s.startsWith("'")) {
        return `'${s}'`;
    }
    return s;
}
