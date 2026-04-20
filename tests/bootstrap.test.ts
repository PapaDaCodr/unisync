import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  autoBootstrap,
  detectManagerFromUserAgent,
  computeFingerprint,
} from "../src/bootstrap";
import { writeProjectConfig, readLocalConfig } from "../src/config";

describe("bootstrap", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "psync-bootstrap-"));
    execSync("git init -q", { cwd: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("detectManagerFromUserAgent", () => {
    it("parses npm user-agent", () => {
      assert.equal(
        detectManagerFromUserAgent("npm/10.0.0 node/v20.0.0 linux x64"),
        "npm",
      );
    });

    it("parses yarn user-agent", () => {
      assert.equal(
        detectManagerFromUserAgent("yarn/1.22.0 npm/? node/v18.0.0 linux x64"),
        "yarn",
      );
    });

    it("parses pnpm user-agent", () => {
      assert.equal(
        detectManagerFromUserAgent("pnpm/9.1.0 node/v20.11.0 linux x64"),
        "pnpm",
      );
    });

    it("parses bun user-agent", () => {
      assert.equal(
        detectManagerFromUserAgent("bun/1.1.0 node/v20.0.0 linux x64"),
        "bun",
      );
    });

    it("returns null for unknown agents", () => {
      assert.equal(detectManagerFromUserAgent("deno/1.0.0"), null);
    });

    it("returns null for missing user-agent", () => {
      assert.equal(detectManagerFromUserAgent(undefined), null);
      assert.equal(detectManagerFromUserAgent(""), null);
    });
  });

  describe("computeFingerprint", () => {
    it("is stable for identical inputs", () => {
      const a = computeFingerprint({
        projectConfigRaw: "{}",
        localConfigRaw: "",
        psyncVersion: "1.0.0",
      });
      const b = computeFingerprint({
        projectConfigRaw: "{}",
        localConfigRaw: "",
        psyncVersion: "1.0.0",
      });
      assert.equal(a, b);
    });

    it("changes when any input changes", () => {
      const base = computeFingerprint({
        projectConfigRaw: "{}",
        localConfigRaw: "",
        psyncVersion: "1.0.0",
      });
      const diffVersion = computeFingerprint({
        projectConfigRaw: "{}",
        localConfigRaw: "",
        psyncVersion: "1.0.1",
      });
      const diffLocal = computeFingerprint({
        projectConfigRaw: "{}",
        localConfigRaw: "{}",
        psyncVersion: "1.0.0",
      });
      assert.notEqual(base, diffVersion);
      assert.notEqual(base, diffLocal);
    });
  });

  describe("autoBootstrap", () => {
    it("skips silently when no project config exists", () => {
      const result = autoBootstrap(tmpDir, "1.0.0");
      assert.equal(result.status, "skipped-no-config");
      assert.equal(fs.existsSync(path.join(tmpDir, ".psync")), false);
    });

    it("bootstraps from npm_config_user_agent on first run", () => {
      writeProjectConfig(tmpDir, { canonicalManager: "npm" });
      const prev = process.env.npm_config_user_agent;
      process.env.npm_config_user_agent = "pnpm/9.0.0 node/v20 linux x64";
      try {
        const result = autoBootstrap(tmpDir, "1.0.0");
        assert.equal(result.status, "bootstrapped");
        assert.equal(result.detail, "pnpm");
        assert.deepEqual(readLocalConfig(tmpDir), { preferredManager: "pnpm" });
        assert.equal(
          fs.existsSync(path.join(tmpDir, ".psync", "bootstrap.hash")),
          true,
        );
      } finally {
        process.env.npm_config_user_agent = prev;
      }
    });

    it("short-circuits on second run when fingerprint matches", () => {
      writeProjectConfig(tmpDir, { canonicalManager: "npm" });
      process.env.npm_config_user_agent = "yarn/1.22 node/v20 linux x64";
      autoBootstrap(tmpDir, "1.0.0");
      const result = autoBootstrap(tmpDir, "1.0.0");
      assert.equal(result.status, "skipped-cached");
    });

    it("re-bootstraps when psync version changes", () => {
      writeProjectConfig(tmpDir, { canonicalManager: "npm" });
      process.env.npm_config_user_agent = "npm/10 node/v20 linux x64";
      autoBootstrap(tmpDir, "1.0.0");
      const result = autoBootstrap(tmpDir, "1.0.1");
      assert.equal(result.status, "bootstrapped");
    });

    it("falls back to canonical manager when user-agent is absent", () => {
      writeProjectConfig(tmpDir, { canonicalManager: "bun" });
      delete process.env.npm_config_user_agent;
      const result = autoBootstrap(tmpDir, "1.0.0");
      assert.equal(result.status, "bootstrapped");
      // No preferred manager detected, no local config written
      assert.equal(readLocalConfig(tmpDir), null);
    });
  });
});
