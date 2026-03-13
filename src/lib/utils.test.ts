import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { titleCase, computeRangeCutoff } from "./utils";

describe("titleCase", () => {
  it("converts kebab-case", () => {
    assert.equal(titleCase("hello-world"), "Hello World");
  });

  it("converts snake_case", () => {
    assert.equal(titleCase("hello_world"), "Hello World");
  });

  it("converts space-separated", () => {
    assert.equal(titleCase("hello world"), "Hello World");
  });

  it("handles mixed separators", () => {
    assert.equal(titleCase("foo-bar_baz qux"), "Foo Bar Baz Qux");
  });

  it("handles single word", () => {
    assert.equal(titleCase("nike"), "Nike");
  });

  it("handles empty string", () => {
    assert.equal(titleCase(""), "");
  });

  it("handles consecutive separators", () => {
    assert.equal(titleCase("foo--bar"), "Foo Bar");
  });
});

describe("computeRangeCutoff", () => {
  it("returns date 7 days ago for range 7", () => {
    const before = Date.now();
    const cutoff = computeRangeCutoff(7);
    const after = Date.now();
    const expected = 7 * 86_400_000;
    assert.ok(before - cutoff.getTime() <= expected + 10);
    assert.ok(after - cutoff.getTime() >= expected - 10);
  });

  it("returns date 30 days ago for range 30", () => {
    const cutoff = computeRangeCutoff(30);
    const diff = Date.now() - cutoff.getTime();
    assert.ok(Math.abs(diff - 30 * 86_400_000) < 100);
  });

  it("returns date 90 days ago for range 90", () => {
    const cutoff = computeRangeCutoff(90);
    const diff = Date.now() - cutoff.getTime();
    assert.ok(Math.abs(diff - 90 * 86_400_000) < 100);
  });

  it("defaults to 90 for invalid range", () => {
    const cutoff = computeRangeCutoff(42);
    const diff = Date.now() - cutoff.getTime();
    assert.ok(Math.abs(diff - 90 * 86_400_000) < 100);
  });
});
