"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLockFiles = exports.isManagerInstalled = exports.detectManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const LOCK_FILES = [
    { file: "yarn.lock", manager: "yarn" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "bun.lockb", manager: "bun" },
    { file: "bun.lock", manager: "bun" },
    { file: "package-lock.json", manager: "npm" },
];
/**
 * Walk up from `startDir` looking for a lock file or a package.json with a "packageManager" field.
 * Returns the first match — closest to the working directory wins.
 */
function detectManager(startDir = process.cwd()) {
    let dir = path_1.default.resolve(startDir);
    while (true) {
        // 1. Check for lock files (strongest signal)
        for (const entry of LOCK_FILES) {
            if (fs_1.default.existsSync(path_1.default.join(dir, entry.file))) {
                return entry.manager;
            }
        }
        // 2. Check package.json "packageManager" field
        const pkgPath = path_1.default.join(dir, "package.json");
        if (fs_1.default.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, "utf-8"));
                if (pkg.packageManager && typeof pkg.packageManager === "string") {
                    const [name] = pkg.packageManager.split("@");
                    if (["npm", "yarn", "pnpm", "bun"].includes(name)) {
                        return name;
                    }
                }
            }
            catch {
                // Ignore malformed package.json
            }
        }
        const parent = path_1.default.dirname(dir);
        if (parent === dir)
            break; // reached filesystem root
        dir = parent;
    }
    return null;
}
exports.detectManager = detectManager;
/**
 * Check if a package manager is installed on the system.
 */
async function isManagerInstalled(manager) {
    const cmd = process.platform === "win32" ? "where" : "command -v";
    try {
        (0, child_process_1.execSync)(`${cmd} ${manager}`, { stdio: "ignore" });
        return true;
    }
    catch {
        if (process.platform === "win32") {
            try {
                (0, child_process_1.execSync)(`where ${manager}.cmd`, { stdio: "ignore" });
                return true;
            }
            catch {
                return false;
            }
        }
        return false;
    }
}
exports.isManagerInstalled = isManagerInstalled;
/**
 * List every lock file found in `dir` (non-recursive, single level).
 */
function listLockFiles(dir = process.cwd()) {
    return LOCK_FILES.filter((entry) => fs_1.default.existsSync(path_1.default.join(dir, entry.file)));
}
exports.listLockFiles = listLockFiles;
