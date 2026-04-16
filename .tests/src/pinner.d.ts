/**
 * Strip range prefixes (^, ~, >=, etc.) from all dependency versions in
 * package.json so every package manager resolves to the exact same version.
 *
 * Returns true if any changes were made.
 */
export declare function pinVersions(projectDir: string): boolean;
