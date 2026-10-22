import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv, isLoopbackUrl, isSecureEndpoint } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("endpoint checks", () => {
  it("recognizes this machine", () => {
    expect(isLoopbackUrl("http://127.0.0.1:4010/google")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3000")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:8080")).toBe(true);
    expect(isLoopbackUrl("http://app.localhost")).toBe(true);
    expect(isLoopbackUrl("https://googleapis.example.com")).toBe(false);
    expect(isLoopbackUrl("http://127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });

  it("allows keys over https, and over http only to localhost", () => {
    expect(isSecureEndpoint("https://api.groq.com/openai/v1")).toBe(true);
    expect(isSecureEndpoint("http://127.0.0.1:4010/groq")).toBe(true);
    expect(isSecureEndpoint("http://proxy.example.com/v1")).toBe(false);
    expect(isSecureEndpoint("ftp://example.com")).toBe(false);
  });

  it("refuses a keyed base URL in clear text and a Google override outside tests", () => {
    vi.stubEnv("GROQ_BASE_URL", "http://groq-proxy.example.com/v1");
    expect(() => getServerEnv()).toThrow(/GROQ_BASE_URL must start with https:\/\//);
    vi.stubEnv("GROQ_BASE_URL", "");
    vi.stubEnv("GOOGLE_API_BASE_URL", "https://fake-google.example.com");
    expect(() => getServerEnv()).toThrow(/GOOGLE_API_BASE_URL is for local tests only/);
    vi.stubEnv("GOOGLE_API_BASE_URL", "http://127.0.0.1:4010/google");
    expect(getServerEnv().GOOGLE_API_BASE_URL).toBe("http://127.0.0.1:4010/google");
  });
});
