import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  shouldUpgrade,
  versionDirName,
} from "./version.js";

test("compareVersions compares numeric parts", () => {
  assert.ok(compareVersions("0.1.2", "0.1.0") > 0);
  assert.ok(compareVersions("0.1.0", "0.1.2") < 0);
  assert.equal(compareVersions("0.1.2", "0.1.2"), 0);
  assert.ok(compareVersions("0.1.10", "0.1.2") > 0);
  assert.equal(compareVersions("v0.1.2", "0.1.2"), 0);
  assert.ok(compareVersions("0.2.0", "0.1.99") > 0);
});

test("versionDirName turns release tags into safe directory names", () => {
  assert.equal(versionDirName("v0.1.2"), "0.1.2");
  assert.equal(versionDirName("  V0.1.2  "), "0.1.2");
  assert.equal(versionDirName(""), "release");
  assert.equal(versionDirName("../0.1.2"), "0.1.2");
  assert.ok(!versionDirName("a/b").includes("/"));
});

test("shouldUpgrade only accepts a newer, parseable release", () => {
  assert.equal(shouldUpgrade("0.1.0", "v0.1.2"), true);
  assert.equal(shouldUpgrade("0.1.0", "v0.1.10"), true);
  assert.equal(shouldUpgrade("0.1.2", "v0.1.2"), false);
  assert.equal(shouldUpgrade("0.1.3", "v0.1.2"), false);
  assert.equal(shouldUpgrade("0.1.10", "v0.1.2"), false);
  assert.equal(shouldUpgrade("0.1.0", ""), false);
  assert.equal(shouldUpgrade("0.1.0", "release"), false);
});
