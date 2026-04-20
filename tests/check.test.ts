import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { checkLockFile, syncLockFile } from "../src/sync";

describe("checkLockFile (non-mutating)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psync-check-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedProject(pkg: object): void {
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(pkg, null, 2));
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });
  }

  it("reports packageJsonWouldChange when versions are unpinned", () => {
    seedProject({
      name: "demo",
      version: "1.0.0",
      dependencies: { foo: "^1.2.3" },
    });
    const result = checkLockFile(tmpDir, "npm");
    assert.equal(result.packageJsonWouldChange, true);
  });

  it("reports packageJsonWouldChange=false when versions are already pinned", () => {
    seedProject({
      name: "demo",
      version: "1.0.0",
      dependencies: { foo: "1.2.3" },
    });
    const result = checkLockFile(tmpDir, "npm");
    assert.equal(result.packageJsonWouldChange, false);
  });

  it("leaves package.json on disk unchanged even when it would pin", () => {
    const original = JSON.stringify(
      { name: "demo", version: "1.0.0", dependencies: { foo: "^1.2.3" } },
      null,
      2,
    );
    fs.writeFileSync(path.join(tmpDir, "package.json"), original);
    fs.mkdirSync(path.join(tmpDir, "node_modules"), { recursive: true });

    checkLockFile(tmpDir, "npm");

    const afterCheck = fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8");
    assert.equal(afterCheck, original);
  });

  it("leaves a non-existent lock file absent", () => {
    seedProject({ name: "demo", version: "1.0.0" });
    checkLockFile(tmpDir, "npm");
    assert.equal(fs.existsSync(path.join(tmpDir, "package-lock.json")), false);
  });

  it("reports lockFileWouldChange=false once sync has been run", () => {
    seedProject({ name: "demo", version: "1.0.0", dependencies: { foo: "1.2.3" } });
    syncLockFile(tmpDir, "npm");
    const result = checkLockFile(tmpDir, "npm");
    assert.equal(result.lockFileWouldChange, false);
    assert.equal(result.packageJsonWouldChange, false);
  });

  it("reports lockFileWouldChange=true after tampering with the lock file", () => {
    seedProject({ name: "demo", version: "1.0.0", dependencies: { foo: "1.2.3" } });
    syncLockFile(tmpDir, "npm");
    fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "tampered");
    const result = checkLockFile(tmpDir, "npm");
    assert.equal(result.lockFileWouldChange, true);
    assert.equal(result.existingContent, "tampered");
  });
});
