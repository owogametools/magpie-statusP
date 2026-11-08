// Magpie Panel's plugin half.
//
// The floating panel is a separate desktop app. This host entry makes sure a
// binary exists (a hand-picked path, a manual install, an earlier download, or
// the latest GitHub release for this OS and CPU) and starts it detached, so the
// panel outlives Magpie. The page is a sandboxed iframe with no network access;
// it can only show status and read/write this plugin's options.
//
// Every export is treated as another plugin factory, so only the default
// export leaves this module. Helpers stay module-private.

import { execFile, spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compareVersions, shouldUpgrade, versionDirName } from "./version.js";
import {
  ASSETS,
  appBundleOf,
  dataDir,
  installerCandidates,
  targetFor,
  versionBinary,
} from "./platform.js";

const PLUGIN_ID = "magpie-panel";
const PLUGIN_VERSION = "0.2.0";
const USER_AGENT = `magpie-panel-plugin/${PLUGIN_VERSION}`;
const REPO = "owogametools/magpie-statusP";
const RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const SUMS_ASSET = ASSETS.sums;
const RELEASE_TTL_MS = 10 * 60 * 1000;
const RELEASE_TIMEOUT_MS = 8 * 1000;
const DOWNLOAD_TIMEOUT_MS = 120 * 1000;
// A launchAt older than this is a stale option value, not a click: options
// survive host reloads, so without a window every later reload would launch.
const LAUNCH_REQUEST_MS = 2 * 60 * 1000;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const MAX_SCAN_ENTRIES = 20000;

const DEFAULT_OPTIONS = Object.freeze({
  binaryPath: "",
  autoLaunch: true,
});

const execFileAsync = promisify(execFile);

let releaseCache = null;
let releaseInFlight = null;
let bootstrapInFlight = null;
let lastLaunchedAt = 0;

class PanelError extends Error {
  constructor(code, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PanelError";
    this.code = code;
  }
}

function binRoot() {
  let base;
  try {
    base = dataDir(process.platform);
  } catch (error) {
    throw new PanelError(
      "no-config-dir",
      error && error.message ? error.message : String(error),
      error,
    );
  }
  return path.join(base, "bin");
}

function makeLogger(input) {
  const client = input && input.client ? input.client : null;
  const appLog =
    client && client.app && typeof client.app.log === "function"
      ? client.app.log.bind(client.app)
      : null;
  return (level, message) => {
    const text = String(message);
    if (appLog) {
      try {
        const pending = appLog({
          body: { service: PLUGIN_ID, level, message: text },
        });
        if (pending && typeof pending.catch === "function") {
          pending.catch(() => {});
        }
        return;
      } catch {
        // Fall through to the console; the host sends it to Magpie's log.
      }
    }
    const line = `[${PLUGIN_ID}] ${text}`;
    if (level === "error") console.error(line);
    else console.log(line);
  };
}

function normalizeOptions(raw) {
  return {
    ...DEFAULT_OPTIONS,
    ...(raw && typeof raw === "object" ? raw : {}),
  };
}

// binaryPath is user input: only an absolute, non-traversing path is used.
// Windows still requires an .exe; macOS and Linux accept a plain file (macOS
// also accepts a .app, resolved by resolveOverride).
function binaryOverride(raw, platform) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (value.includes("\0")) {
    throw new PanelError("binary-path-invalid", "binaryPath contains a NUL byte");
  }
  if (value.split(/[\\/]+/).includes("..")) {
    throw new PanelError(
      "binary-path-invalid",
      `binaryPath must not contain "..": ${value}`,
    );
  }
  if (!path.isAbsolute(value)) {
    throw new PanelError(
      "binary-path-invalid",
      `binaryPath must be an absolute path: ${value}`,
    );
  }
  if (platform === "win32" && path.extname(value).toLowerCase() !== ".exe") {
    throw new PanelError(
      "binary-path-invalid",
      `binaryPath must name a .exe on Windows: ${value}`,
    );
  }
  return value;
}

// Strips trailing separators so ".../Magpie Panel.app/" is still a bundle, but
// keeps roots such as "C:\" or "/" intact.
function trimTrailingSeparators(value) {
  const trimmed = value.replace(/[\\/]+$/, "");
  if (!trimmed) return value;
  if (/^[A-Za-z]:$/.test(trimmed)) return value;
  return trimmed;
}

async function isFile(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function pathExists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function requireFile(file, what) {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    throw new PanelError("binary-missing", `${what} not found: ${file}`);
  }
  if (!stat.isFile()) {
    throw new PanelError("binary-missing", `${what} is not a file: ${file}`);
  }
  return file;
}

// Resolves binaryPath for the running platform: a macOS .app is expanded to
// its Contents/MacOS executable, and any other position must be a file.
async function resolveOverride(raw, target) {
  const value = binaryOverride(raw, target.platform);
  if (!value) return null;
  const candidate = trimTrailingSeparators(value);

  if (target.os === "macos" && /\.app$/i.test(candidate)) {
    const inner = path.join(candidate, "Contents", "MacOS", target.binaryName);
    await requireFile(inner, "binaryPath");
    return { path: inner, appPath: candidate, version: null, source: "override" };
  }

  await requireFile(candidate, "binaryPath");
  return {
    path: candidate,
    appPath: appBundleOf(candidate) || undefined,
    version: null,
    source: "override",
  };
}

async function installedVersions(target) {
  let root;
  try {
    root = binRoot();
  } catch {
    return [];
  }
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw new PanelError(
      "bin-read",
      `cannot read ${root}: ${error.message}`,
      error,
    );
  }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const binary = versionBinary(root, entry.name, target.platform);
    if (await isFile(binary)) {
      found.push({
        version: entry.name,
        path: binary,
        appPath: appBundleOf(binary) || undefined,
      });
    }
  }
  found.sort((a, b) => compareVersions(b.version, a.version));
  return found;
}

function httpsUrl(raw, what) {
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new PanelError("bad-url", `${what}: invalid URL`, error);
  }
  if (url.protocol !== "https:") {
    throw new PanelError(
      "bad-url",
      `${what}: refusing ${url.protocol} URL (HTTPS only)`,
    );
  }
  return url;
}

async function latestRelease(log) {
  const now = Date.now();
  if (releaseCache && now - releaseCache.at < RELEASE_TTL_MS) {
    log("debug", `using cached release ${releaseCache.release.tag_name || "?"}`);
    return releaseCache.release;
  }
  if (releaseInFlight) return releaseInFlight;

  releaseInFlight = (async () => {
    let response;
    try {
      response = await fetch(RELEASE_URL, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": USER_AGENT,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(RELEASE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PanelError(
        "offline",
        `could not reach GitHub for ${REPO}'s latest release (offline or blocked): ${error.message}`,
        error,
      );
    }
    if (!response.ok) {
      throw new PanelError(
        "release-http",
        `GitHub returned HTTP ${response.status} for ${REPO}'s latest release`,
      );
    }
    let release;
    try {
      release = await response.json();
    } catch (error) {
      throw new PanelError(
        "release-json",
        `GitHub's latest release JSON could not be read: ${error.message}`,
        error,
      );
    }
    if (!release || typeof release !== "object") {
      throw new PanelError(
        "release-json",
        "GitHub's latest release response was not an object",
      );
    }
    releaseCache = { at: Date.now(), release };
    return release;
  })().finally(() => {
    releaseInFlight = null;
  });

  return releaseInFlight;
}

function releaseAsset(release, names) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  for (const name of names) {
    const asset = assets.find((item) => item && item.name === name);
    if (!asset) continue;
    if (typeof asset.browser_download_url !== "string") {
      throw new PanelError(
        "missing-asset",
        `release ${release.tag_name || "?"} has ${name} but no browser download URL`,
      );
    }
    return {
      name,
      url: asset.browser_download_url,
      size: Number(asset.size) || 0,
    };
  }
  const tag = release && release.tag_name ? ` ${release.tag_name}` : "";
  throw new PanelError(
    "missing-asset",
    `release${tag} has no ${names.join(" or ")} asset`,
  );
}

async function download(url, destination, what, log) {
  httpsUrl(url, what);
  log("info", `downloading ${what}`);
  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PanelError(
      "offline",
      `${what}: download failed (offline or blocked): ${error.message}`,
      error,
    );
  }
  if (!response.ok) {
    throw new PanelError("download-http", `${what}: HTTP ${response.status}`);
  }
  if (response.url) httpsUrl(response.url, what);

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_DOWNLOAD_BYTES) {
    throw new PanelError(
      "download-too-large",
      `${what}: ${declared} bytes exceeds ${MAX_DOWNLOAD_BYTES}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new PanelError(
      "download-too-large",
      `${what}: ${buffer.length} bytes exceeds ${MAX_DOWNLOAD_BYTES}`,
    );
  }
  await fs.writeFile(destination, buffer);
  return buffer;
}

// SHA256SUMS lines are "<hex>  <name>" or "<hex> *<name>", with names that
// may carry a directory. The archive's own name is what we look for.
function sumFor(text, fileName) {
  const wanted = String(fileName).split(/[\\/]/).pop().toLowerCase();
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (!match) continue;
    const listed = match[2].trim().split(/[\\/]/).pop().toLowerCase();
    if (listed === wanted) return match[1].toLowerCase();
  }
  return "";
}

function hashMatches(expectedHex, actualHex) {
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function powerShellQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function extractZip(zipPath, destination, log) {
  let tarMessage = "";
  try {
    // Windows 11 ships bsdtar as tar.exe; it reads zip archives.
    await execFileAsync("tar.exe", ["-xf", zipPath, "-C", destination], {
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return;
  } catch (error) {
    tarMessage = error && error.message ? error.message : String(error);
    log("debug", `tar.exe could not extract the zip: ${tarMessage}`);
  }

  const script =
    "$ErrorActionPreference = 'Stop'; " +
    `Expand-Archive -LiteralPath ${powerShellQuote(zipPath)} ` +
    `-DestinationPath ${powerShellQuote(destination)} -Force`;
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (error) {
    const psMessage = error && error.message ? error.message : String(error);
    throw new PanelError(
      "extract-failed",
      `could not extract ${path.basename(zipPath)}: tar.exe failed (${tarMessage}); PowerShell failed (${psMessage})`,
      error,
    );
  }
}

// `ditto` preserves the app bundle and its ad-hoc signature; `unzip` is a
// fallback for hosts without it.
async function extractMacZip(zipPath, destination, log) {
  let dittoMessage = "";
  try {
    await execFileAsync("ditto", ["-x", "-k", zipPath, destination], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return;
  } catch (error) {
    dittoMessage = error && error.message ? error.message : String(error);
    log("debug", `ditto could not extract the zip: ${dittoMessage}`);
  }

  try {
    await execFileAsync("unzip", ["-q", zipPath, "-d", destination], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const unzipMessage = error && error.message ? error.message : String(error);
    throw new PanelError(
      "extract-failed",
      `could not extract ${path.basename(zipPath)}: ditto failed (${dittoMessage}); unzip failed (${unzipMessage})`,
      error,
    );
  }
}

async function extractTarGz(archivePath, destination, log) {
  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", destination], {
      timeout: 180000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    log("debug", `tar could not extract ${path.basename(archivePath)}: ${message}`);
    throw new PanelError(
      "extract-failed",
      `could not extract ${path.basename(archivePath)}: tar failed (${message})`,
      error,
    );
  }
}

function extractArchive(archivePath, destination, target, log) {
  if (target.kind === "tar.gz") {
    return extractTarGz(archivePath, destination, log);
  }
  if (target.os === "macos") {
    return extractMacZip(archivePath, destination, log);
  }
  return extractZip(archivePath, destination, log);
}

// Breadth-first, so a top-level magpie-panel.exe wins over a nested copy.
async function findWindowsExe(root) {
  const queue = [root];
  let fallback = "";
  let seen = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen > MAX_SCAN_ENTRIES) return fallback;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower === "magpie-panel.exe") return full;
      if (!fallback && lower === "magpie panel.exe") fallback = full;
    }
  }
  return fallback;
}

// Breadth-first search for an exact file name. Linux archives are flat, but a
// single top-level directory is tolerated.
async function findNamedFile(root, name) {
  const queue = [root];
  let seen = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen > MAX_SCAN_ENTRIES) return "";
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === name) return full;
    }
  }
  return "";
}

async function macAppPayload(appPath, binaryName) {
  const macosDir = path.join(appPath, "Contents", "MacOS");
  const expected = path.join(macosDir, binaryName);
  if (await isFile(expected)) return { path: expected, appPath };

  let entries;
  try {
    entries = await fs.readdir(macosDir, { withFileTypes: true });
  } catch {
    return null;
  }
  let fallback = "";
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(macosDir, entry.name);
    if (!(await isFile(full))) continue;
    if (!fallback) fallback = full;
    try {
      const stat = await fs.stat(full);
      if ((stat.mode & 0o111) !== 0) return { path: full, appPath };
    } catch {
      // Keep the first regular file as the fallback.
    }
  }
  return fallback ? { path: fallback, appPath } : null;
}

// Breadth-first, so the shallowest .app bundle wins.
async function findMacApp(root, binaryName) {
  const queue = [root];
  let seen = 0;
  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (seen > MAX_SCAN_ENTRIES) return null;
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.toLowerCase().endsWith(".app")) {
        const payload = await macAppPayload(full, binaryName);
        if (payload) return payload;
        continue;
      }
      queue.push(full);
    }
  }
  return null;
}

async function findPayload(extractDir, target) {
  if (target.os === "windows") {
    const exe = await findWindowsExe(extractDir);
    return exe ? { path: exe } : null;
  }
  if (target.os === "macos") {
    return findMacApp(extractDir, target.binaryName);
  }
  const binary = await findNamedFile(extractDir, target.binaryName);
  return binary ? { path: binary } : null;
}

function insideDir(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function payloadExpectation(target) {
  if (target.os === "windows") {
    return { code: "missing-exe", label: "magpie-panel.exe" };
  }
  if (target.os === "macos") {
    return {
      code: "missing-app",
      label: `Magpie Panel.app/Contents/MacOS/${target.binaryName}`,
    };
  }
  return { code: "missing-binary", label: "magpie-panel" };
}

function downloadedBinary(root, version, target) {
  const binaryPath = versionBinary(root, version, target.platform);
  return {
    path: binaryPath,
    appPath: appBundleOf(binaryPath) || undefined,
    version,
    source: "download",
  };
}

async function downloadLatest(target, log) {
  const release = await latestRelease(log);
  const version = versionDirName(release.tag_name);
  const root = binRoot();
  const finalDir = path.join(root, version);
  const expectedFinal = versionBinary(root, version, target.platform);
  const expectation = payloadExpectation(target);

  if (await isFile(expectedFinal)) {
    log("info", `release ${version} is already downloaded`);
    return downloadedBinary(root, version, target);
  }

  const archiveAsset = releaseAsset(release, [target.asset]);
  const sumsAsset = releaseAsset(release, [SUMS_ASSET, `${SUMS_ASSET}.txt`]);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "magpie-panel-"));
  let staging = "";
  try {
    const archivePath = path.join(tempDir, target.asset);
    const sumsPath = path.join(tempDir, sumsAsset.name);

    const archiveBuffer = await download(
      archiveAsset.url,
      archivePath,
      target.asset,
      log,
    );
    const sumsBuffer = await download(
      sumsAsset.url,
      sumsPath,
      sumsAsset.name,
      log,
    );

    const expected = sumFor(sumsBuffer.toString("utf8"), target.asset);
    if (!expected) {
      throw new PanelError(
        "sha-missing",
        `${sumsAsset.name} in release ${version} has no SHA256 line for ${target.asset}`,
      );
    }
    const actual = createHash("sha256").update(archiveBuffer).digest("hex");
    if (!hashMatches(expected, actual)) {
      throw new PanelError(
        "sha-mismatch",
        `SHA256 mismatch for ${target.asset} in release ${version}: expected ${expected}, got ${actual}`,
      );
    }
    log("info", `SHA256 verified for ${target.asset} (${version})`);

    // Extract straight into a staging directory on the same volume as bin/;
    // preserving the archive's modes is why the tree is moved, not copied.
    await fs.mkdir(root, { recursive: true });
    staging = path.join(
      root,
      `.staging-${process.pid}-${Date.now().toString(36)}`,
    );
    try {
      await fs.rm(staging, { recursive: true, force: true });
      await fs.mkdir(staging, { recursive: false });
      await extractArchive(archivePath, staging, target, log);

      let payload = await findPayload(staging, target);
      if (!payload) {
        throw new PanelError(
          expectation.code,
          `${target.asset} in release ${version} contains no ${expectation.label}`,
        );
      }
      if (!insideDir(staging, payload.path)) {
        throw new PanelError(
          expectation.code,
          `${target.asset} in release ${version} extracted ${expectation.label} outside the staging directory`,
        );
      }
      if (target.os === "windows") {
        // findWindowsExe also accepts mygo's "Magpie Panel.exe". The installed
        // layout and the post-rename check use the release's stable name.
        const wanted = path.join(staging, "magpie-panel.exe");
        if (payload.path.toLowerCase() !== wanted.toLowerCase()) {
          await fs.rename(payload.path, wanted);
          payload = { ...payload, path: wanted };
        }
      }
      if (target.os === "linux") {
        // CI should preserve the mode, but a tar made on Windows may not.
        await fs.chmod(payload.path, 0o755).catch(() => {});
      }

      try {
        if (await pathExists(finalDir)) {
          if (await isFile(expectedFinal)) {
            // Another load installed this version while we downloaded.
            return downloadedBinary(root, version, target);
          }
          // A half-written directory from an interrupted earlier attempt.
          await fs.rm(finalDir, { recursive: true, force: true });
        }
        // Same volume as bin/, so this is the atomic step. Older version
        // directories are left alone, which is the rollback path.
        await fs.rename(staging, finalDir);
      } catch (error) {
        if (await isFile(expectedFinal)) {
          return downloadedBinary(root, version, target);
        }
        throw new PanelError(
          "install-failed",
          `could not install release ${version} into ${finalDir}: ${error.message}`,
          error,
        );
      }
    } finally {
      // A successful rename moved this path away; force ignores its absence.
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }

    // Staging paths are stale after the rename; recompute from the version.
    if (!(await isFile(expectedFinal))) {
      throw new PanelError(
        expectation.code,
        `release ${version} was extracted but ${expectedFinal} is missing`,
      );
    }
    const binary = downloadedBinary(root, version, target);
    log("info", `installed Magpie Panel ${version} at ${binary.path}`);
    return binary;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensureBinary(rawOptions, log) {
  const options = normalizeOptions(rawOptions);
  const target = targetFor(process.platform, process.arch);
  if (!target) {
    throw new PanelError(
      "unsupported-platform",
      `Magpie Panel has no build for ${process.platform}/${process.arch}`,
    );
  }

  const override = await resolveOverride(options.binaryPath, target);
  if (override) {
    log("info", `using binaryPath override: ${override.path}`);
    return override;
  }

  for (const candidate of installerCandidates(process.platform)) {
    if (await isFile(candidate)) {
      log("info", `using installed Magpie Panel: ${candidate}`);
      return {
        path: candidate,
        appPath: appBundleOf(candidate) || undefined,
        version: null,
        source: "installer",
      };
    }
  }

  const installed = await installedVersions(target);
  if (installed.length > 0) {
    const current = installed[0];
    let release;
    try {
      release = await latestRelease(log);
    } catch (error) {
      log(
        "warn",
        `could not check for a newer release; using ${current.version}: ${
          error && error.message ? error.message : String(error)
        }`,
      );
      return { ...current, source: "download" };
    }

    if (!shouldUpgrade(current.version, release && release.tag_name)) {
      log("info", `downloaded Magpie Panel ${current.version} is up to date`);
      return { ...current, source: "download" };
    }

    const next = versionDirName(release.tag_name);
    log("info", `upgrading Magpie Panel ${current.version} -> ${next}`);
    try {
      return await downloadLatest(target, log);
    } catch (error) {
      log(
        "warn",
        `upgrade to ${next} failed; using ${current.version}: ${
          error && error.message ? error.message : String(error)
        }`,
      );
      return { ...current, source: "download" };
    }
  }

  return downloadLatest(target, log);
}

function launchRequest(options, now) {
  if (options.autoLaunch !== false) return "autoLaunch";
  const launchedAt = Number(options.launchAt);
  if (
    Number.isFinite(launchedAt) &&
    launchedAt > 0 &&
    Math.abs(now - launchedAt) <= LAUNCH_REQUEST_MS
  ) {
    return "launchAt";
  }
  return "";
}

// spawn() reports a missing or unlaunchable file through an "error" event,
// not a throw, so wait for either that or "spawn". On macOS an app bundle is
// handed to LaunchServices with `open`, which exits once the app starts.
function launch(binary, log) {
  const appPath =
    binary && typeof binary.appPath === "string" ? binary.appPath : "";
  const useOpen = process.platform === "darwin" && Boolean(appPath);
  const command = useOpen ? "open" : binary && binary.path;
  const args = useOpen ? [appPath] : [];

  if (typeof command !== "string" || !command) {
    return Promise.reject(
      new PanelError("launch-failed", "there is no binary path to launch"),
    );
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (error) {
      reject(
        new PanelError(
          "launch-failed",
          `could not launch ${command}: ${error.message}`,
          error,
        ),
      );
      return;
    }

    let settled = false;
    let timer = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      try {
        child.unref();
      } catch {
        // Already gone; nothing to detach.
      }
      if (useOpen) {
        log("info", `opened ${appPath}`);
      } else {
        log("info", `detached Magpie Panel (pid ${child.pid || "unknown"})`);
      }
      resolve(child.pid || 0);
    };

    child.once("error", (error) => {
      finish(
        new PanelError(
          "launch-failed",
          `could not launch ${command}: ${error.message}`,
          error,
        ),
      );
    });
    child.once("spawn", () => finish(null));
    // Bun versions that do not emit "spawn" still get a detached process.
    timer = setTimeout(() => finish(null), 250);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
}

async function bootstrap(input, rawOptions, log) {
  const options = normalizeOptions(rawOptions);
  const reason = launchRequest(options, Date.now());
  if (!reason) {
    log("info", "auto-launch is off; waiting for the page to ask for a launch");
    return;
  }

  const binary = await ensureBinary(options, log);
  const now = Date.now();
  if (now - lastLaunchedAt < 2000) {
    log("debug", "a launch happened moments ago; not launching twice");
    return;
  }
  lastLaunchedAt = now;
  await launch(binary, log);
  const version = binary.version ? ` ${binary.version}` : "";
  log("info", `Magpie Panel${version} is running (${reason})`);
}

export default {
  id: "magpie-panel",
  async server(input, options) {
    const log = makeLogger(input);
    const opts = normalizeOptions(options);
    log(
      "debug",
      `host loaded (autoLaunch=${opts.autoLaunch !== false}, binaryPath=${opts.binaryPath ? "override" : "auto"})`,
    );
    // Never block the factory: Magpie is loading its host, and a download
    // may take a while. The app enforces a single instance, so a repeated
    // launch (every host restart, every Magpie start) is harmless.
    if (!bootstrapInFlight) {
      bootstrapInFlight = bootstrap(input, opts, log)
        .catch((error) => {
          log(
            "error",
            `startup failed [${error && error.code ? error.code : "error"}]: ${
              error && error.message ? error.message : String(error)
            }`,
          );
        })
        .finally(() => {
          bootstrapInFlight = null;
        });
    }
    return {};
  },
};
