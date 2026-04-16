import { DependencyGraph, RootPackageJson } from "./types";
/**
 * Walk node_modules and build a dependency graph from what's actually installed.
 * Each package's own package.json contains _resolved / _integrity fields
 * written by the package manager during install.
 */
export declare function resolveFromNodeModules(projectDir: string): DependencyGraph;
export declare function readRootPackageJson(projectDir: string): RootPackageJson;
