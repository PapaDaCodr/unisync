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
const resolver_1 = require("../src/lockfile/resolver");
(0, node_test_1.describe)("resolver", () => {
    let tmpDir;
    (0, node_test_1.beforeEach)(() => {
        tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), "psync-test-"));
        // Create root package.json
        fs_1.default.writeFileSync(path_1.default.join(tmpDir, "package.json"), JSON.stringify({
            name: "test-project",
            dependencies: { express: "4.21.0" },
            devDependencies: { typescript: "5.4.5" },
        }));
    });
    (0, node_test_1.afterEach)(() => {
        fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)("returns empty graph when no node_modules", () => {
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        strict_1.default.equal(graph.size, 0);
    });
    (0, node_test_1.it)("resolves a simple package", () => {
        createPkg(tmpDir, "express", {
            name: "express",
            version: "4.21.0",
            _resolved: "https://registry.npmjs.org/express/-/express-4.21.0.tgz",
            _integrity: "sha512-abc123",
        });
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        strict_1.default.equal(graph.size, 1);
        const pkg = graph.get("node_modules/express");
        strict_1.default.ok(pkg);
        strict_1.default.equal(pkg.name, "express");
        strict_1.default.equal(pkg.version, "4.21.0");
        strict_1.default.equal(pkg.resolved, "https://registry.npmjs.org/express/-/express-4.21.0.tgz");
        strict_1.default.equal(pkg.integrity, "sha512-abc123");
        strict_1.default.equal(pkg.dev, false);
    });
    (0, node_test_1.it)("marks devDependencies as dev: true", () => {
        createPkg(tmpDir, "typescript", {
            name: "typescript",
            version: "5.4.5",
        });
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        const pkg = graph.get("node_modules/typescript");
        strict_1.default.ok(pkg);
        strict_1.default.equal(pkg.dev, true);
    });
    (0, node_test_1.it)("handles scoped packages", () => {
        const scopeDir = path_1.default.join(tmpDir, "node_modules", "@types");
        fs_1.default.mkdirSync(scopeDir, { recursive: true });
        fs_1.default.mkdirSync(path_1.default.join(scopeDir, "node"));
        fs_1.default.writeFileSync(path_1.default.join(scopeDir, "node", "package.json"), JSON.stringify({ name: "@types/node", version: "20.14.0" }));
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        const pkg = graph.get("node_modules/@types/node");
        strict_1.default.ok(pkg);
        strict_1.default.equal(pkg.name, "@types/node");
        strict_1.default.equal(pkg.version, "20.14.0");
    });
    (0, node_test_1.it)("handles nested node_modules", () => {
        createPkg(tmpDir, "express", {
            name: "express",
            version: "4.21.0",
            dependencies: { accepts: "~1.3.8" },
        });
        // Nested: express/node_modules/accepts
        const nestedDir = path_1.default.join(tmpDir, "node_modules", "express", "node_modules", "accepts");
        fs_1.default.mkdirSync(nestedDir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(nestedDir, "package.json"), JSON.stringify({ name: "accepts", version: "1.3.8" }));
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        strict_1.default.ok(graph.has("node_modules/express"));
        strict_1.default.ok(graph.has("node_modules/express/node_modules/accepts"));
        const nested = graph.get("node_modules/express/node_modules/accepts");
        strict_1.default.equal(nested?.version, "1.3.8");
    });
    (0, node_test_1.it)("copies dependency fields from package.json", () => {
        createPkg(tmpDir, "express", {
            name: "express",
            version: "4.21.0",
            dependencies: { accepts: "~1.3.8" },
            engines: { node: ">=18" },
        });
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        const pkg = graph.get("node_modules/express");
        strict_1.default.ok(pkg);
        strict_1.default.deepEqual(pkg.dependencies, { accepts: "~1.3.8" });
        strict_1.default.deepEqual(pkg.engines, { node: ">=18" });
    });
    (0, node_test_1.it)("skips directories without package.json", () => {
        fs_1.default.mkdirSync(path_1.default.join(tmpDir, "node_modules", ".bin"), { recursive: true });
        fs_1.default.mkdirSync(path_1.default.join(tmpDir, "node_modules", "broken-pkg"), { recursive: true });
        // no package.json in broken-pkg
        const graph = (0, resolver_1.resolveFromNodeModules)(tmpDir);
        strict_1.default.equal(graph.size, 0);
    });
});
function createPkg(projectDir, name, pkgJson) {
    const pkgDir = path_1.default.join(projectDir, "node_modules", name);
    fs_1.default.mkdirSync(pkgDir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(pkgDir, "package.json"), JSON.stringify(pkgJson));
}
