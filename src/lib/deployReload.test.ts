// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  checkDeployAndMaybeReload,
  isEditableElement,
  isLocalHostname,
  shouldReloadForBuildIds,
  type DeployReloadDeps,
} from "@/lib/deployReload";

function deps(overrides: Partial<DeployReloadDeps> = {}): DeployReloadDeps {
  return {
    getClientBuildId: () => "client-a",
    fetchServerBuildId: async () => "server-b",
    reload: vi.fn(),
    isDevelopment: () => false,
    isLocalHost: () => false,
    isTypingInEditable: () => false,
    ...overrides,
  };
}

describe("isLocalHostname", () => {
  it("matches loopback hosts", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("[::1]")).toBe(true);
    expect(isLocalHostname("app.local")).toBe(true);
  });

  it("rejects production hosts", () => {
    expect(isLocalHostname("example.com")).toBe(false);
    expect(isLocalHostname("roth.app")).toBe(false);
  });
});

describe("isEditableElement", () => {
  it("detects input, textarea, select, and contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    const plain = document.createElement("div");

    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElement(textarea)).toBe(true);
    expect(isEditableElement(select)).toBe(true);
    expect(isEditableElement(div)).toBe(true);
    expect(isEditableElement(plain)).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe("shouldReloadForBuildIds", () => {
  it("reloads only when both ids exist and differ", () => {
    expect(shouldReloadForBuildIds("a", "b")).toBe(true);
    expect(shouldReloadForBuildIds("a", "a")).toBe(false);
    expect(shouldReloadForBuildIds(undefined, "b")).toBe(false);
    expect(shouldReloadForBuildIds("a", null)).toBe(false);
  });
});

describe("checkDeployAndMaybeReload", () => {
  it("skips in development", async () => {
    const d = deps({ isDevelopment: () => true });
    expect(await checkDeployAndMaybeReload(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("skips on localhost", async () => {
    const d = deps({ isLocalHost: () => true });
    expect(await checkDeployAndMaybeReload(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("skips while typing", async () => {
    const d = deps({ isTypingInEditable: () => true });
    expect(await checkDeployAndMaybeReload(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("reloads when server build id differs", async () => {
    const d = deps();
    expect(await checkDeployAndMaybeReload(d)).toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it("does not reload when build ids match", async () => {
    const d = deps({
      getClientBuildId: () => "same",
      fetchServerBuildId: async () => "same",
    });
    expect(await checkDeployAndMaybeReload(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it("skips reload if typing starts during fetch", async () => {
    let typing = false;
    const d = deps({
      isTypingInEditable: () => typing,
      fetchServerBuildId: async () => {
        typing = true;
        return "server-b";
      },
    });
    expect(await checkDeployAndMaybeReload(d)).toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
  });
});
