#!/usr/bin/env node
/**
 * Copy the production dependency closure of one or more packages from a
 * flat npm node_modules tree into another node_modules directory.
 *
 * Usage:
 *   node scripts/copy-runtime-node-modules.mjs \
 *     <srcNodeModules> <destNodeModules> <pkg> [pkg...]
 *
 * The Docker image uses this to ship mysql2 next to static-server without
 * copying the frontend's entire node_modules tree.
 */

import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string} srcNodeModules
 * @param {string} destNodeModules
 * @param {readonly string[]} packageNames
 * @returns {string[]} package names copied, including transitive dependencies
 */
export function copyRuntimeNodeModules(
  srcNodeModules,
  destNodeModules,
  packageNames,
) {
  const queue = [...packageNames];
  const copied = [];
  const seen = new Set();

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const srcDir = join(srcNodeModules, ...name.split("/"));
    const manifestPath = join(srcDir, "package.json");
    if (!existsSync(manifestPath)) {
      throw new Error(
        `runtime package "${name}" not found in ${srcNodeModules}`,
      );
    }

    const destDir = join(destNodeModules, ...name.split("/"));
    mkdirSync(dirname(destDir), { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copied.push(name);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    queue.push(...Object.keys(manifest.dependencies ?? {}));
  }

  return copied;
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const [src, dest, ...pkgs] = process.argv.slice(2);
  if (!src || !dest || pkgs.length === 0) {
    console.error(
      "Usage: node scripts/copy-runtime-node-modules.mjs <srcNodeModules> <destNodeModules> <pkg> [pkg...]",
    );
    process.exit(1);
  }
  const copied = copyRuntimeNodeModules(src, dest, pkgs);
  console.log(`Copied ${copied.length} packages into ${dest}`);
}
