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
const pinner_1 = require("../src/pinner");
(0, node_test_1.describe)("pinner", () => {
    let tmpDir;
    (0, node_test_1.beforeEach)(() => {
        tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "psync-test-"));
    });
    (0, node_test_1.afterEach)(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)("strips ^ from dependency versions", () => {
        writePkg(tmpDir, {
            dependencies: { express: "^4.21.0", lodash: "^4.17.21" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, true);
        const pkg = readPkg(tmpDir);
        strict_1.default.equal(pkg.dependencies.express, "4.21.0");
        strict_1.default.equal(pkg.dependencies.lodash, "4.17.21");
    });
    (0, node_test_1.it)("strips ~ from dependency versions", () => {
        writePkg(tmpDir, {
            dependencies: { express: "~4.21.0" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, true);
        strict_1.default.equal(readPkg(tmpDir).dependencies.express, "4.21.0");
    });
    (0, node_test_1.it)("strips >= from dependency versions", () => {
        writePkg(tmpDir, {
            dependencies: { express: ">=4.21.0" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, true);
        strict_1.default.equal(readPkg(tmpDir).dependencies.express, "4.21.0");
    });
    (0, node_test_1.it)("handles devDependencies and optionalDependencies", () => {
        writePkg(tmpDir, {
            devDependencies: { typescript: "^5.4.5" },
            optionalDependencies: { fsevents: "~2.3.3" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, true);
        const pkg = readPkg(tmpDir);
        strict_1.default.equal(pkg.devDependencies.typescript, "5.4.5");
        strict_1.default.equal(pkg.optionalDependencies.fsevents, "2.3.3");
    });
    (0, node_test_1.it)("does not touch already-pinned versions", () => {
        writePkg(tmpDir, {
            dependencies: { express: "4.21.0" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, false);
        strict_1.default.equal(readPkg(tmpDir).dependencies.express, "4.21.0");
    });
    (0, node_test_1.it)("does not touch workspace: / file: / link: specifiers", () => {
        writePkg(tmpDir, {
            dependencies: {
                a: "workspace:*",
                b: "file:../local-pkg",
                c: "link:../linked-pkg",
            },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, false);
        const pkg = readPkg(tmpDir);
        strict_1.default.equal(pkg.dependencies.a, "workspace:*");
        strict_1.default.equal(pkg.dependencies.b, "file:../local-pkg");
        strict_1.default.equal(pkg.dependencies.c, "link:../linked-pkg");
    });
    (0, node_test_1.it)("does not touch * or latest", () => {
        writePkg(tmpDir, {
            dependencies: { a: "*", b: "latest" },
        });
        const changed = (0, pinner_1.pinVersions)(tmpDir);
        strict_1.default.equal(changed, false);
    });
    (0, node_test_1.it)("preserves original JSON indentation", () => {
        // Write with 4-space indent
        const content = JSON.stringify({ dependencies: { express: "^4.21.0" } }, null, 4);
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "package.json"), content + "\n");
        (0, pinner_1.pinVersions)(tmpDir);
        const raw = fs_1.default.readFileSync(path_1.default.join(tmpDir, "package.json"), "utf-8");
        // Should preserve 4-space indent
        strict_1.default.ok(raw.includes('    "express"'));
    });
});
function writePkg(dir, pkg) {
    fs_1.default.writeFileSync(path_1.default.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
}
function readPkg(dir) {
    return JSON.parse(fs_1.default.readFileSync(path_1.default.join(dir, "package.json"), "utf-8"));
}
