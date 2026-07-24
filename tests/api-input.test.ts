import assert from "node:assert/strict";
import test from "node:test";
import { boundedInteger, cleanText, databaseInt, MAX_DATABASE_INT, optionalText, positiveVersion, safeBigInt } from "../lib/api-input";

test("databaseInt accepts positive PostgreSQL Int values and rejects out-of-range input", () => {
  assert.equal(databaseInt("42"), 42);
  assert.equal(databaseInt(MAX_DATABASE_INT), MAX_DATABASE_INT);
  assert.equal(databaseInt(0), 0);
  assert.equal(databaseInt(-1, 7), 7);
  assert.equal(databaseInt(1.2, 7), 7);
  assert.equal(databaseInt(MAX_DATABASE_INT + 1, 7), 7);
});

test("safeBigInt only converts positive safe integers", () => {
  assert.equal(safeBigInt(BigInt(12)), BigInt(12));
  assert.equal(safeBigInt("9007199254740991"), BigInt("9007199254740991"));
  assert.equal(safeBigInt(0), null);
  assert.equal(safeBigInt(-1), null);
  assert.equal(safeBigInt("9007199254740992"), null);
  assert.equal(safeBigInt("not-a-number"), null);
});

test("version and text helpers normalize API input without inventing values", () => {
  assert.equal(positiveVersion("3"), 3);
  assert.equal(positiveVersion(0), 0);
  assert.equal(positiveVersion(1.5), 0);
  assert.equal(cleanText("  剧本  "), "剧本");
  assert.equal(cleanText("  ", "默认"), "默认");
  assert.equal(optionalText("  备注  "), "备注");
  assert.equal(optionalText("  "), undefined);
});

test("boundedInteger rounds finite values and clamps them to the requested range", () => {
  assert.equal(boundedInteger("7.6", 4, 15, 5), 8);
  assert.equal(boundedInteger(-10, 4, 15, 5), 4);
  assert.equal(boundedInteger(100, 4, 15, 5), 15);
  assert.equal(boundedInteger("invalid", 4, 15, 5), 5);
});
