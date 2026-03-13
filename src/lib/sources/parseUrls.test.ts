import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, extractUrls } from "./parseUrls";

describe("normalizeUrl", () => {
  it("lowercases the domain", () => {
    const result = normalizeUrl("https://WWW.Example.COM/path");
    assert.ok(result);
    assert.equal(result.domain, "www.example.com");
    assert.ok(result.normalized.includes("www.example.com"));
  });

  it("strips utm tracking params", () => {
    const result = normalizeUrl("https://example.com/page?utm_source=twitter&utm_medium=social&id=123");
    assert.ok(result);
    assert.ok(!result.normalized.includes("utm_source"));
    assert.ok(!result.normalized.includes("utm_medium"));
    assert.ok(result.normalized.includes("id=123"));
  });

  it("strips all tracking params (fbclid, gclid, mc_cid, etc.)", () => {
    const result = normalizeUrl("https://example.com/page?fbclid=abc&gclid=def&mc_cid=ghi&mc_eid=jkl&ref=xyz&source=test&keep=yes");
    assert.ok(result);
    assert.ok(!result.normalized.includes("fbclid"));
    assert.ok(!result.normalized.includes("gclid"));
    assert.ok(!result.normalized.includes("mc_cid"));
    assert.ok(!result.normalized.includes("mc_eid"));
    assert.ok(!result.normalized.includes("ref="));
    assert.ok(!result.normalized.includes("source="));
    assert.ok(result.normalized.includes("keep=yes"));
  });

  it("removes fragments", () => {
    const result = normalizeUrl("https://example.com/page#section-1");
    assert.ok(result);
    assert.ok(!result.normalized.includes("#section-1"));
  });

  it("preserves path", () => {
    const result = normalizeUrl("https://example.com/blog/post/123");
    assert.ok(result);
    assert.ok(result.normalized.includes("/blog/post/123"));
  });

  it("returns null for invalid URLs", () => {
    assert.equal(normalizeUrl("not a url"), null);
    assert.equal(normalizeUrl("ftp://example.com"), null);
  });

  it("strips trailing punctuation", () => {
    const result = normalizeUrl("https://example.com/page.");
    assert.ok(result);
    assert.equal(result.domain, "example.com");
    assert.ok(!result.normalized.endsWith("."));
  });

  it("handles URLs with no path", () => {
    const result = normalizeUrl("https://example.com");
    assert.ok(result);
    assert.equal(result.domain, "example.com");
  });
});

describe("extractUrls", () => {
  it("extracts markdown links", () => {
    const text = "See [this article](https://example.com/article) for more info.";
    const urls = extractUrls(text);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].domain, "example.com");
    assert.equal(urls[0].sourceType, "markdown_link");
    assert.ok(urls[0].positionIndex >= 0);
  });

  it("extracts bare URLs", () => {
    const text = "Visit https://example.com/page for details.";
    const urls = extractUrls(text);
    assert.equal(urls.length, 1);
    assert.equal(urls[0].domain, "example.com");
    assert.equal(urls[0].sourceType, "bare_url");
  });

  it("does not double-extract URLs inside markdown links", () => {
    const text = "Read [more](https://example.com/a) and also https://other.com/b";
    const urls = extractUrls(text);
    assert.equal(urls.length, 2);
    assert.equal(urls[0].domain, "example.com");
    assert.equal(urls[0].sourceType, "markdown_link");
    assert.equal(urls[1].domain, "other.com");
    assert.equal(urls[1].sourceType, "bare_url");
  });

  it("deduplicates by normalized URL", () => {
    const text = "First https://example.com/page then https://EXAMPLE.com/page again";
    const urls = extractUrls(text);
    assert.equal(urls.length, 1);
  });

  it("returns empty for text with no URLs", () => {
    const urls = extractUrls("This is a plain text response without any links.");
    assert.equal(urls.length, 0);
  });

  it("returns empty for empty text", () => {
    assert.equal(extractUrls("").length, 0);
  });

  it("tracks positionIndex correctly", () => {
    const text = "A: https://first.com B: https://second.com";
    const urls = extractUrls(text);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].positionIndex < urls[1].positionIndex);
  });

  it("handles malformed URLs gracefully", () => {
    const text = "See https://valid.com/page and also https://";
    const urls = extractUrls(text);
    // Should extract the valid one, skip the malformed
    assert.ok(urls.length >= 1);
    assert.equal(urls[0].domain, "valid.com");
  });

  it("normalizes URLs during extraction", () => {
    const text = "Visit https://example.com/page?utm_source=google#top";
    const urls = extractUrls(text);
    assert.equal(urls.length, 1);
    assert.ok(!urls[0].normalizedUrl.includes("utm_source"));
    assert.ok(!urls[0].normalizedUrl.includes("#top"));
  });

  it("extracts multiple markdown links", () => {
    const text = "[A](https://a.com) and [B](https://b.com) and [C](https://c.com)";
    const urls = extractUrls(text);
    assert.equal(urls.length, 3);
    assert.deepEqual(urls.map((u) => u.domain), ["a.com", "b.com", "c.com"]);
  });

  it("handles mixed markdown and bare URLs", () => {
    const text = "See [link](https://a.com/1) and https://b.com/2 and [other](https://c.com/3)";
    const urls = extractUrls(text);
    assert.equal(urls.length, 3);
  });
});
