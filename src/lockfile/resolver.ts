import fs from "fs";
import path from "path";
import { DependencyGraph, ResolvedPackage, RootPackageJson } from "./types";

/**
 * Walk node_modules and build a dependency graph from what's actually installed.
 * Each package's own package.json contains _resolved / _integrity fields
 * written by the package manager during install.
 */
export function resolveFromNodeModules(projectDir: string): DependencyGraph {
  const graph: DependencyGraph = new Map();
  const nodeModulesDir = path.join(projectDir, "node_modules");

  if (!fs.existsSync(nodeModulesDir)) {
    return graph;
  }

  const rootPkg = readRootPackageJson(projectDir);
  const devDeps = new Set(Object.keys(rootPkg.devDependencies ?? {}));

  walkNodeModules(nodeModulesDir, "", graph, devDeps);
  return graph;
}

export function readRootPackageJson(projectDir: string): RootPackageJson {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
}

function walkNodeModules(
  nodeModulesDir: string,
  prefix: string,
  graph: DependencyGraph,
  devDeps: Set<string>,
): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden dirs and .bin
    if (entry.startsWith(".")) continue;

    const fullPath = path.join(nodeModulesDir, entry);

    // Handle scoped packages (@scope/pkg)
    if (entry.startsWith("@")) {
      let scopedEntries: string[];
      try {
        scopedEntries = fs.readdirSync(fullPath);
      } catch {
        continue;
      }
      for (const scopedEntry of scopedEntries) {
        const scopedName = `${entry}/${scopedEntry}`;
        const scopedPath = path.join(fullPath, scopedEntry);
        processPackage(scopedPath, scopedName, prefix, graph, devDeps);
      }
      continue;
    }

    processPackage(fullPath, entry, prefix, graph, devDeps);
  }
}

function processPackage(
  pkgDir: string,
  name: string,
  prefix: string,
  graph: DependencyGraph,
  devDeps: Set<string>,
): void {
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return;

  let pkgJson: Record<string, unknown>;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  } catch {
    return;
  }

  const graphKey = prefix
    ? `${prefix}/node_modules/${name}`
    : `node_modules/${name}`;

  const resolved: ResolvedPackage = {
    name,
    version: (pkgJson.version as string) ?? "0.0.0",
    dev: devDeps.has(name),
    resolved: pkgJson._resolved as string | undefined,
    integrity: pkgJson._integrity as string | undefined,
  };

  // Copy dependency fields if present
  if (pkgJson.dependencies && Object.keys(pkgJson.dependencies as object).length > 0) {
    resolved.dependencies = pkgJson.dependencies as Record<string, string>;
  }
  if (pkgJson.optionalDependencies && Object.keys(pkgJson.optionalDependencies as object).length > 0) {
    resolved.optionalDependencies = pkgJson.optionalDependencies as Record<string, string>;
  }
  if (pkgJson.peerDependencies && Object.keys(pkgJson.peerDependencies as object).length > 0) {
    resolved.peerDependencies = pkgJson.peerDependencies as Record<string, string>;
  }
  if (pkgJson.engines && Object.keys(pkgJson.engines as object).length > 0) {
    resolved.engines = pkgJson.engines as Record<string, string>;
  }
  if (pkgJson.os) resolved.os = pkgJson.os as string[];
  if (pkgJson.cpu) resolved.cpu = pkgJson.cpu as string[];
  if (pkgJson.bin) resolved.bin = pkgJson.bin as Record<string, string> | string;
  if (pkgJson.optional) resolved.optional = true;

  graph.set(graphKey, resolved);

  // Recurse into nested node_modules (non-hoisted packages)
  const nestedNodeModules = path.join(pkgDir, "node_modules");
  if (fs.existsSync(nestedNodeModules)) {
    walkNodeModules(nestedNodeModules, graphKey, graph, devDeps);
  }
}
