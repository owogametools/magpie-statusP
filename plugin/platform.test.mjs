// Unit tests for the pure platform policy. They must pass on any host: every
// function takes the platform name explicitly, so no real filesystem or OS
// lookup happens here.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ASSETS,
  appBundleOf,
  dataDir,
  installerCandidates,
  targetFor,
  versionBinary,
} from "./platform.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..");

test("supported platforms map to the right asset and payload", () => {
  const cases = [
    ["win32", "x64", "windows", ASSETS.windowsZip, "magpie-panel.exe"],
    ["darwin", "x64", "macos", ASSETS.macosZip, "Magpie Panel"],
    ["darwin", "arm64", "macos", ASSETS.macosZip, "Magpie Panel"],
    ["linux", "x64", "linux", ASSETS.linuxAmd64, "magpie-panel"],
    ["linux", "arm64", "linux", ASSETS.linuxArm64, "magpie-panel"],
  ];
  for (const [platform, arch, os, asset, binaryName] of cases) {
    const target = targetFor(platform, arch);
    assert.ok(target, `${platform}/${arch} must be supported`);
    assert.equal(target.os, os);
    assert.equal(target.asset, asset);
    assert.equal(target.binaryName, binaryName);
    assert.ok(Object.isFrozen(target), "targets must be immutable");
  }
});

test("unsupported platforms return null", () => {
  for (const [platform, arch] of [
    ["win32", "ia32"],
    ["win32", "arm64"],
    ["darwin", "arm"],
    ["linux", "ppc64"],
    ["freebsd", "x64"],
  ]) {
    assert.equal(
      targetFor(platform, arch),
      null,
      `${platform}/${arch} must be unsupported`,
    );
  }
});

test("data directories follow the per-OS convention", () => {
  assert.equal(
    dataDir("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u"),
    "C:\\Users\\u\\AppData\\Roaming\\MagpiePanel",
  );
  assert.equal(
    dataDir("win32", {}, "C:\\Users\\u"),
    "C:\\Users\\u\\AppData\\Roaming\\MagpiePanel",
  );
  assert.equal(
    dataDir("darwin", {}, "/Users/u"),
    "/Users/u/Library/Application Support/MagpiePanel",
  );
  assert.equal(
    dataDir("linux", { XDG_CONFIG_HOME: "/home/u/.config-alt" }, "/home/u"),
    "/home/u/.config-alt/MagpiePanel",
  );
  assert.equal(
    dataDir("linux", {}, "/home/u"),
    "/home/u/.config/MagpiePanel",
  );
  // A relative XDG_CONFIG_HOME is not a valid base; fall back to ~/.config.
  assert.equal(
    dataDir("linux", { XDG_CONFIG_HOME: "relative/config" }, "/home/u"),
    "/home/u/.config/MagpiePanel",
  );
  assert.throws(
    () => dataDir("linux", {}, ""),
    (error) => error && error.code === "no-config-dir",
  );
});

test("installer candidates follow each platform's install layouts", () => {
  assert.deepEqual(
    installerCandidates(
      "win32",
      { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
      "C:\\Users\\u",
    ),
    [
      "C:\\Users\\u\\AppData\\Local\\Programs\\Magpie Panel\\Magpie Panel.exe",
      "C:\\Users\\u\\AppData\\Local\\Programs\\Magpie-Panel\\Magpie-Panel.exe",
      "C:\\Users\\u\\AppData\\Local\\Programs\\MagpiePanel\\MagpiePanel.exe",
      "C:\\Users\\u\\AppData\\Local\\Programs\\magpie-panel\\magpie-panel.exe",
    ],
  );
  assert.deepEqual(installerCandidates("darwin", {}, "/Users/u"), [
    "/Applications/Magpie Panel.app/Contents/MacOS/Magpie Panel",
    "/Users/u/Applications/Magpie Panel.app/Contents/MacOS/Magpie Panel",
  ]);
  assert.deepEqual(installerCandidates("linux", {}, "/home/u"), [
    "/home/u/.local/magpie-panel.app/magpie-panel",
    "/home/u/.local/bin/magpie-panel",
    "/opt/magpie-panel/magpie-panel",
    "/usr/local/bin/magpie-panel",
    "/usr/bin/magpie-panel",
  ]);
  // Absolute system locations do not depend on a home directory.
  assert.deepEqual(installerCandidates("linux", {}, ""), [
    "/opt/magpie-panel/magpie-panel",
    "/usr/local/bin/magpie-panel",
    "/usr/bin/magpie-panel",
  ]);
  assert.deepEqual(installerCandidates("darwin", {}, ""), [
    "/Applications/Magpie Panel.app/Contents/MacOS/Magpie Panel",
  ]);
});

test("versionBinary resolves the payload of a downloaded version", () => {
  assert.equal(
    versionBinary("C:\\Users\\u\\AppData\\Roaming\\MagpiePanel\\bin", "0.2.0", "win32"),
    "C:\\Users\\u\\AppData\\Roaming\\MagpiePanel\\bin\\0.2.0\\magpie-panel.exe",
  );
  assert.equal(
    versionBinary("/Users/u/Library/Application Support/MagpiePanel/bin", "0.2.0", "darwin"),
    "/Users/u/Library/Application Support/MagpiePanel/bin/0.2.0/Magpie Panel.app/Contents/MacOS/Magpie Panel",
  );
  assert.equal(
    versionBinary("/home/u/.config/MagpiePanel/bin", "0.2.0", "linux"),
    "/home/u/.config/MagpiePanel/bin/0.2.0/magpie-panel",
  );
});

test("appBundleOf derives the .app bundle", () => {
  assert.equal(
    appBundleOf("/Applications/Magpie Panel.app/Contents/MacOS/Magpie Panel"),
    "/Applications/Magpie Panel.app",
  );
  assert.equal(
    appBundleOf("/Applications/Magpie Panel.app"),
    "/Applications/Magpie Panel.app",
  );
  assert.equal(
    appBundleOf("/Applications/Magpie Panel.app/"),
    "/Applications/Magpie Panel.app",
  );
  assert.equal(appBundleOf("/usr/bin/magpie-panel"), "");
  assert.equal(appBundleOf("C:\\Tools\\panel.exe"), "");
  assert.equal(appBundleOf(""), "");
});

// Drift guard: the plugin and the release workflow must agree on asset names.
// `publish-public.yml` removes `.github/public-workflows` from the public
// snapshot, so the workflow lives in one of two places.
test("release workflow produces every asset the plugin selects", () => {
  const workflowPath = [
    path.join(repoRoot, ".github", "public-workflows", "release.yml"),
    path.join(repoRoot, ".github", "workflows", "release.yml"),
  ].find((candidate) => existsSync(candidate));
  assert.ok(workflowPath, "release workflow not found");
  const workflow = readFileSync(workflowPath, "utf8");

  for (const name of [
    ASSETS.windowsZip,
    ASSETS.macosDmg,
    ASSETS.macosZip,
    ASSETS.linuxAmd64,
    ASSETS.linuxArm64,
    ASSETS.installSh,
    ASSETS.sums,
  ]) {
    assert.ok(
      workflow.includes(name),
      `release workflow does not mention ${name}`,
    );
  }
  assert.ok(workflow.includes("magpie-panel_"), "release workflow must copy the .deb files");
  assert.ok(workflow.includes("_amd64.deb"), "release workflow must publish the amd64 .deb");
  assert.ok(workflow.includes("_arm64.deb"), "release workflow must publish the arm64 .deb");

  assert.ok(
    workflow.includes("darwin/universal"),
    "release workflow must build darwin/universal",
  );
  assert.ok(
    workflow.includes("linux/amd64,linux/arm64"),
    "release workflow must build both Linux architectures",
  );
});
