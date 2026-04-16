"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGitignore = exports.writeLocalConfig = exports.readLocalConfig = exports.writeProjectConfig = exports.readProjectConfig = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const PROJECT_CONFIG = ".psyncrc.json";
const LOCAL_CONFIG = ".psyncrc.local.json";
function readProjectConfig(dir = process.cwd()) {
    return readJson(path_1.default.join(dir, PROJECT_CONFIG));
}
exports.readProjectConfig = readProjectConfig;
function writeProjectConfig(dir, config) {
    writeJson(path_1.default.join(dir, PROJECT_CONFIG), config);
}
exports.writeProjectConfig = writeProjectConfig;
function readLocalConfig(dir = process.cwd()) {
    return readJson(path_1.default.join(dir, LOCAL_CONFIG));
}
exports.readLocalConfig = readLocalConfig;
function writeLocalConfig(dir, config) {
    writeJson(path_1.default.join(dir, LOCAL_CONFIG), config);
}
exports.writeLocalConfig = writeLocalConfig;
/**
 * Ensure .gitignore contains the given entries.
 * Creates .gitignore if it doesn't exist.
 */
function ensureGitignore(dir, entries) {
    const gitignorePath = path_1.default.join(dir, ".gitignore");
    let content = "";
    if (fs_1.default.existsSync(gitignorePath)) {
        content = fs_1.default.readFileSync(gitignorePath, "utf-8");
    }
    const lines = content.split("\n").map((l) => l.trim());
    const toAdd = entries.filter((e) => !lines.includes(e));
    if (toAdd.length === 0)
        return;
    // Add a psync section
    const section = [
        "",
        "# unisync (local lock files + dev config)",
        ...toAdd,
    ].join("\n");
    content = content.trimEnd() + "\n" + section + "\n";
    fs_1.default.writeFileSync(gitignorePath, content);
}
exports.ensureGitignore = ensureGitignore;
function readJson(filePath) {
    if (!fs_1.default.existsSync(filePath))
        return null;
    try {
        const content = fs_1.default.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        // Security Layer: Basic validation to prevent prototype pollution and ensure valid schema
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        // Validate specific fields if they exist
        const VALID_MANAGERS = ["npm", "yarn", "pnpm", "bun"];
        const p = parsed;
        if ("canonicalManager" in p && !VALID_MANAGERS.includes(p.canonicalManager)) {
            console.warn(`psync: invalid canonicalManager "${p.canonicalManager}" in ${filePath}`);
            return null;
        }
        if ("preferredManager" in p && !VALID_MANAGERS.includes(p.preferredManager)) {
            console.warn(`psync: invalid preferredManager "${p.preferredManager}" in ${filePath}`);
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function writeJson(filePath, data) {
    fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
