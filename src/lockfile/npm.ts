import { DependencyGraph, RootPackageJson, LockFileGenerator, LockFileParser } from "./types";

/**
 * Generate and parse package-lock.json (lockfileVersion 3).
 *
 * Format reference:
 *   { lockfileVersion: 3, packages: { "": { root }, "node_modules/pkg": { ... } } }
 */

export const npmGenerator: LockFileGenerator = {
  generate(graph: DependencyGraph, rootPkg: RootPackageJson): string {
    const packages: Record<string, Record<string, unknown>> = {};

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
      const pkg = graph.get(key)!;
      const entry: Record<string, unknown> = {
        version: pkg.version,
      };

      if (pkg.resolved) entry.resolved = pkg.resolved;
      if (pkg.integrity) entry.integrity = pkg.integrity;
      if (pkg.dev) entry.dev = true;
      if (pkg.optional) entry.optional = true;
      if (pkg.dependencies) entry.dependencies = pkg.dependencies;
      if (pkg.optionalDependencies) entry.optionalDependencies = pkg.optionalDependencies;
      if (pkg.peerDependencies) entry.peerDependencies = pkg.peerDependencies;
      if (pkg.engines) entry.engines = pkg.engines;
      if (pkg.os) entry.os = pkg.os;
      if (pkg.cpu) entry.cpu = pkg.cpu;
      if (pkg.bin) entry.bin = pkg.bin;

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

export const npmParser: LockFileParser = {
  parse(content: string): DependencyGraph {
    const graph: DependencyGraph = new Map();
    const lock = JSON.parse(content);
    const packages = lock.packages ?? {};

    for (const [key, value] of Object.entries(packages)) {
      // Skip root entry
      if (key === "") continue;

      const pkg = value as Record<string, unknown>;
      graph.set(key, {
        name: extractNameFromPath(key),
        version: (pkg.version as string) ?? "0.0.0",
        resolved: pkg.resolved as string | undefined,
        integrity: pkg.integrity as string | undefined,
        dev: (pkg.dev as boolean) ?? false,
        optional: (pkg.optional as boolean) ?? undefined,
        dependencies: pkg.dependencies as Record<string, string> | undefined,
        optionalDependencies: pkg.optionalDependencies as Record<string, string> | undefined,
        peerDependencies: pkg.peerDependencies as Record<string, string> | undefined,
        engines: pkg.engines as Record<string, string> | undefined,
        os: pkg.os as string[] | undefined,
        cpu: pkg.cpu as string[] | undefined,
        bin: pkg.bin as Record<string, string> | string | undefined,
      });
    }

    return graph;
  },
};

function extractNameFromPath(nmPath: string): string {
  // "node_modules/@scope/pkg" → "@scope/pkg"
  // "node_modules/pkg" → "pkg"
  // "node_modules/a/node_modules/@scope/b" → "@scope/b"
  const parts = nmPath.split("node_modules/");
  return parts[parts.length - 1];
}
