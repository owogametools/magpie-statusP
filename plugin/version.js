// Pure version helpers for the panel launcher.
//
// Kept out of index.js because Magpie treats every export of the plugin entry
// as another plugin factory. This module has no I/O so it can be tested alone.

function comparableName(value) {
  return String(value).trim().replace(/^v/i, "");
}

export function versionParts(name) {
  const match = String(name).match(/\d+(?:[.-]\d+)*/);
  return match
    ? match[0].split(/[.-]/).map((part) => Number.parseInt(part, 10))
    : null;
}

// Positive when a is newer, negative when b is, 0 when they tie. A leading
// "v" is ignored; numeric parts compare as numbers, not strings.
export function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (pa && pb) {
    const length = Math.max(pa.length, pb.length);
    for (let i = 0; i < length; i += 1) {
      const delta = (pa[i] || 0) - (pb[i] || 0);
      if (delta !== 0) return delta;
    }
  } else if (pa) {
    return 1;
  } else if (pb) {
    return -1;
  }
  return comparableName(a).localeCompare(comparableName(b));
}

export function versionDirName(tag) {
  const raw = String(tag || "").trim().replace(/^v/i, "");
  let clean = raw
    .replace(/[^0-9A-Za-z._-]+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "");
  if (!clean || clean === "." || clean === "..") clean = "release";
  return clean.slice(0, 64);
}

// True only when the release tag names a version newer than the local one.
// An empty or unparseable tag never triggers a download.
export function shouldUpgrade(currentVersion, releaseTag) {
  const next = versionDirName(releaseTag);
  return versionParts(next) !== null && compareVersions(next, currentVersion) > 0;
}
