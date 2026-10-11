// @vitest-environment node
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyRuntimeNodeModules } from "../../scripts/copy-runtime-node-modules.mjs";

describe("copyRuntimeNodeModules", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function writePackage(
    root: string,
    name: string,
    dependencies: Record<string, string> = {},
  ) {
    const dir = join(root, ...name.split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name, dependencies }),
    );
  }

  it("copies a package and its production dependency closure", () => {
    const src = mkdtempSync(join(tmpdir(), "runtime-src-"));
    const dest = mkdtempSync(join(tmpdir(), "runtime-dest-"));
    dirs.push(src, dest);
    writePackage(src, "mysql2", {
      "sql-string": "1.0.0",
      "@scope/helper": "1.0.0",
    });
    writePackage(src, "sql-string");
    writePackage(src, "@scope/helper", { "leaf-dep": "1.0.0" });
    writePackage(src, "leaf-dep");
    writePackage(src, "unused");

    const copied = copyRuntimeNodeModules(src, dest, ["mysql2"]);

    expect(copied.sort()).toEqual(
      ["@scope/helper", "leaf-dep", "mysql2", "sql-string"].sort(),
    );
    expect(
      JSON.parse(readFileSync(join(dest, "mysql2", "package.json"), "utf8"))
        .name,
    ).toBe("mysql2");
    expect(
      JSON.parse(
        readFileSync(join(dest, "@scope", "helper", "package.json"), "utf8"),
      ).name,
    ).toBe("@scope/helper");
    expect(() =>
      readFileSync(join(dest, "unused", "package.json"), "utf8"),
    ).toThrow();
  });

  it("fails when a requested package is missing", () => {
    const src = mkdtempSync(join(tmpdir(), "runtime-src-"));
    const dest = mkdtempSync(join(tmpdir(), "runtime-dest-"));
    dirs.push(src, dest);

    expect(() => copyRuntimeNodeModules(src, dest, ["mysql2"])).toThrow(
      /mysql2/,
    );
  });
});
