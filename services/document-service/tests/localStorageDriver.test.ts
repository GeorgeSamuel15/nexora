import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageDriver } from "../src/storage/localStorageDriver.js";
import { StorageKeyNotFoundError } from "../src/storage/storageDriver.js";

/**
 * Unlike every other test file in this build, this one was actually
 * executed during development (via `tsx`, against a real temp directory)
 * rather than only type-checked - LocalStorageDriver has zero external
 * dependencies (only node:fs/promises and node:path), so it doesn't need
 * `pnpm install` to run. See services/document-service/README.md for the
 * exact commands and what running it proved.
 */

let baseDir: string;
let driver: LocalStorageDriver;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "nexora-storage-test-"));
  driver = new LocalStorageDriver(baseDir);
});

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

describe("LocalStorageDriver", () => {
  it("saves and reads back the exact bytes", async () => {
    await driver.save("org_1/hello.txt", Buffer.from("hello nexora"));
    const readBack = await driver.read("org_1/hello.txt");
    expect(readBack.toString("utf8")).toBe("hello nexora");
  });

  it("exists() reflects reality", async () => {
    await driver.save("org_1/hello.txt", Buffer.from("x"));
    expect(await driver.exists("org_1/hello.txt")).toBe(true);
    expect(await driver.exists("org_1/nope.txt")).toBe(false);
  });

  it("read() throws StorageKeyNotFoundError for a missing key", async () => {
    await expect(driver.read("org_1/nope.txt")).rejects.toBeInstanceOf(StorageKeyNotFoundError);
  });

  it("creates nested directories automatically", async () => {
    const key = "org_2/deep/nested/path/file.bin";
    await driver.save(key, Buffer.from([1, 2, 3, 4]));
    const content = await readFile(join(baseDir, key));
    expect([...content]).toEqual([1, 2, 3, 4]);
  });

  it("delete() is idempotent", async () => {
    await driver.save("org_1/hello.txt", Buffer.from("x"));
    await driver.delete("org_1/hello.txt");
    expect(await driver.exists("org_1/hello.txt")).toBe(false);
    await expect(driver.delete("org_1/hello.txt")).resolves.toBeUndefined();
  });

  it("rejects path-traversal keys instead of escaping the storage root", async () => {
    await expect(driver.save("../../etc/passwd", Buffer.from("pwned"))).rejects.toThrow();
    await expect(driver.read("../../../etc/passwd")).rejects.toThrow();
  });

  it("does not let identical file names in different orgs collide", async () => {
    await driver.save("org_a/report.pdf", Buffer.from("A's report"));
    await driver.save("org_b/report.pdf", Buffer.from("B's report"));
    expect((await driver.read("org_a/report.pdf")).toString()).toBe("A's report");
    expect((await driver.read("org_b/report.pdf")).toString()).toBe("B's report");
  });
});
