import { describe, expect, it } from "vitest";

import { resolveBetrayalLayoutMode } from "../layoutMode";

describe("resolveBetrayalLayoutMode", () => {
  it("resolves landscape board-shell from the manifest", () => {
    expect(
      resolveBetrayalLayoutMode({
        viewportWidth: 936,
        viewportHeight: 432,
        mobileLayoutPreset: "board-shell",
      }),
    ).toBe("board-shell");
  });

  it("does not re-enable the removed native map layout", () => {
    expect(
      resolveBetrayalLayoutMode({
        viewportWidth: 936,
        viewportHeight: 432,
        mobileLayoutPreset: "map-shell",
      }),
    ).toBe("desktop");
  });

  it("does not classify desktop or portrait viewports as mobile", () => {
    expect(
      resolveBetrayalLayoutMode({
        viewportWidth: 1920,
        viewportHeight: 1080,
        mobileLayoutPreset: "board-shell",
      }),
    ).toBe("desktop");
    expect(
      resolveBetrayalLayoutMode({
        viewportWidth: 432,
        viewportHeight: 936,
        mobileLayoutPreset: "board-shell",
      }),
    ).toBe("desktop");
  });
});
