// Pure platform policy for the panel launcher.
//
// Magpie treats every export of the plugin entry as another plugin factory, so
// this module is separate and has no I/O. Everything here is a function of the
// platform name, CPU architecture, and environment passed in, which keeps the
// matrix testable on any host.

import os from "node:os";
import path from "node:path";

// Stable asset names published by the release workflow. The plugin selects one
// of these; the versioned Debian names are patterns, not downloaded by the
// plugin.
export const ASSETS = Object.freeze({
  windowsZip: "magpie-panel-windows-amd64.zip",
  macosDmg: "magpie-panel-macos-universal.dmg",
  macosZip: "magpie-panel-macos-universal.zip",
  linuxAmd64: "magpie-panel-linux-amd64.tar.gz",
  linuxArm64: "magpie-panel-linux-arm64.tar.gz",
  debAmd64: "magpie-panel_<version>_amd64.deb",
  debArm64: "magpie-panel_<version>_arm64.deb",
  installSh: "magpie-panel-install.sh",
  sums: "SHA256SUMS",
});

const MAGPIE_PANEL_APP = "Magpie Panel.app";
const MACOS_INNER_BINARY = "Magpie Panel";

function pathFor(platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

// Maps a Node platform/arch pair to the release asset and payload it needs.
// An unsupported pair returns null; callers report unsupported-platform.
export function targetFor(platform, arch) {
  if (platform === "win32" && arch === "x64") {
    return Object.freeze({
      os: "windows",
      platform,
      arch,
      kind: "zip",
      asset: ASSETS.windowsZip,
      binaryName: "magpie-panel.exe",
    });
  }
  if (platform === "darwin" && (arch === "x64" || arch === "arm64")) {
    return Object.freeze({
      os: "macos",
      platform,
      arch,
      kind: "app",
      asset: ASSETS.macosZip,
      binaryName: MACOS_INNER_BINARY,
    });
  }
  if (platform === "linux" && (arch === "x64" || arch === "arm64")) {
    return Object.freeze({
      os: "linux",
      platform,
      arch,
      kind: "tar.gz",
      asset: arch === "x64" ? ASSETS.linuxAmd64 : ASSETS.linuxArm64,
      binaryName: "magpie-panel",
    });
  }
  return null;
}

// The per-user data directory. Windows uses %APPDATA%, macOS Application
// Support, and Linux the XDG config directory.
export function dataDir(platform, env = process.env, home = os.homedir()) {
  const p = pathFor(platform);
  let base = "";
  if (platform === "win32") {
    base = env.APPDATA || (home ? p.join(home, "AppData", "Roaming") : "");
  } else if (platform === "darwin") {
    base = home ? p.join(home, "Library", "Application Support") : "";
  } else {
    const xdg = typeof env.XDG_CONFIG_HOME === "string" ? env.XDG_CONFIG_HOME : "";
    base = xdg && p.isAbsolute(xdg) ? xdg : home ? p.join(home, ".config") : "";
  }
  if (!base) {
    const error = new Error(
      `no data directory for ${platform}: set APPDATA/XDG_CONFIG_HOME or HOME`,
    );
    error.code = "no-config-dir";
    throw error;
  }
  return p.join(base, "MagpiePanel");
}

// Manual install locations, in the order the launcher prefers them. Windows
// keeps the NSIS spellings; macOS checks the app bundles; Linux follows the
// install.sh and deb layouts.
export function installerCandidates(
  platform,
  env = process.env,
  home = os.homedir(),
) {
  const p = pathFor(platform);
  if (platform === "win32") {
    const base =
      env.LOCALAPPDATA || (home ? p.join(home, "AppData", "Local") : "");
    if (!base) return [];
    const programs = p.join(base, "Programs");
    return [
      p.join(programs, "Magpie Panel", "Magpie Panel.exe"),
      p.join(programs, "Magpie-Panel", "Magpie-Panel.exe"),
      p.join(programs, "MagpiePanel", "MagpiePanel.exe"),
      p.join(programs, "magpie-panel", "magpie-panel.exe"),
    ];
  }
  if (platform === "darwin") {
    const candidates = [
      p.join("/Applications", MAGPIE_PANEL_APP, "Contents", "MacOS", MACOS_INNER_BINARY),
    ];
    if (home) {
      candidates.push(
        p.join(home, "Applications", MAGPIE_PANEL_APP, "Contents", "MacOS", MACOS_INNER_BINARY),
      );
    }
    return candidates;
  }
  if (platform !== "linux") return [];
  const candidates = [];
  if (home) {
    candidates.push(
      p.join(home, ".local", "magpie-panel.app", "magpie-panel"),
      p.join(home, ".local", "bin", "magpie-panel"),
    );
  }
  candidates.push(
    p.join("/opt", "magpie-panel", "magpie-panel"),
    p.join("/usr", "local", "bin", "magpie-panel"),
    p.join("/usr", "bin", "magpie-panel"),
  );
  return candidates;
}

// The executable of a downloaded version inside <binRoot>/<version>/.
export function versionBinary(binRoot, version, platform) {
  const p = pathFor(platform);
  if (platform === "win32") {
    return p.join(binRoot, version, "magpie-panel.exe");
  }
  if (platform === "darwin") {
    return p.join(binRoot, version, MAGPIE_PANEL_APP, "Contents", "MacOS", MACOS_INNER_BINARY);
  }
  return p.join(binRoot, version, "magpie-panel");
}

// Returns the .app bundle for a macOS inner binary or app path, and "" for
// anything else. Forward slashes are used because macOS paths are POSIX.
export function appBundleOf(pathname) {
  const value = String(pathname || "").trim();
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  const inner = normalized.match(/^(.*\.app)\/Contents\/MacOS\/[^/]+$/);
  if (inner) return inner[1];
  if (/\.app$/.test(normalized)) return normalized;
  return "";
}
