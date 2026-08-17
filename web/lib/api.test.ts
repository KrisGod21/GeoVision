import { describe, expect, it } from "vitest";
import { normaliseApiBase } from "./api";

describe("normaliseApiBase", () => {
  it("leaves a correct base untouched", () => {
    expect(normaliseApiBase("https://api.example.com")).toBe("https://api.example.com");
  });

  it("strips a trailing slash", () => {
    // Without this, `${base}/api/jobs` becomes host//api/jobs, which Starlette
    // does not collapse -- every request 404s with no clue as to why.
    expect(normaliseApiBase("https://api.example.com/")).toBe("https://api.example.com");
  });

  it("strips several trailing slashes", () => {
    expect(normaliseApiBase("https://api.example.com///")).toBe("https://api.example.com");
  });

  it("strips surrounding whitespace", () => {
    expect(normaliseApiBase("  https://api.example.com/  ")).toBe("https://api.example.com");
  });

  it("preserves a port", () => {
    expect(normaliseApiBase("http://127.0.0.1:8000/")).toBe("http://127.0.0.1:8000");
  });

  it("does not mangle a base that includes a path prefix", () => {
    expect(normaliseApiBase("https://example.com/gateway/")).toBe("https://example.com/gateway");
  });

  it("produces a joinable base", () => {
    expect(`${normaliseApiBase("https://api.example.com/")}/api/jobs`).toBe(
      "https://api.example.com/api/jobs"
    );
  });
});
