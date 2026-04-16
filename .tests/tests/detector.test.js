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
const detector_1 = require("../src/detector");
(0, node_test_1.describe)("detector", () => {
    let tmpDir;
    (0, node_test_1.beforeEach)(() => {
        tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "psync-test-"));
    });
    (0, node_test_1.afterEach)(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)("detects npm from package-lock.json", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "package-lock.json"), "{}");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "npm");
    });
    (0, node_test_1.it)("detects yarn from yarn.lock", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "yarn.lock"), "");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "yarn");
    });
    (0, node_test_1.it)("detects pnpm from pnpm-lock.yaml", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "pnpm-lock.yaml"), "");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "pnpm");
    });
    (0, node_test_1.it)("detects bun from bun.lockb", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "bun.lockb"), "");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "bun");
    });
    (0, node_test_1.it)("detects bun from bun.lock", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "bun.lock"), "");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "bun");
    });
    (0, node_test_1.it)("returns null when no lock file exists", () => {
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), null);
    });
    (0, node_test_1.it)("prioritizes yarn.lock over package-lock.json", () => {
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "yarn.lock"), "");
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "package-lock.json"), "{}");
        strict_1.default.equal((0, detector_1.detectManager)(tmpDir), "yarn");
    });
    (0, node_test_1.it)("walks up to parent directories", () => {
        // Create lock file in parent
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "yarn.lock"), "");
        const subDir = path_1.default.join(tmpDir, "packages", "sub");
        fs_1.default.mkdirSync(subDir, { recursive: true });
        strict_1.default.equal((0, detector_1.detectManager)(subDir), "yarn");
    });
    (0, node_test_1.describe)("listLockFiles", () => {
        (0, node_test_1.it)("lists all lock files in directory", () => {
            fs_1.default.writeFileSync(path_1.default.join(tmpDir, "yarn.lock"), "");
            fs_1.default.writeFileSync(path_1.default.join(tmpDir, "package-lock.json"), "{}");
            const locks = (0, detector_1.listLockFiles)(tmpDir);
            strict_1.default.equal(locks.length, 2);
            const managers = locks.map((l) => l.manager).sort();
            strict_1.default.deepEqual(managers, ["npm", "yarn"]);
        });
        (0, node_test_1.it)("returns empty array when no lock files", () => {
            strict_1.default.deepEqual((0, detector_1.listLockFiles)(tmpDir), []);
        });
    });
});
