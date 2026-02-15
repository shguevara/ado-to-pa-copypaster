/**
 * Unit tests for the detectPageType(url) function from the background service worker.
 *
 * Why test this in isolation?
 * The service worker runs inside Chrome and cannot be unit-tested end-to-end,
 * but detectPageType is a pure function (input: URL string, output: page type string)
 * that has no Chrome API dependencies. We expose it via a conditional module.exports
 * so it can be imported here in Node/Vitest without a browser.
 *
 * Tests must pass before any manual verification step is meaningful.
 */

import { describe, it, expect } from "vitest";
import { detectPageType } from "../background/service-worker.js";

describe("detectPageType", () => {
  // ── ADO (Azure DevOps) URLs ─────────────────────────────────────────────

  it("classifies a dev.azure.com work item URL as ado", () => {
    expect(detectPageType("https://dev.azure.com/myorg/myproject/_workitems/edit/42")).toBe("ado");
  });

  it("classifies a dev.azure.com work items list URL as ado", () => {
    expect(detectPageType("https://dev.azure.com/myorg/myproject/_workitems/")).toBe("ado");
  });

  it("classifies a visualstudio.com work item URL as ado", () => {
    expect(detectPageType("https://contoso.visualstudio.com/project/_workitems/edit/99")).toBe("ado");
  });

  it("classifies a dev.azure.com boards URL as unsupported (no /_workitems/ path)", () => {
    // The boards page is ADO but NOT a work item page — the user can't copy from here.
    expect(detectPageType("https://dev.azure.com/myorg/myproject/_boards/board")).toBe("unsupported");
  });

  it("classifies a dev.azure.com non-workitems path as unsupported", () => {
    expect(detectPageType("https://dev.azure.com/myorg/myproject/_git/repo")).toBe("unsupported");
  });

  // ── PowerApps / Dynamics URLs ───────────────────────────────────────────

  it("classifies a powerapps.com URL as pa", () => {
    expect(detectPageType("https://make.powerapps.com/environments/123")).toBe("pa");
  });

  it("classifies a crm.dynamics.com URL as pa", () => {
    expect(detectPageType("https://myorg.crm.dynamics.com/main.aspx?app=abc")).toBe("pa");
  });

  it("classifies a crm4.dynamics.com (regional) URL as pa", () => {
    expect(detectPageType("https://myorg.crm4.dynamics.com/")).toBe("pa");
  });

  // ── Unsupported pages ───────────────────────────────────────────────────

  it("classifies google.com as unsupported", () => {
    expect(detectPageType("https://google.com")).toBe("unsupported");
  });

  it("classifies a github.com URL as unsupported", () => {
    expect(detectPageType("https://github.com/some/repo")).toBe("unsupported");
  });

  it("classifies an empty string as unsupported", () => {
    // Defensive: the service worker should never crash on a bad URL.
    expect(detectPageType("")).toBe("unsupported");
  });

  it("classifies a malformed URL as unsupported", () => {
    // Defensive: handles cases where the tab URL is missing or unparseable.
    expect(detectPageType("not-a-url")).toBe("unsupported");
  });
});
