import { expect, test, type Page } from "@playwright/test";
import {
  DESKTOP_REFERENCE_VIEWPORT,
  MOBILE_LANDSCAPE_E2E_VIEWPORT,
} from "../../src/shared/referenceViewports";
import {
  initBetrayalContext,
  injectCore,
  saveScreenshot,
  waitForBetrayalPageReady,
  warmBetrayalFrontend,
} from "./betrayalTestHelpers";
import { createStartedFirstScenarioCore } from "../../src/games/betrayal/testing/firstScenarioTestUtils";

const ROUTE =
  "/play/betrayal?players=3&seat0=human&seat1=human&seat2=human&playerID=0&bgForceCoarsePointer=1";
const PC_VIEWPORT = DESKTOP_REFERENCE_VIEWPORT;
const PHONE_VIEWPORT = MOBILE_LANDSCAPE_E2E_VIEWPORT;
const EVIDENCE_DIR = "evidence/betrayal-width-comparison-20260920-board-shell";
const PC_SCREENSHOT = `${EVIDENCE_DIR}/01-pc-1920x1080-移动选目标.png`;
const PHONE_SCREENSHOT = `${EVIDENCE_DIR}/02-phone-936x432-移动选目标.png`;

async function enterMoveTargetState(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(ROUTE, { waitUntil: "domcontentloaded" });
  await waitForBetrayalPageReady(page);
  await injectCore(page, createStartedFirstScenarioCore(["0", "1", "2"]));
  await expect(page.getByTestId("betrayal-board")).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByTestId("betrayal-room-occupant-entrance-hall-0"),
  ).toBeVisible();
  await page.getByTestId("betrayal-action-move").click();
  await expect(page.getByTestId("betrayal-action-move")).toContainText(
    "取消移动",
  );
  await expect(page.getByTestId("betrayal-room-hallway")).toBeVisible();
  await expect(page.getByTestId("betrayal-room-hallway")).toBeEnabled();
}

async function readLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Number(box.left.toFixed(2)),
        top: Number(box.top.toFixed(2)),
        right: Number(box.right.toFixed(2)),
        bottom: Number(box.bottom.toFixed(2)),
        width: Number(box.width.toFixed(2)),
        height: Number(box.height.toFixed(2)),
      };
    };
    const root = document.documentElement;
    const shell = document.querySelector<HTMLElement>(".mobile-board-shell");
    const rectList = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
        (element) => {
          const box = element.getBoundingClientRect();
          return {
            testId: element.dataset.testid ?? null,
            left: Number(box.left.toFixed(2)),
            top: Number(box.top.toFixed(2)),
            right: Number(box.right.toFixed(2)),
            bottom: Number(box.bottom.toFixed(2)),
            width: Number(box.width.toFixed(2)),
            height: Number(box.height.toFixed(2)),
            visible:
              box.width > 0 &&
              box.height > 0 &&
              box.right > 0 &&
              box.left < window.innerWidth &&
              box.bottom > 0 &&
              box.top < window.innerHeight,
          };
        },
      );
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      shell: rect(".mobile-board-shell"),
      shellTransform: shell ? getComputedStyle(shell).transform : null,
      shellWidth: root.style.getPropertyValue(
        "--mobile-board-shell-design-width",
      ),
      shellScale: root.style.getPropertyValue("--mobile-board-shell-scale"),
      board: rect('[data-testid="betrayal-board"]'),
      layoutMode:
        document.querySelector<HTMLElement>(
          '[data-testid="betrayal-desktop-layout"]',
        )?.dataset.layoutMode ?? null,
      roomGrid: rect('[data-testid="betrayal-room-grid"]'),
      roomCanvas: rect('[data-testid="betrayal-room-canvas"]'),
      roomCanvasTransform: document.querySelector<HTMLElement>(
        '[data-testid="betrayal-room-canvas"]',
      )
        ? getComputedStyle(
            document.querySelector<HTMLElement>(
              '[data-testid="betrayal-room-canvas"]',
            )!,
          ).transform
        : null,
      rooms: rectList('[data-testid^="betrayal-room-shell-"]'),
      leftRail: rect('[data-testid="betrayal-left-status-rail"]'),
      statusRail: rect('[data-testid="betrayal-status-rail"]'),
      actionRail: rect('[data-testid="betrayal-action-rail"]'),
      phaseChip: rect('[data-testid="betrayal-phase-chip"]'),
      actions: rectList('[data-testid^="betrayal-action-"]'),
      nativeMobileUi: {
        layout: document.querySelectorAll(
          '[data-testid="betrayal-mobile-landscape-layout"]',
        ).length,
        actionRail: document.querySelectorAll(
          '[data-testid="betrayal-mobile-action-rail"]',
        ).length,
        roles: document.querySelectorAll(
          '[data-mobile-role="native-action-rail"],' +
            '[data-mobile-role="primary-board-stage"],' +
            '[data-mobile-role="possession-rail"]',
        ).length,
      },
      overflow: {
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        root: document.querySelector<HTMLElement>("#root")?.scrollWidth ?? 0,
      },
    };
  });
}

test.describe("山屋惊魂 PC/手机同状态宽度对照", () => {
  test("同一移动选目标状态生成 PC 与真实手机 CSS 视口截图", async ({
    page,
    context,
  }) => {
    test.setTimeout(180000);
    await initBetrayalContext(context);
    await warmBetrayalFrontend(context);

    await enterMoveTargetState(page, PC_VIEWPORT);
    const pcMetrics = await readLayoutMetrics(page);
    console.log("PC_LAYOUT_METRICS", pcMetrics);
    await saveScreenshot(page, PC_SCREENSHOT);

    const phonePage = await context.newPage();
    try {
      await enterMoveTargetState(phonePage, PHONE_VIEWPORT);
      const phoneMetrics = await readLayoutMetrics(phonePage);
      console.log("PHONE_LAYOUT_METRICS", phoneMetrics);
      expect(phoneMetrics.shellWidth).toBe("2340px");
      expect(phoneMetrics.shellScale).toBe("0.400000");
      expect(phoneMetrics.shell?.width ?? 0).toBeCloseTo(
        PHONE_VIEWPORT.width,
        0,
      );
      expect(phoneMetrics.shell?.height ?? 0).toBeCloseTo(
        PHONE_VIEWPORT.height,
        0,
      );
      expect(phoneMetrics.layoutMode).toBe("desktop-board");
      expect(phoneMetrics.nativeMobileUi).toEqual({
        layout: 0,
        actionRail: 0,
        roles: 0,
      });
      expect(phoneMetrics.phaseChip?.width ?? 0).toBeGreaterThan(0);
      expect(phoneMetrics.leftRail?.width ?? 0).toBeGreaterThan(0);
      expect(phoneMetrics.statusRail?.width ?? 0).toBeGreaterThan(0);
      expect(phoneMetrics.actionRail?.width ?? 0).toBeGreaterThan(0);
      expect(phoneMetrics.rooms.length).toBe(pcMetrics.rooms.length);
      expect(phoneMetrics.rooms.every((room) => room.visible)).toBe(true);
      expect(phoneMetrics.roomCanvas?.width ?? 0).toBeCloseTo(
        (pcMetrics.roomCanvas?.width ?? 0) * 0.4,
        0,
      );
      expect(phoneMetrics.roomCanvas?.height ?? 0).toBeCloseTo(
        (pcMetrics.roomCanvas?.height ?? 0) * 0.4,
        0,
      );
      expect(phoneMetrics.overflow.document).toBeLessThanOrEqual(
        PHONE_VIEWPORT.width + 1,
      );
      expect(phoneMetrics.overflow.body).toBeLessThanOrEqual(
        PHONE_VIEWPORT.width + 1,
      );
      await saveScreenshot(phonePage, PHONE_SCREENSHOT);
    } finally {
      await phonePage.close();
    }
  });
});
