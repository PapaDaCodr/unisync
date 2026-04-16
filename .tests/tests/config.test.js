"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const config_1 = require("../src/config");
(0, node_test_1.describe)("config", () => {
    let tmpDir;
    (0, node_test_1.beforeEach)(() => {
        tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "psync-test-"));
    });
    (0, node_test_1.afterEach)(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    (0, node_test_1.describe)("project config", () => {
        (0, node_test_1.it)("writes and reads project config", () => {
            (0, config_1.writeProjectConfig)(tmpDir, { canonicalManager: "yarn" });
            const config = (0, config_1.readProjectConfig)(tmpDir);
            strict_1.default.deepEqual(config, { canonicalManager: "yarn" });
        });
        (0, node_test_1.it)("returns null when no config exists", () => {
            strict_1.default.equal((0, config_1.readProjectConfig)(tmpDir), null);
        });
        (0, node_test_1.it)("returns null for invalid JSON", () => {
            fs_1.default.writeFileSync(path_1.default.join(tmpDir, ".psyncrc.json"), "not json");
            strict_1.default.equal((0, config_1.readProjectConfig)(tmpDir), null);
        });
    });
    (0, node_test_1.describe)("local config", () => {
        (0, node_test_1.it)("writes and reads local config", () => {
            (0, config_1.writeLocalConfig)(tmpDir, { preferredManager: "bun" });
            const config = (0, config_1.readLocalConfig)(tmpDir);
            strict_1.default.deepEqual(config, { preferredManager: "bun" });
        });
        (0, node_test_1.it)("returns null when no config exists", () => {
            strict_1.default.equal((0, config_1.readLocalConfig)(tmpDir), null);
        });
    });
    (0, node_test_1.describe)("ensureGitignore", () => {
        (0, node_test_1.it)("creates .gitignore with entries if it doesn't exist", () => {
            (0, config_1.ensureGitignore)(tmpDir, ["package-lock.json", ".psyncrc.local.json"]);
            const content = fs_1.default.readFileSync(path_1.default.join(tmpDir, ".gitignore"), "utf-8");
            strict_1.default.ok(content.includes("package-lock.json"));
            strict_1.default.ok(content.includes(".psyncrc.local.json"));
        });
        (0, node_test_1.it)("appends entries to existing .gitignore", () => {
            fs_1.default.writeFileSync(path_1.default.join(tmpDir, ".gitignore"), "node_modules\n");
            (0, config_1.ensureGitignore)(tmpDir, ["package-lock.json"]);
            const content = fs_1.default.readFileSync(path_1.default.join(tmpDir, ".gitignore"), "utf-8");
            strict_1.default.ok(content.includes("node_modules"));
            strict_1.default.ok(content.includes("package-lock.json"));
        });
        (0, node_test_1.it)("does not duplicate existing entries", () => {
            fs_1.default.writeFileSync(path_1.default.join(tmpDir, ".gitignore"), "node_modules\npackage-lock.json\n");
            (0, config_1.ensureGitignore)(tmpDir, ["package-lock.json"]);
            const content = fs_1.default.readFileSync(path_1.default.join(tmpDir, ".gitignore"), "utf-8");
            const matches = content.match(/package-lock\.json/g);
            strict_1.default.equal(matches?.length, 1);
        });
    });
});
