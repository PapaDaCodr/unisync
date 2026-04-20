import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PackageManager } from "./detector";
import { readProjectConfig, writeLocalConfig, readLocalConfig } from "./config";
import { installHooks } from "./hooks";

const BOOTSTRAP_DIR = ".psync";
const BOOTSTRAP_HASH = "bootstrap.hash";

const VALID_MANAGERS: PackageManager[] = ["npm", "yarn", "pnpm", "bun"];

/**
 * Parse the package manager from npm_config_user_agent.
 * npm/yarn/pnpm/bun all set this to "<name>/<version> node/<v> <platform> <arch>".
 */
export function detectManagerFromUserAgent(
  userAgent: string | undefined,
): PackageManager | null {
  if (!userAgent) return null;
  const first = userAgent.split(" ")[0];
  const name = first.split("/")[0];
  return (VALID_MANAGERS as string[]).includes(name)
    ? (name as PackageManager)
    : null;
}

/**
 * Compute a stable fingerprint of the inputs that determine bootstrap state.
 * Used to short-circuit on repeat invocations.
 */
export function computeFingerprint(inputs: {
  projectConfigRaw: string;
  localConfigRaw: string;
  psyncVersion: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(inputs.projectConfigRaw)
    .update("\0")
    .update(inputs.localConfigRaw)
    .update("\0")
    .update(inputs.psyncVersion)
    .digest("hex");
}

function readIfExists(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export interface AutoBootstrapResult {
  status: "skipped-no-config" | "skipped-cached" | "bootstrapped" | "error";
  detail?: string;
}

/**
 * Run on every install (via preinstall script). Must:
 *  - Exit 0 silently if no .psyncrc.json
 *  - Exit 0 instantly if fingerprint unchanged
 *  - Detect manager from user-agent and persist local preference
 *  - Install git hooks
 *  - Never throw to the caller
 */
export function autoBootstrap(cwd: string, psyncVersion: string): AutoBootstrapResult {
  const projectConfig = readProjectConfig(cwd);
  if (!projectConfig) {
    return { status: "skipped-no-config" };
  }

  const projectRaw = readIfExists(path.join(cwd, ".psyncrc.json"));
  const localRaw = readIfExists(path.join(cwd, ".psyncrc.local.json"));
  const fingerprint = computeFingerprint({
    projectConfigRaw: projectRaw,
    localConfigRaw: localRaw,
    psyncVersion,
  });

  const hashPath = path.join(cwd, BOOTSTRAP_DIR, BOOTSTRAP_HASH);
  if (fs.existsSync(hashPath)) {
    const cached = readIfExists(hashPath).trim();
    if (cached === fingerprint) {
      return { status: "skipped-cached" };
    }
  }

  const detected = detectManagerFromUserAgent(process.env.npm_config_user_agent);
  const existingLocal = readLocalConfig(cwd);

  if (detected && existingLocal?.preferredManager !== detected) {
    writeLocalConfig(cwd, { preferredManager: detected });
  }

  const preferred =
    detected ?? existingLocal?.preferredManager ?? projectConfig.canonicalManager;

  try {
    installHooks(cwd, projectConfig.canonicalManager, preferred);
  } catch (err) {
    return { status: "error", detail: (err as Error).message };
  }

  const bootstrapDir = path.join(cwd, BOOTSTRAP_DIR);
  if (!fs.existsSync(bootstrapDir)) {
    fs.mkdirSync(bootstrapDir, { recursive: true });
  }
  const newProjectRaw = readIfExists(path.join(cwd, ".psyncrc.json"));
  const newLocalRaw = readIfExists(path.join(cwd, ".psyncrc.local.json"));
  const newFingerprint = computeFingerprint({
    projectConfigRaw: newProjectRaw,
    localConfigRaw: newLocalRaw,
    psyncVersion,
  });
  fs.writeFileSync(hashPath, newFingerprint + "\n");

  return { status: "bootstrapped", detail: preferred };
}
