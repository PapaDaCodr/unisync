import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { installHooks } from "../src/hooks";
import { writeProjectConfig, readProjectConfig } from "../src/config";

describe("enforce mode", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psync-enforce-"));
    execSync("git init -q", { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a warn-mode pre-commit script by default", () => {
    installHooks(tmpDir, "npm");
    const hook = fs.readFileSync(path.join(tmpDir, ".git/hooks/pre-commit"), "utf-8");
    assert.match(hook, /enforce=warn/);
    assert.match(hook, /sync --check/);
    assert.doesNotMatch(hook, /sync --stage/);
  });

  it("writes a block-mode pre-commit script when enforce=block", () => {
    installHooks(tmpDir, "npm", "npm", "block");
    const hook = fs.readFileSync(path.join(tmpDir, ".git/hooks/pre-commit"), "utf-8");
    assert.match(hook, /enforce=block/);
    assert.match(hook, /sync --stage/);
    assert.doesNotMatch(hook, /sync --check/);
  });

  it("warn-mode script does not exit non-zero on drift", () => {
    installHooks(tmpDir, "npm", "npm", "warn");
    const hook = fs.readFileSync(path.join(tmpDir, ".git/hooks/pre-commit"), "utf-8");
    // The warn script reports via echo; it must never contain `exit 1`
    assert.doesNotMatch(hook, /exit\s+1/);
  });

  it("persists enforce mode in project config", () => {
    writeProjectConfig(tmpDir, { canonicalManager: "yarn", enforce: "block" });
    const read = readProjectConfig(tmpDir);
    assert.deepEqual(read, { canonicalManager: "yarn", enforce: "block" });
  });

  it("rejects invalid enforce values", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".psyncrc.json"),
      JSON.stringify({ canonicalManager: "npm", enforce: "loud" }),
    );
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      assert.equal(readProjectConfig(tmpDir), null);
    } finally {
      console.warn = origWarn;
    }
  });
});
