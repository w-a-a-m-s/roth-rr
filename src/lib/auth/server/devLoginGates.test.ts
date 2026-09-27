import { afterEach, describe, expect, it } from "vitest";
import {
  defaultCalculatorRedirect,
  isDevLoginEnv,
  isDevLoginRequestAllowed,
  isLocalDevLoginHost,
  matchDevLoginEmail,
  resolveDevLoginRedirect,
} from "./devLoginGates";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DEV_LOGIN_EMAIL: process.env.DEV_LOGIN_EMAIL,
  AUTH_URL: process.env.AUTH_URL,
  AUTH_ALLOWED_ORIGINS: process.env.AUTH_ALLOWED_ORIGINS,
};

afterEach(() => {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.DEV_LOGIN_EMAIL == null) delete process.env.DEV_LOGIN_EMAIL;
  else process.env.DEV_LOGIN_EMAIL = originalEnv.DEV_LOGIN_EMAIL;
  if (originalEnv.AUTH_URL == null) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = originalEnv.AUTH_URL;
  if (originalEnv.AUTH_ALLOWED_ORIGINS == null) {
    delete process.env.AUTH_ALLOWED_ORIGINS;
  } else {
    process.env.AUTH_ALLOWED_ORIGINS = originalEnv.AUTH_ALLOWED_ORIGINS;
  }
});

describe("isDevLoginEnv", () => {
  it("allows development only", () => {
    expect(isDevLoginEnv("development")).toBe(true);
    expect(isDevLoginEnv("production")).toBe(false);
    expect(isDevLoginEnv("test")).toBe(false);
    expect(isDevLoginEnv(undefined)).toBe(false);
  });
});

describe("isLocalDevLoginHost", () => {
  it("allows localhost and 127.0.0.1 only", () => {
    expect(isLocalDevLoginHost("localhost")).toBe(true);
    expect(isLocalDevLoginHost("127.0.0.1")).toBe(true);
    expect(isLocalDevLoginHost("0.0.0.0")).toBe(false);
    expect(isLocalDevLoginHost("example.local")).toBe(false);

  });
});

describe("isDevLoginRequestAllowed", () => {
  it("rejects when NODE_ENV is not development", () => {
    process.env.NODE_ENV = "production";
    expect(
      isDevLoginRequestAllowed(new Request("http://localhost:3000/api/dev/login")),
    ).toBe(false);
  });

  it("rejects a non-local host even in development", () => {
    process.env.NODE_ENV = "development";
    expect(
      isDevLoginRequestAllowed(
        new Request("http://192.168.1.10:3000/api/dev/login"),
      ),
    ).toBe(false);
  });

  it("allows next dev on localhost", () => {
    process.env.NODE_ENV = "development";
    expect(
      isDevLoginRequestAllowed(new Request("http://localhost:3000/api/dev/login")),
    ).toBe(true);
    expect(
      isDevLoginRequestAllowed(new Request("http://127.0.0.1:3000/api/dev/login")),
    ).toBe(true);
  });
});

describe("matchDevLoginEmail", () => {
  it("requires a query email", () => {
    expect(matchDevLoginEmail(null, "you@example.com")).toBeNull();
    expect(matchDevLoginEmail("", "you@example.com")).toBeNull();
    expect(matchDevLoginEmail("   ", "you@example.com")).toBeNull();
  });

  it("requires DEV_LOGIN_EMAIL", () => {
    expect(matchDevLoginEmail("you@example.com", undefined)).toBeNull();
    expect(matchDevLoginEmail("you@example.com", "")).toBeNull();
  });

  it("rejects a mismatch", () => {
    expect(matchDevLoginEmail("other@example.com", "you@example.com")).toBeNull();
  });

  it("accepts a case-insensitive trim match", () => {
    expect(matchDevLoginEmail("  You@Example.com  ", "you@example.com")).toBe(
      "you@example.com",
    );
  });
});

describe("resolveDevLoginRedirect", () => {
  it("defaults to the local calculator in development", () => {
    process.env.NODE_ENV = "development";
    expect(defaultCalculatorRedirect()).toBe("http://localhost:3000");
    expect(
      resolveDevLoginRedirect(null, "http://localhost:3000/api/dev/login"),
    ).toBe("http://localhost:3000");
  });

  it("keeps a relative next on this app", () => {
    process.env.NODE_ENV = "development";
    expect(
      resolveDevLoginRedirect(
        "/abc",
        "http://localhost:3000/api/dev/login",
      ),
    ).toBe("http://localhost:3000/abc");
  });

  it("falls back when next is off-origin", () => {
    process.env.NODE_ENV = "development";
    expect(
      resolveDevLoginRedirect(
        "https://evil.example/phish",
        "http://localhost:3000/api/dev/login",
      ),
    ).toBe("http://localhost:3000");
  });
});
