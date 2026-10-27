#!/usr/bin/env node

// Sets the project version everywhere it is written, so a release is one command:
//
//   npm run version:set -- 1.2.3
//
// It updates the package files, the manifest, the content script, the popup and both READMEs
// (badge and "current version" line), and adds an empty entry to both changelogs when there is
// none yet. The two entries are prose, so they still have to be written; tests/version.test.mjs
// fails while a placeholder is left in either.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHANGELOG_PLACEHOLDER = "_TODO: describe this release._";
const SEMVER = /^\d+\.\d+\.\d+$/;

export async function setVersion(root, version) {
  if (!SEMVER.test(version)) {
    throw new Error(`"${version}" is not a version like 1.2.3.`);
  }

  const changed = [];
  const edit = async (relative, transform) => {
    const file = path.join(root, relative);
    const text = await fs.readFile(file, "utf8");
    const next = transform(text);

    if (next !== text) {
      await fs.writeFile(file, next, "utf8");
      changed.push(relative);
    }
  };
  const editJson = (relative, mutate) => edit(relative, (text) => {
    const data = JSON.parse(text);
    mutate(data);
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  const replaceOnce = (relative, pattern, replacement) => edit(relative, (text) => {
    if (!pattern.test(text)) throw new Error(`${relative}: could not find where the version is written.`);
    return text.replace(pattern, replacement);
  });

  await editJson("package.json", (data) => { data.version = version; });
  await editJson("renderer/package.json", (data) => { data.version = version; });
  await editJson("extension/manifest.json", (data) => { data.version = version; });
  await editJson("package-lock.json", (data) => {
    data.version = version;
    if (data.packages?.[""]) data.packages[""].version = version;
  });

  await replaceOnce("extension/content/index.js", /(EXPORTER_VERSION = ")[^"]+(")/, `$1${version}$2`);
  await replaceOnce("extension/popup/popup.html", /(<h1>Convo Vault <span[^>]*>v)\d+\.\d+\.\d+(<\/span>)/, `$1${version}$2`);

  await replaceOnce("README.md", /(img\.shields\.io\/badge\/version-)\d+\.\d+\.\d+(-)/, `$1${version}$2`);
  await replaceOnce("README.md", /(Current version: `)\d+\.\d+\.\d+(`)/, `$1${version}$2`);
  await replaceOnce("README.zh-CN.md", /(img\.shields\.io\/badge\/version-)\d+\.\d+\.\d+(-)/, `$1${version}$2`);
  await replaceOnce("README.zh-CN.md", /(当前版本：`)\d+\.\d+\.\d+(`)/, `$1${version}$2`);

  for (const changelog of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    await edit(changelog, (text) => {
      if (new RegExp(`^## ${version.replaceAll(".", "\\.")}$`, "m").test(text)) return text;
      const firstEntry = text.search(/^## /m);
      if (firstEntry < 0) throw new Error(`${changelog}: no "## " entry to put the new one before.`);
      return `${text.slice(0, firstEntry)}## ${version}\n\n${CHANGELOG_PLACEHOLDER}\n\n${text.slice(firstEntry)}`;
    });
  }

  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];

  if (!version) {
    console.error("Usage: npm run version:set -- <major.minor.patch>");
    process.exit(1);
  }

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  try {
    const changed = await setVersion(root, version);
    console.log(changed.length ? `Version ${version} written to:\n${changed.map((file) => `  ${file}`).join("\n")}` : `Everything already says ${version}.`);
    console.log("\nStill to do by hand: write the entry for this version in CHANGELOG.md and CHANGELOG.zh-CN.md.");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
