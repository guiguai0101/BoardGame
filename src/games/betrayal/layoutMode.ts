import type { GameMobileLayoutPreset } from "../../shared/gameManifest.types";

export type BetrayalLayoutMode = "desktop" | "board-shell";

type BetrayalLayoutModeInput = {
  viewportWidth: number;
  viewportHeight: number;
  mobileLayoutPreset?: GameMobileLayoutPreset;
};

export function resolveBetrayalLayoutMode({
  viewportWidth,
  viewportHeight,
  mobileLayoutPreset,
}: BetrayalLayoutModeInput): BetrayalLayoutMode {
  const isLandscapeMobileViewport =
    viewportWidth > 0 &&
    viewportWidth <= 1023 &&
    viewportWidth > viewportHeight;

  if (!isLandscapeMobileViewport) {
    return "desktop";
  }

  if (mobileLayoutPreset === "board-shell") {
    return "board-shell";
  }

  return "desktop";
}
