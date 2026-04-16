export interface ResolvedPackage {
    name: string;
    version: string;
    resolved?: string;
    integrity?: string;
    dev: boolean;
    optional?: boolean;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    os?: string[];
    cpu?: string[];
    bin?: Record<string, string> | string;
}
/** Maps node_modules paths (e.g. "node_modules/express") to resolved data. */
export type DependencyGraph = Map<string, ResolvedPackage>;
export interface LockFileGenerator {
    generate(graph: DependencyGraph, rootPackageJson: RootPackageJson): string;
}
export interface LockFileParser {
    parse(content: string): DependencyGraph;
}
export interface RootPackageJson {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}
