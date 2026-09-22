import { test, expect } from '../framework';
import type { Page } from '@playwright/test';
import { setChineseLocale } from '../helpers/common';

type InteractionOption = {
  id: string;
  value?: unknown;
};

function optionHasMinionUid(option: InteractionOption, minionUid: string): boolean {
  const value = option.value;
  return !!value && typeof value === 'object' && (value as { minionUid?: unknown }).minionUid === minionUid;
}

function optionHasCardUid(option: InteractionOption, cardUid: string): boolean {
  const value = option.value;
  return !!value && typeof value === 'object' && (value as { cardUid?: unknown }).cardUid === cardUid;
}

function optionHasTeamworkPlay(option: InteractionOption, cardUid: string, baseIndex: number): boolean {
  const value = option.value;
  return !!value
    && typeof value === 'object'
    && (value as { cardUid?: unknown }).cardUid === cardUid
    && (value as { mode?: unknown }).mode === 'play'
    && (value as { baseIndex?: unknown }).baseIndex === baseIndex;
}

async function clickPromptCardOption(
  page: Page,
  game: { getInteractionOptions(): Promise<InteractionOption[]> },
  matcher: (option: InteractionOption) => boolean,
  description: string,
): Promise<void> {
  const options = await game.getInteractionOptions();
  const option = options.find(matcher);
  if (!option) {
    throw new Error(`Interaction option not found: ${description}`);
  }

  const cardOption = page
    .getByTestId('prompt-card-grid')
    .locator(`[data-testid^="prompt-card-"][data-option-id="${option.id}"]`)
    .first();
  await expect(cardOption).toBeVisible({ timeout: 10000 });
  await cardOption.click({ force: true });
  await page.waitForTimeout(300);
}

async function assertGrimmsFactionDetailLoaded(page: Page): Promise<void> {
  const detail = page.getByTestId('faction-detail-panel');
  await expect(detail).toBeVisible({ timeout: 10000 });
  await expect(detail.getByRole('heading', { name: '格林童话' })).toBeVisible();
  await expect(detail.getByRole('tab', { name: /手牌\s*·\s*18/ })).toBeVisible();

  for (const cardName of ['汉瑟', '格雷特', '樵夫的斧子', '团队合作', '格林兄弟的祝福']) {
    await expect(detail.getByText(cardName).first()).toBeVisible();
  }
}

async function assertCardVisualReady(page: Page, cardUid: string): Promise<void> {
  const card = page.locator(`[data-card-uid="${cardUid}"], [data-minion-uid="${cardUid}"]`).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect.poll(async () => card.evaluate((element) => {
    const hasShimmer = element.querySelector('.atlas-shimmer') !== null;
    const hasImage = element.querySelector('img') !== null;
    const hasBackground = Array.from(element.querySelectorAll<HTMLElement>('div')).some((node) => (
      window.getComputedStyle(node).backgroundImage.includes('url(')
    ));
    return { hasShimmer, hasVisual: hasImage || hasBackground };
  }), { timeout: 15000 }).toEqual({ hasShimmer: false, hasVisual: true });
}

async function dismissSpotlightIfPresent(page: Page): Promise<void> {
  const spotlightQueue = page.getByTestId('card-spotlight-queue');
  if (await spotlightQueue.isVisible({ timeout: 300 }).catch(() => false)) {
    await spotlightQueue.getByRole('button', { name: /^(关闭特写|Close spotlight)$/i }).click({ force: true });
    await page.waitForTimeout(200);
  }

  const dismissHint = page.getByText(/Click anywhere to close|点击关闭|点击任意位置关闭/i).first();
  if (await dismissHint.isVisible({ timeout: 300 }).catch(() => false)) {
    await dismissHint.click({ force: true });
    await page.waitForTimeout(200);
  }
}

test.describe('大杀四方文化冲击格林童话真实入口验证', () => {
  test('派系选择页能看到格林童话，并加载文化冲击图集', async ({ page, game }, testInfo) => {
    test.setTimeout(90000);
    await setChineseLocale(page.context());
    await game.openTestGame('smashup', { skipInitialization: true }, 45000);
    await game.setupScene({
      gameId: 'smashup',
      currentPlayer: '0',
      phase: 'factionSelect',
      extra: {
        core: {
          turnOrder: ['0', '1'],
          currentPlayerIndex: 0,
          turnNumber: 1,
          nextUid: 1000,
          players: {
            '0': { id: '0', vp: 0, hand: [], deck: [], discard: [], factions: ['aliens', 'pirates'], minionsPlayed: 0, minionLimit: 1, actionsPlayed: 0, actionLimit: 1 },
            '1': { id: '1', vp: 0, hand: [], deck: [], discard: [], factions: ['ninjas', 'robots'], minionsPlayed: 0, minionLimit: 1, actionsPlayed: 0, actionLimit: 1 },
          },
          factionSelection: {
            takenFactions: [],
            playerSelections: { '0': [], '1': [] },
            completedPlayers: [],
          },
        },
      },
    });

    const factionSearch = page.getByTestId('faction-search-input');
    await expect(factionSearch).toBeVisible({ timeout: 15000 });
    await factionSearch.fill('格林');

    const option = page.getByTestId('faction-option-grimms_fairy_tales');
    await expect(option).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => option.locator('.atlas-shimmer').count(), {
      message: '格林童话派系卡不应残留 atlas shimmer',
      timeout: 15000,
    }).toBe(0);
    await option.click();
    await assertGrimmsFactionDetailLoaded(page);
    await game.screenshot('01-格林童话-派系选择页图集可见', testInfo);
  });

  test('团队合作可从真实打牌入口检索并额外打出格雷特', async ({ page, game }, testInfo) => {
    test.setTimeout(120000);
    await setChineseLocale(page.context());
    await game.openTestGame('smashup', {
      p0: 'grimms_fairy_tales,aliens',
      p1: 'pirates,ninjas',
      skipFactionSelect: true,
      skipInitialization: false,
      seed: 20260714,
    }, 45000);

    await game.setupScene({
      gameId: 'smashup',
      currentPlayer: '0',
      phase: 'playCards',
      player0: {
        hand: [
          { uid: 'teamwork', defId: 'grimms_fairy_tales_teamwork', type: 'action', owner: '0' },
        ],
        deck: [
          { uid: 'deck-gretel', defId: 'grimms_fairy_tales_gretel', type: 'minion', owner: '0' },
        ],
        discard: [],
        factions: ['grimms_fairy_tales', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 3,
        vp: 0,
      },
      player1: {
        hand: [],
        deck: [],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 0,
      },
      bases: [
        {
          defId: 'base_gingerbread_house',
          minions: [
            { uid: 'hansel', defId: 'grimms_fairy_tales_hansel', owner: '0', controller: '0', power: 2 },
          ],
        },
        { defId: 'base_woodland_cottage', minions: [] },
      ],
    });

    await game.waitForPhase('playCards');
    await assertCardVisualReady(page, 'teamwork');
    await assertCardVisualReady(page, 'hansel');
    await game.screenshot('02-团队合作-触发前', testInfo);

    await game.playCard('grimms_fairy_tales_teamwork');
    await game.waitForInteraction('grimms_fairy_tales_teamwork', 10000);
    await game.screenshot('03-团队合作-选择场上随从', testInfo);
    await game.selectInteractionOptionBy(
      option => optionHasMinionUid(option, 'hansel'),
      '团队合作选择汉瑟作为能力文字来源',
    );

    await game.waitForInteraction('grimms_fairy_tales_teamwork_card', 10000);
    await game.screenshot('04-团队合作-选择匹配随从处理方式', testInfo);
    await game.selectInteractionOptionBy(
      option => optionHasTeamworkPlay(option, 'deck-gretel', 1),
      '团队合作把格雷特额外打到林中小屋',
    );
    await game.waitForNoInteraction(10000);
    await dismissSpotlightIfPresent(page);

    await expect.poll(async () => {
      const state = await game.getState();
      return {
        base0Minions: state.core.bases[0]?.minions?.map((minion: { uid?: string }) => minion.uid) ?? [],
        base1Minions: state.core.bases[1]?.minions?.map((minion: { uid?: string }) => minion.uid) ?? [],
        deckUids: state.core.players['0']?.deck?.map((card: { uid?: string }) => card.uid) ?? [],
        discardUids: state.core.players['0']?.discard?.map((card: { uid?: string }) => card.uid) ?? [],
        interactionOpen: Boolean(state.sys?.interaction?.current),
      };
    }, { timeout: 10000 }).toEqual({
      base0Minions: ['hansel'],
      base1Minions: ['deck-gretel'],
      deckUids: [],
      discardUids: ['teamwork'],
      interactionOpen: false,
    });
    await assertCardVisualReady(page, 'deck-gretel');
    await game.screenshot('05-团队合作-格雷特额外打出结算后', testInfo);
  });

  test('一篮子好东西从真实打牌入口将行动放到牌库顶', async ({ page, game }, testInfo) => {
    test.setTimeout(120000);
    await setChineseLocale(page.context());
    await game.openTestGame('smashup', {
      p0: 'grimms_fairy_tales,aliens',
      p1: 'pirates,ninjas',
      skipFactionSelect: true,
      skipInitialization: false,
      seed: 20260714,
    }, 45000);

    await game.setupScene({
      gameId: 'smashup',
      currentPlayer: '0',
      phase: 'playCards',
      player0: {
        hand: [
          { uid: 'basket', defId: 'grimms_fairy_tales_basket_of_goodies', type: 'action', owner: '0' },
        ],
        deck: [
          { uid: 'deck-minion', defId: 'grimms_fairy_tales_hansel', type: 'minion', owner: '0' },
          { uid: 'deck-action', defId: 'grimms_fairy_tales_another_story', type: 'action', owner: '0' },
        ],
        discard: [],
        factions: ['grimms_fairy_tales', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 3,
        vp: 0,
      },
      player1: {
        hand: [],
        deck: [],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 0,
      },
      bases: [
        { defId: 'base_gingerbread_house', minions: [] },
        { defId: 'base_woodland_cottage', minions: [] },
      ],
    });

    await game.waitForPhase('playCards');
    await assertCardVisualReady(page, 'basket');
    await game.screenshot('06-一篮子好东西-触发前', testInfo);

    await game.playCard('grimms_fairy_tales_basket_of_goodies');
    await game.waitForInteraction('grimms_fairy_tales_basket_of_goodies', 10000);
    await game.screenshot('07-一篮子好东西-选择行动', testInfo);
    await game.selectInteractionOptionBy(
      option => optionHasCardUid(option, 'deck-action'),
      '一篮子好东西把行动放到牌库顶',
    );
    await game.waitForNoInteraction(10000);
    await dismissSpotlightIfPresent(page);

    await expect.poll(async () => {
      const state = await game.getState();
      return {
        deckUids: state.core.players['0']?.deck?.map((card: { uid?: string }) => card.uid) ?? [],
        discardUids: state.core.players['0']?.discard?.map((card: { uid?: string }) => card.uid) ?? [],
        interactionOpen: Boolean(state.sys?.interaction?.current),
      };
    }, { timeout: 10000 }).toEqual({
      deckUids: ['deck-action', 'deck-minion'],
      discardUids: ['basket'],
      interactionOpen: false,
    });
    await game.screenshot('08-一篮子好东西-行动置顶结算后', testInfo);
  });

  test('仙女教母与侏儒怪从真实入口分别搜索并设置牌库顶', async ({ page, game }, testInfo) => {
    test.setTimeout(120000);
    await setChineseLocale(page.context());
    await game.openTestGame('smashup', {
      p0: 'grimms_fairy_tales,aliens',
      p1: 'pirates,ninjas',
      skipFactionSelect: true,
      skipInitialization: false,
      seed: 20260922,
    }, 45000);

    await game.setupScene({
      gameId: 'smashup',
      currentPlayer: '0',
      phase: 'playCards',
      player0: {
        hand: [
          { uid: 'fairy-blessing', defId: 'grimms_fairy_tales_fairy_godmothers_blessing', type: 'action', owner: '0' },
          { uid: 'rumpel-card', defId: 'grimms_fairy_tales_rumpelstiltskin', type: 'minion', owner: '0' },
        ],
        deck: [
          { uid: 'deck-minion', defId: 'grimms_fairy_tales_gretel', type: 'minion', owner: '0' },
          { uid: 'deck-action', defId: 'grimms_fairy_tales_another_story', type: 'action', owner: '0' },
          { uid: 'deck-other-minion', defId: 'grimms_fairy_tales_hansel', type: 'minion', owner: '0' },
        ],
        discard: [],
        factions: ['grimms_fairy_tales', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 2,
        vp: 0,
      },
      player1: {
        hand: [],
        deck: [],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 0,
      },
      bases: [
        { defId: 'base_gingerbread_house', minions: [] },
        { defId: 'base_woodland_cottage', minions: [] },
      ],
    });

    await game.waitForPhase('playCards');
    await game.playCard('grimms_fairy_tales_fairy_godmothers_blessing');
    await game.waitForInteraction('grimms_fairy_tales_fairy_godmothers_blessing', 10000);
    await game.selectInteractionOptionBy(
      option => optionHasCardUid(option, 'deck-minion'),
      '仙女教母选择牌库中的随从放到牌库顶',
    );
    await game.waitForNoInteraction(10000);

    await game.playCard('grimms_fairy_tales_rumpelstiltskin', { targetBaseIndex: 0 });
    await game.waitForInteraction('grimms_fairy_tales_rumpelstiltskin', 10000);
    await game.selectInteractionOptionBy(
      option => optionHasCardUid(option, 'deck-action'),
      '侏儒怪选择牌库中的任意牌放到牌库顶',
    );
    await game.waitForNoInteraction(10000);

    await expect.poll(async () => {
      const state = await game.getState();
      return {
        base0Minions: state.core.bases[0]?.minions?.map((minion: { uid?: string }) => minion.uid) ?? [],
        deckUids: state.core.players['0']?.deck?.map((card: { uid?: string }) => card.uid) ?? [],
        discardUids: state.core.players['0']?.discard?.map((card: { uid?: string }) => card.uid) ?? [],
        interactionOpen: Boolean(state.sys?.interaction?.current),
      };
    }, { timeout: 10000 }).toEqual({
      base0Minions: ['rumpel-card'],
      deckUids: ['deck-action', 'deck-minion', 'deck-other-minion'],
      discardUids: ['fairy-blessing'],
      interactionOpen: false,
    });
    await game.screenshot('09-仙女教母与侏儒怪-牌库顶收口', testInfo);
  });

  test('另一个故事、面包屑与老鼠鸟和香肠从真实入口完成洗回、移动和加力', async ({ page, game }, testInfo) => {
    test.setTimeout(120000);
    await setChineseLocale(page.context());
    await game.openTestGame('smashup', {
      p0: 'grimms_fairy_tales,aliens',
      p1: 'pirates,ninjas',
      skipFactionSelect: true,
      skipInitialization: false,
      seed: 20260922,
    }, 45000);

    await game.setupScene({
      gameId: 'smashup',
      currentPlayer: '0',
      phase: 'playCards',
      player0: {
        hand: [
          { uid: 'another-story', defId: 'grimms_fairy_tales_another_story', type: 'action', owner: '0' },
          { uid: 'breadcrumbs', defId: 'grimms_fairy_tales_breadcrumbs', type: 'action', owner: '0' },
          { uid: 'mouse-bird', defId: 'grimms_fairy_tales_mouse_bird_and_sausage', type: 'action', owner: '0' },
        ],
        deck: [],
        discard: [
          { uid: 'discard-action', defId: 'grimms_fairy_tales_basket_of_goodies', type: 'action', owner: '0' },
          { uid: 'discard-hansel', defId: 'grimms_fairy_tales_hansel', type: 'minion', owner: '0' },
          { uid: 'discard-gretel', defId: 'grimms_fairy_tales_gretel', type: 'minion', owner: '0' },
        ],
        factions: ['grimms_fairy_tales', 'aliens'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 3,
        vp: 0,
      },
      player1: {
        hand: [],
        deck: [],
        discard: [],
        factions: ['pirates', 'ninjas'],
        minionsPlayed: 0,
        minionLimit: 1,
        actionsPlayed: 0,
        actionLimit: 1,
        vp: 0,
      },
      bases: [
        {
          defId: 'base_gingerbread_house',
          minions: [
            { uid: 'hansel', defId: 'grimms_fairy_tales_hansel', owner: '0', controller: '0', power: 2 },
            { uid: 'gretel', defId: 'grimms_fairy_tales_gretel', owner: '0', controller: '0', power: 2 },
          ],
        },
        { defId: 'base_woodland_cottage', minions: [] },
      ],
    });

    await game.waitForPhase('playCards');
    await game.playCard('grimms_fairy_tales_another_story');
    await game.waitForInteraction('grimms_fairy_tales_another_story', 10000);
    for (const uid of ['discard-action', 'discard-hansel', 'discard-gretel']) {
      await clickPromptCardOption(
        page,
        game,
        candidate => optionHasCardUid(candidate, uid),
        `另一个故事选择 ${uid}`,
      );
    }
    await game.confirm();
    await game.waitForNoInteraction(10000);

    await game.playCard('grimms_fairy_tales_breadcrumbs');
    await game.waitForInteraction('grimms_fairy_tales_breadcrumbs', 10000);
    for (const uid of ['hansel', 'gretel']) {
      await clickPromptCardOption(
        page,
        game,
        candidate => optionHasMinionUid(candidate, uid),
        `面包屑选择 ${uid}`,
      );
    }
    await game.confirm();
    await game.waitForInteraction('grimms_fairy_tales_breadcrumbs_destination', 10000);
    await game.selectInteractionOptionBy(
      option => option.value?.baseIndex === 1,
      '面包屑把两个随从移动到林中小屋',
    );
    await game.waitForNoInteraction(10000);

    await game.playCard('grimms_fairy_tales_mouse_bird_and_sausage');
    await game.waitForInteraction('grimms_fairy_tales_mouse_bird_and_sausage', 10000);
    for (const uid of ['hansel', 'gretel']) {
      await clickPromptCardOption(
        page,
        game,
        candidate => optionHasMinionUid(candidate, uid),
        `老鼠鸟和香肠选择 ${uid}`,
      );
    }
    await game.confirm();
    await game.waitForNoInteraction(10000);

    await expect.poll(async () => {
      const state = await game.getState();
      return {
        base0Minions: state.core.bases[0]?.minions?.map((minion: { uid?: string }) => minion.uid) ?? [],
        base1Minions: state.core.bases[1]?.minions?.map((minion: { uid?: string }) => ({
          uid: minion.uid,
          tempPowerModifier: minion.tempPowerModifier ?? 0,
        })) ?? [],
        deckUids: state.core.players['0']?.deck?.map((card: { uid?: string }) => card.uid).sort() ?? [],
        discardUids: state.core.players['0']?.discard?.map((card: { uid?: string }) => card.uid).sort() ?? [],
        interactionOpen: Boolean(state.sys?.interaction?.current),
      };
    }, { timeout: 15000 }).toEqual({
      base0Minions: [],
      base1Minions: [
        { uid: 'hansel', tempPowerModifier: 2 },
        { uid: 'gretel', tempPowerModifier: 2 },
      ],
      deckUids: ['discard-action', 'discard-gretel', 'discard-hansel'],
      discardUids: ['another-story', 'breadcrumbs', 'mouse-bird'],
      interactionOpen: false,
    });
    await game.screenshot('10-另一个故事面包屑老鼠鸟和香肠-长链收口', testInfo);
  });
});
