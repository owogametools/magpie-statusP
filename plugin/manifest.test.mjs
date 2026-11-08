// Guards the two manifests that ship this plugin:
//
//   package.json         repository root, installed by `magpie plugin add github:...`
//   plugin/package.json  canonical npm package, installed by `magpie plugin add ./plugin`
//
// Bun only installs a repository root, so the root manifest mirrors the plugin
// one and points into plugin/. Magpie reads `magpie.icon` (a data URI) for the
// Settings -> Plugins row and `magpie.page.icon` (a file) for the page tab.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..");

const pluginManifest = JSON.parse(
  readFileSync(path.join(pluginDir, "package.json"), "utf8"),
);
const rootManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);

const iconFile = path.join(pluginDir, "page", "icon.svg");
const iconBytes = readFileSync(iconFile);

// Magpie rejects icons larger than 1.5 MB (`internal/plugin/market.go`).
const ICON_LIMIT = 3 << 19;
const ICON_PREFIX = "data:image/svg+xml;base64,";

function decodeIconDataUri(uri) {
  assert.ok(
    uri.startsWith(ICON_PREFIX),
    `expected a base64 SVG data URI, got ${uri.slice(0, 40)}`,
  );
  return Buffer.from(uri.slice(ICON_PREFIX.length), "base64");
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

test("root and plugin manifests share package identity", () => {
  for (const field of ["name", "version", "description", "type", "license"]) {
    assert.equal(
      rootManifest[field],
      pluginManifest[field],
      `${field} differs between package.json and plugin/package.json`,
    );
  }
});

test("plugin source version matches the package manifest", () => {
  const source = readFileSync(path.join(pluginDir, "index.js"), "utf8");
  const match = source.match(/const PLUGIN_VERSION = "([^"]+)";/);
  assert.ok(match, "plugin/index.js has no PLUGIN_VERSION literal");
  assert.equal(
    match[1],
    pluginManifest.version,
    "PLUGIN_VERSION drifted from plugin/package.json",
  );
});

test("both manifests ship the version helper", () => {
  assert.ok(
    (rootManifest.files || []).includes("plugin/version.js"),
    "root package.json files must include plugin/version.js",
  );
  assert.ok(
    (pluginManifest.files || []).includes("version.js"),
    "plugin/package.json files must include version.js",
  );
});

test("both manifests ship the platform helper", () => {
  assert.ok(
    (rootManifest.files || []).includes("plugin/platform.js"),
    "root package.json files must include plugin/platform.js",
  );
  assert.ok(
    (pluginManifest.files || []).includes("platform.js"),
    "plugin/package.json files must include platform.js",
  );
});

test("the app version matches the plugin version", () => {
  const config = readFileSync(
    path.join(repoRoot, "app", "mygo.config.ts"),
    "utf8",
  );
  const match = config.match(/^[ \t]*version:[ \t]*"([^"]+)"/m);
  assert.ok(match, "app/mygo.config.ts has no version literal");
  assert.equal(
    match[1],
    pluginManifest.version,
    "app/mygo.config.ts version drifted from plugin/package.json",
  );
});

// Magpie's GitHub card reads these from the package's own manifest.
test("discovery metadata fits Magpie's card rules", () => {
  for (const [label, manifest] of [
    ["package.json", rootManifest],
    ["plugin/package.json", pluginManifest],
  ]) {
    const name = manifest.magpie?.name;
    assert.equal(typeof name, "string", `${label} has no magpie.name`);
    assert.ok(name.trim().length > 0, `${label} magpie.name is empty`);
    assert.ok(!/[\r\n]/.test(name), `${label} magpie.name must be one line`);
    assert.ok(
      Buffer.byteLength(name, "utf8") <= 80,
      `${label} magpie.name is over 80 bytes`,
    );

    const summary = manifest.magpie?.summary;
    assert.ok(
      summary && typeof summary === "object",
      `${label} has no magpie.summary`,
    );
    for (const lang of ["en", "zh"]) {
      const value = summary[lang];
      assert.equal(
        typeof value,
        "string",
        `${label} magpie.summary.${lang} is missing`,
      );
      assert.ok(
        !/[\r\n]/.test(value),
        `${label} magpie.summary.${lang} must be one line`,
      );
      assert.ok(
        Buffer.byteLength(value, "utf8") <= 300,
        `${label} magpie.summary.${lang} is over 300 bytes`,
      );
    }
  }
});

test("entry points resolve to the shipped server file", () => {
  const cases = [
    ["package.json", rootManifest, repoRoot, "plugin/index.js"],
    ["plugin/package.json", pluginManifest, pluginDir, "index.js"],
  ];
  for (const [label, manifest, base, entry] of cases) {
    assert.equal(typeof manifest.main, "string", `${label} main must be a path`);
    assert.ok(
      manifest.exports && typeof manifest.exports === "object",
      `${label} exports must be an object`,
    );
    assert.deepEqual(
      Object.keys(manifest.exports).sort(),
      [".", "./server"],
      `${label} exports must define . and ./server`,
    );
    for (const target of [manifest.main, ...Object.values(manifest.exports)]) {
      assert.equal(typeof target, "string", `${label} every entry must be a path`);
      assert.equal(
        path.posix.normalize(target),
        entry,
        `${label} entry ${target} must resolve to ${entry}`,
      );
      assert.ok(
        existsSync(path.join(base, ...target.split("/"))),
        `${label} entry ${target} does not exist`,
      );
    }
  }
});

test("page paths are the plugin paths prefixed with plugin/", () => {
  const rootPage = rootManifest.magpie?.page ?? {};
  const pluginPage = pluginManifest.magpie?.page ?? {};

  assert.equal(pluginPage.file, "page/index.html");
  assert.equal(pluginPage.icon, "page/icon.svg");
  assert.equal(rootPage.file, "plugin/page/index.html");
  assert.equal(rootPage.icon, "plugin/page/icon.svg");

  for (const [manifest, base] of [
    [rootManifest, repoRoot],
    [pluginManifest, pluginDir],
  ]) {
    const pageFile = path.join(base, manifest.magpie.page.file);
    assert.ok(existsSync(pageFile), `page file not found: ${pageFile}`);
    assert.ok(
      isInside(path.join(pluginDir, "page"), pageFile),
      `page file must live in plugin/page: ${manifest.magpie.page.file}`,
    );

    const pageIcon = path.join(base, manifest.magpie.page.icon);
    assert.ok(existsSync(pageIcon), `page icon not found: ${pageIcon}`);
    assert.ok(
      isInside(path.join(pluginDir, "page"), pageIcon),
      `page icon must live in plugin/page: ${manifest.magpie.page.icon}`,
    );
  }
});

test("every magpie field matches except the plugin/ page prefix", () => {
  const mirrored = structuredClone(rootManifest.magpie);
  mirrored.page.file = mirrored.page.file.slice("plugin/".length);
  mirrored.page.icon = mirrored.page.icon.slice("plugin/".length);

  assert.deepEqual(
    mirrored,
    pluginManifest.magpie,
    "root magpie metadata drifted from plugin/package.json",
  );
});

test("top-level magpie.icon is a Magpie-acceptable SVG data URI", () => {
  for (const [label, manifest] of [
    ["package.json", rootManifest],
    ["plugin/package.json", pluginManifest],
  ]) {
    const uri = manifest.magpie?.icon;
    assert.equal(typeof uri, "string", `${label} has no top-level magpie.icon`);
    assert.match(uri, /^(https:\/\/|data:image\/)/);
    assert.ok(
      uri.length < ICON_LIMIT,
      `${label} magpie.icon is ${uri.length} bytes, over the 1.5 MB limit`,
    );
    assert.deepEqual(
      decodeIconDataUri(uri),
      iconBytes,
      `${label} magpie.icon does not decode to plugin/page/icon.svg`,
    );
  }
});
