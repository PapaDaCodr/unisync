import fs from "fs";
import path from "path";
import { PackageManager } from "./detector";

const PROJECT_CONFIG = ".psyncrc.json";
const LOCAL_CONFIG = ".psyncrc.local.json";

/** Project-wide config — committed to git. */
export interface ProjectConfig {
  canonicalManager: PackageManager;
}

/** Per-developer config — gitignored. */
export interface LocalConfig {
  preferredManager: PackageManager;
}

export function readProjectConfig(dir: string = process.cwd()): ProjectConfig | null {
  return readJson<ProjectConfig>(path.join(dir, PROJECT_CONFIG));
}

export function writeProjectConfig(dir: string, config: ProjectConfig): void {
  writeJson(path.join(dir, PROJECT_CONFIG), config);
}

export function readLocalConfig(dir: string = process.cwd()): LocalConfig | null {
  return readJson<LocalConfig>(path.join(dir, LOCAL_CONFIG));
}

export function writeLocalConfig(dir: string, config: LocalConfig): void {
  writeJson(path.join(dir, LOCAL_CONFIG), config);
}

/**
 * Ensure .gitignore contains the given entries.
 * Creates .gitignore if it doesn't exist.
 */
export function ensureGitignore(dir: string, entries: string[]): void {
  const gitignorePath = path.join(dir, ".gitignore");
  let content = "";

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
  }

  const lines = content.split("\n").map((l) => l.trim());
  const toAdd = entries.filter((e) => !lines.includes(e));

  if (toAdd.length === 0) return;

  // Add a psync section
  const section = [
    "",
    "# unisync (local lock files + dev config)",
    ...toAdd,
  ].join("\n");

  content = content.trimEnd() + "\n" + section + "\n";
  fs.writeFileSync(gitignorePath, content);
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    // Security Layer: Basic validation to prevent prototype pollution and ensure valid schema
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    // Validate specific fields if they exist
    const VALID_MANAGERS = ["npm", "yarn", "pnpm", "bun"];
    const p = parsed as Record<string, unknown>;
    
    if ("canonicalManager" in p && !VALID_MANAGERS.includes(p.canonicalManager as string)) {
      console.warn(`psync: invalid canonicalManager "${p.canonicalManager}" in ${filePath}`);
      return null;
    }

    if ("preferredManager" in p && !VALID_MANAGERS.includes(p.preferredManager as string)) {
      console.warn(`psync: invalid preferredManager "${p.preferredManager}" in ${filePath}`);
      return null;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
