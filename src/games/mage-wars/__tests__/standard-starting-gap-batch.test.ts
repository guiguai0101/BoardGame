import { describe, expect, it } from 'vitest';
import type { Command, MatchState } from '../../../engine/types';
import { INTERACTION_COMMANDS } from '../../../engine/systems/InteractionSystem';
import { FLOW_COMMANDS } from '../../../engine/systems/FlowSystem';
import { getMageWarsSpellCardFromConfig } from '../data/configPackage';
import { MAGE_WARS_COMMANDS } from '../domain';
import { MAGE_WARS_EVENTS } from '../domain/events';
import { resolveMageWarsMageEquipmentArmor } from '../domain/damageRules';
import {
    getMageWarsObjectDefenseProfiles,
    getMageWarsObjectAttackProfile,
    isMageWarsElusiveArenaObject,
    isMageWarsFlyingArenaObject,
    isMageWarsSlowArenaObject,
} from '../domain/spellRules';
import type { MageWarsCore } from '../domain/types';
import {
    castObjectSpellCommand,
    getPromptOptions,
    getSimpleChoicePrompt,
    makeArenaObject,
    makeVisibleEnchantmentObject,
    PLAYER_ZERO_START_ZONE,
    planCommand,
    runCommand,
    setupState,
    withPlayerInZone,
    withPlayerMage,
    withArenaObject,
    withPreparedPlayerMage,
    validateCommand,
} from './helpers/domainFlowHarness';
import { ARENA_ZONE_IDS, MAGE_IDS, STATUS_TOKEN_IDS } from '../domain/ids';

describe('mage-wars standard starting spellbook implementation batch', () => {
    it('implements 1819 Force Orb as a structured status-proof defense enchantment', () => {
        const target = makeArenaObject('force-orb-target-0', '0', PLAYER_ZERO_START_ZONE);
        const attacker = makeArenaObject('force-orb-attacker-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const state: MatchState<MageWarsCore> = {
            core: [target, attacker].reduce(
                (core, object) => withArenaObject(core, object),
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.WARLOCK_APPRENTICE, [1819]),
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(1819, 5, target.id));
        const enchantment = Object.values(cast.state.core.objects)
            .find((object) => object.sourceSpellCardId === 1819);

        expect(getMageWarsSpellCardFromConfig(1819)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(enchantment).toMatchObject({
            revealed: true,
            anchoredToObjectId: target.id,
            combatProfilesSource: 'config',
        });
        expect(getMageWarsObjectDefenseProfiles(target, cast.state.core)).toEqual(expect.arrayContaining([
            expect.objectContaining({ minRoll: 8, usesPerRound: 1, ignoresStatus: true }),
        ]));

        const attack = runCommand({
            core: {
                ...cast.state.core,
                currentPlayerId: '1',
            },
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '1',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(attack.success).toBe(true);
        expect(attack.events.some((event) => event.type === MAGE_WARS_EVENTS.DEFENSE_AVAILABLE)).toBe(true);
    });

    it('implements 1814 Eagle Wings and 1824 Grounding through structured flying grants', () => {
        const wingedTarget = makeArenaObject('eagle-wings-target-0', '0', PLAYER_ZERO_START_ZONE);
        const wingState: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [1814]),
                wingedTarget,
            ),
            sys: setupState('creatureAction').sys,
        };
        const wingCast = runCommand(wingState, castObjectSpellCommand(1814, 6, wingedTarget.id));
        const wingedCore = wingCast.state.core;
        const wingedTextIndependentCore = {
            ...wingedCore,
            objects: Object.fromEntries(Object.entries(wingedCore.objects).map(([id, object]) => (
                object.sourceSpellCardId === 1814
                    ? [id, { ...object, attackOrTraitLine: undefined, rulesText: '展示文案已移除。' }]
                    : [id, object]
            ))),
        } as MageWarsCore;

        expect(wingCast.success).toBe(true);
        expect(isMageWarsFlyingArenaObject(wingedTarget, wingedTextIndependentCore)).toBe(true);

        const alreadyFlying = makeArenaObject('grounding-target-0', '0', PLAYER_ZERO_START_ZONE, {
            typeLine: '生物 / 飞行',
        });
        const groundingState: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.WARLOCK_APPRENTICE, [1824]),
                alreadyFlying,
            ),
            sys: setupState('creatureAction').sys,
        };
        const groundingCast = runCommand(groundingState, castObjectSpellCommand(1824, 5, alreadyFlying.id));
        expect(groundingCast.success).toBe(true);
        expect(isMageWarsFlyingArenaObject(alreadyFlying, groundingCast.state.core)).toBe(false);
    });

    it('implements 1822 Falcon Focus as ranged-only +1 dice from the attachment', () => {
        const archer = makeArenaObject('falcon-focus-archer-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '长弓：完整行动远程 `1-2` 2 骰；利爪：快速近战 2 骰',
        });
        const target = makeArenaObject('falcon-focus-target-1', '1', ARENA_ZONE_IDS.B3, { life: 40 });
        const state: MatchState<MageWarsCore> = {
            core: [archer, target].reduce(
                (core, object) => withArenaObject(core, object),
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.PRIESTESS_APPRENTICE, [1822]),
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(1822, 3, archer.id));
        const attack = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: archer.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });
        const declared = attack.events.find((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);

        expect(cast.success).toBe(true);
        expect(attack.success).toBe(true);
        expect(declared?.payload).toMatchObject({
            rangedDiceModifier: 1,
            diceResults: [3, 3, 3],
        });
    });

    it('implements 3421 Piercing Strike as +3 pierce on the next melee attack', () => {
        const attacker = makeArenaObject('piercing-strike-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('piercing-strike-target-1', '1', PLAYER_ZERO_START_ZONE, { life: 40 });
        const state: MatchState<MageWarsCore> = {
            core: [attacker, target].reduce(
                (core, object) => withArenaObject(core, object),
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3421]),
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(3421, 2, attacker.id));
        expect(cast.success).toBe(true);
        expect(getMageWarsSpellCardFromConfig(3421)?.requiresCodeSupport).toBe(false);
        expect(cast.state.core.objects[attacker.id].temporaryTraits).toMatchObject({
            nextMeleePierceModifier: 3,
        });

        const attack = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(attack.success).toBe(true);
        expect(attack.events.some((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED
            && event.payload.pierceModifier === 3)).toBe(true);
        expect(attack.state.core.objects[attacker.id].temporaryTraits?.nextMeleePierceModifier).toBeUndefined();
    });

    it('implements 3422 Perfect Strike as an unavoidable next melee attack', () => {
        const attacker = makeArenaObject('perfect-strike-attacker-0', '0', PLAYER_ZERO_START_ZONE);
        const target = makeArenaObject('perfect-strike-target-1', '1', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 2 骰；防御图标 `8+ / 1x`',
        });
        const state: MatchState<MageWarsCore> = {
            core: [attacker, target].reduce(
                (core, object) => withArenaObject(core, object),
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3422]),
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(3422, 2, attacker.id));
        expect(cast.success).toBe(true);
        expect(getMageWarsSpellCardFromConfig(3422)?.requiresCodeSupport).toBe(false);
        expect(cast.state.core.objects[attacker.id].temporaryTraits).toMatchObject({
            nextMeleeUnavoidable: true,
        });

        const attack = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetObjectId: target.id,
            },
        });

        expect(attack.success).toBe(true);
        expect(attack.events.some((event) => event.type === MAGE_WARS_EVENTS.DEFENSE_AVAILABLE)).toBe(false);
        expect(attack.state.core.objects[attacker.id].temporaryTraits?.nextMeleeUnavoidable).toBeUndefined();
    });

    it('implements 3426 Unhindered Movement as temporary elusive', () => {
        const target = makeArenaObject('unhindered-target-0', '0', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.WARLOCK_APPRENTICE, [3426]),
                target,
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(3426, 3, target.id));
        expect(cast.success).toBe(true);
        expect(getMageWarsSpellCardFromConfig(3426)?.requiresCodeSupport).toBe(false);
        expect(isMageWarsElusiveArenaObject(cast.state.core.objects[target.id], cast.state.core)).toBe(true);
        expect(cast.state.core.objects[target.id].temporaryTraits).toMatchObject({ elusive: true });
    });

    it('implements 3424 Knockdown as a stun token and rejects stable creatures', () => {
        const target = makeArenaObject('knockdown-target-1', '1', PLAYER_ZERO_START_ZONE);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3424]),
                target,
            ),
            sys: setupState('creatureAction').sys,
        };

        const cast = runCommand(state, castObjectSpellCommand(3424, 3, target.id));

        expect(getMageWarsSpellCardFromConfig(3424)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(cast.events).toContainEqual(expect.objectContaining({
            type: MAGE_WARS_EVENTS.STATUS_TOKEN_PLACED,
            payload: expect.objectContaining({
                targetObjectId: target.id,
                statusTokenId: STATUS_TOKEN_IDS.STUN,
                amount: 1,
                spellCardId: 3424,
            }),
        }));
        expect(cast.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.STUN]).toBe(1);

        const stableTarget = makeArenaObject('knockdown-stable-target-1', '1', PLAYER_ZERO_START_ZONE, {
            typeLine: '生物 / 稳固',
        });
        const stableState: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3424]),
                stableTarget,
            ),
            sys: setupState('creatureAction').sys,
        };
        expect(validateCommand(stableState, castObjectSpellCommand(3424, 3, stableTarget.id))).toBe('targetStable');
    });

    it('implements 3423 Holy Grace healing with paid partial status removal', () => {
        const target = makeArenaObject('holy-grace-target-1', '1', PLAYER_ZERO_START_ZONE, {
            damage: 8,
            statusTokens: {
                [STATUS_TOKEN_IDS.STUN]: 1,
                [STATUS_TOKEN_IDS.DAZE]: 2,
            },
        });
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.PRIESTESS_APPRENTICE, [3423]),
                target,
            ),
            sys: setupState('creatureAction').sys,
        };
        const cast = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3423,
                manaCost: 15,
                targetObjectId: target.id,
                statusTokenIds: [STATUS_TOKEN_IDS.STUN, STATUS_TOKEN_IDS.DAZE],
                statusTokenAmounts: {
                    [STATUS_TOKEN_IDS.STUN]: 1,
                    [STATUS_TOKEN_IDS.DAZE]: 1,
                },
            },
        });

        expect(getMageWarsSpellCardFromConfig(3423)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(cast.events).toContainEqual(expect.objectContaining({
            type: MAGE_WARS_EVENTS.SPELL_HEALING_ROLLED,
            payload: expect.objectContaining({
                spellCardId: 3423,
                diceResults: Array(12).fill(3),
                healing: 36,
                actualHealing: 8,
            }),
        }));
        expect(cast.events.filter((event) => event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE))
            .toHaveLength(2);
        expect(cast.state.core.objects[target.id].damage).toBe(0);
        expect(cast.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.STUN]).toBeUndefined();
        expect(cast.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.DAZE]).toBe(1);
        expect(cast.state.core.players['0'].mana).toBe(5);
    });

    it('implements 3418 Toxin Purification with partial toxin removal and explicit enchantment selection', () => {
        const target = makeArenaObject('toxin-purification-target-0', '0', PLAYER_ZERO_START_ZONE, {
            statusTokens: {
                [STATUS_TOKEN_IDS.ROT]: 2,
                [STATUS_TOKEN_IDS.WEAK]: 1,
            },
        });
        const selectedToxinEnchantment = makeVisibleEnchantmentObject(
            'toxin-purification-selected-enchantment-0',
            '1',
            PLAYER_ZERO_START_ZONE,
            {
                sourceSpellCardId: 1820,
                sourceObjectId: 'spell-card-1820',
                name: '尸鬼腐化',
                typeLine: '结界 / 诅咒、毒素',
                rulesText: '每个维持阶段，本生物受到2点直接毒素伤害。',
                anchoredToObjectId: target.id,
            },
        );
        const unselectedToxinEnchantment = makeVisibleEnchantmentObject(
            'toxin-purification-unselected-enchantment-0',
            '1',
            PLAYER_ZERO_START_ZONE,
            {
                sourceSpellCardId: 1820,
                sourceObjectId: 'spell-card-1820',
                name: '尸鬼腐化（未选）',
                typeLine: '结界 / 诅咒、毒素',
                rulesText: '每个维持阶段，本生物受到2点直接毒素伤害。',
                anchoredToObjectId: target.id,
            },
        );
        const setup = setupState('creatureAction');
        const prepared = withPreparedPlayerMage(setup.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE, [3418]);
        const state: MatchState<MageWarsCore> = {
            core: {
                ...withArenaObject(
                    withArenaObject(
                        withArenaObject(prepared, target),
                        selectedToxinEnchantment,
                    ),
                    unselectedToxinEnchantment,
                ),
                players: {
                    ...prepared.players,
                    '0': {
                        ...prepared.players['0'],
                        mana: 20,
                    },
                },
            },
            sys: setup.sys,
        };

        const cast = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3418,
                manaCost: 10,
                targetObjectId: target.id,
                statusTokenIds: [STATUS_TOKEN_IDS.ROT, STATUS_TOKEN_IDS.WEAK],
                statusTokenAmounts: {
                    [STATUS_TOKEN_IDS.ROT]: 1,
                    [STATUS_TOKEN_IDS.WEAK]: 1,
                },
                selectedEnchantmentObjectIds: [selectedToxinEnchantment.id],
            },
        });

        expect(getMageWarsSpellCardFromConfig(3418)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(cast.events.filter((event) => event.type === MAGE_WARS_EVENTS.STATUS_TOKEN_REMOVAL_AVAILABLE))
            .toHaveLength(2);
        expect(cast.events).toContainEqual(expect.objectContaining({
            type: MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE,
            payload: expect.objectContaining({
                targetObjectId: selectedToxinEnchantment.id,
                destructionKind: 'dispel',
            }),
        }));
        expect(cast.events.some((event) => event.type === MAGE_WARS_EVENTS.SPELL_OBJECT_DESTRUCTION_AVAILABLE
            && event.payload.targetObjectId === unselectedToxinEnchantment.id)).toBe(false);
        expect(cast.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.ROT]).toBe(1);
        expect(cast.state.core.objects[target.id].statusTokens[STATUS_TOKEN_IDS.WEAK]).toBeUndefined();
        expect(cast.state.core.objects[selectedToxinEnchantment.id]).toBeUndefined();
        expect(cast.state.core.objects[unselectedToxinEnchantment.id]).toBeDefined();
        expect(cast.state.core.players['0'].mana).toBe(10);
    });

    it('implements 3412 Enchantment Migration without changing enchantment control', () => {
        const oldTarget = makeArenaObject('enchantment-migration-old-target-0', '0', PLAYER_ZERO_START_ZONE);
        const newTarget = makeArenaObject('enchantment-migration-new-target-1', '1', PLAYER_ZERO_START_ZONE);
        const enchantment = makeVisibleEnchantmentObject(
            'enchantment-migration-source-0',
            '0',
            PLAYER_ZERO_START_ZONE,
            {
                sourceSpellCardId: 1800,
                sourceObjectId: 'spell-card-1800',
                anchoredToObjectId: oldTarget.id,
            },
        );
        const setup = setupState('creatureAction');
        const prepared = withPreparedPlayerMage(setup.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3412]);
        const state: MatchState<MageWarsCore> = {
            core: withArenaObject(
                withArenaObject(
                    withArenaObject(prepared, oldTarget),
                    newTarget,
                ),
                enchantment,
            ),
            sys: setup.sys,
        };

        const cast = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3412,
                manaCost: 1,
                targetObjectId: enchantment.id,
                newTargetObjectId: newTarget.id,
            },
        });

        expect(getMageWarsSpellCardFromConfig(3412)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(cast.events).toContainEqual(expect.objectContaining({
            type: MAGE_WARS_EVENTS.ENCHANTMENT_REATTACHED,
            payload: expect.objectContaining({
                objectId: enchantment.id,
                ownerId: '0',
                targetObjectId: newTarget.id,
            }),
        }));
        expect(cast.state.core.objects[enchantment.id]).toMatchObject({
            ownerId: '0',
            anchoredToObjectId: newTarget.id,
        });
        expect(cast.state.core.objects[enchantment.id].anchoredToObjectId).not.toBe(oldTarget.id);
    });

    it('implements 3500 Mana Drain as bounded dice drain transferred to the caster', () => {
        const state: MatchState<MageWarsCore> = {
            core: withPlayerInZone(
                withPreparedPlayerMage(setupState('creatureAction').core, '0', MAGE_IDS.WIZARD_APPRENTICE, [3500], 20),
                '1',
                PLAYER_ZERO_START_ZONE,
            ),
            sys: setupState('creatureAction').sys,
        };
        const targetManaBefore = state.core.players['1'].mana;

        const cast = runCommand(state, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId: 3500,
                manaCost: 16,
                targetPlayerId: '1',
            },
        });

        expect(cast.success).toBe(true);
        expect(getMageWarsSpellCardFromConfig(3500)?.requiresCodeSupport).toBe(false);
        expect(cast.state.core.players['1'].mana).toBe(0);
        expect(cast.state.core.players['0'].mana).toBe(4 + targetManaBefore);
        expect(cast.events.some((event) => event.type === MAGE_WARS_EVENTS.MANA_TRANSFERRED
            && event.payload.amount === targetManaBefore)).toBe(true);
    });

    it('implements 3722 Silverwood Longbow through the shared equipment attack chain', () => {
        const spellCardId = 3722;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const castState: MatchState<MageWarsCore> = {
            core: withPlayerInZone(planned.state.core, '1', ARENA_ZONE_IDS.B3),
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        };

        const cast = runCommand(castState, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 8,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(cast.state.core.objects)
            .find((object) => object.sourceSpellCardId === spellCardId);

        expect(getMageWarsSpellCardFromConfig(spellCardId)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(equipment).toMatchObject({
            kind: 'equipment',
            anchoredToPlayerId: '0',
            attackOrTraitLine: '伏特力之箭：完整行动远程 `1-2` 4 骰，穿刺+1',
            combatProfilesSource: 'config',
        });

        const attack = runCommand({
            core: cast.state.core,
            sys: { ...cast.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_EQUIPMENT_ATTACK,
            playerId: '0',
            payload: {
                equipmentObjectId: equipment!.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });
        const declared = attack.events.find((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED);

        expect(attack.success).toBe(true);
        expect(declared?.payload).toMatchObject({
            attackerObjectId: equipment!.id,
            attackProfileId: 'attack-0',
            attackName: '伏特力之箭',
            targetPlayerId: '1',
            diceResults: [3, 3, 3, 3],
            baseDamage: 12,
            actionCost: 'normal',
        });
        expect(attack.state.core.players['1'].damage).toBe(12);
    });

    it('implements 3712 Guardian Crown through the shared passive armor equipment chain', () => {
        const spellCardId = 3712;
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', MAGE_IDS.PRIESTESS_APPRENTICE),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const cast = runCommand({
            core: planned.state.core,
            sys: { ...planned.state.sys, phase: 'initiativeQuickcast' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 1,
                targetPlayerId: '0',
            },
        });
        const equipment = Object.values(cast.state.core.objects)
            .find((object) => object.sourceSpellCardId === spellCardId);

        expect(getMageWarsSpellCardFromConfig(spellCardId)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(equipment).toMatchObject({
            kind: 'equipment',
            name: '天护皇冠',
            anchoredToPlayerId: '0',
            attackOrTraitLine: '护甲+1',
        });
        expect(resolveMageWarsMageEquipmentArmor(cast.state.core, '0')).toBe(1);
    });

    it.each([
        { spellCardId: 2818, manaCost: 24, life: 14, armor: 3, name: '火焰领主阿德拉梅莱克' },
        { spellCardId: 2821, manaCost: 7, life: 5, armor: 0, name: '雪貂伙伴索斯鲁柯' },
    ])('implements $spellCardId $name through the shared creature summon chain', ({ spellCardId, manaCost, life, armor, name }) => {
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(
                planningState.core,
                '0',
                spellCardId === 2818 ? MAGE_IDS.WARLOCK_APPRENTICE : MAGE_IDS.BEASTMASTER_APPRENTICE,
            ),
            sys: planningState.sys,
        }, planCommand([spellCardId]));

        const summon = runCommand({
            core: {
                ...planned.state.core,
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        mana: Math.max(30, manaCost),
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const object = summon.state.core.objects[`mwobj-0-${spellCardId}-1`];

        expect(getMageWarsSpellCardFromConfig(spellCardId)?.requiresCodeSupport).toBe(false);
        expect(summon.success).toBe(true);
        expect(object).toMatchObject({
            kind: 'creature',
            name,
            sourceSpellCardId: spellCardId,
            life,
            armor,
            combatProfilesSource: 'config',
        });
        expect(getMageWarsObjectAttackProfile(object, 'attack-0')).toBeDefined();
        expect(summon.events.some((event) => event.type === MAGE_WARS_EVENTS.ARENA_OBJECT_SUMMONED)).toBe(true);
    });

    it.each([
        { spellCardId: 2806, mageId: MAGE_IDS.BEASTMASTER_APPRENTICE, manaCost: 16, name: '头狼赤爪' },
        { spellCardId: 2817, mageId: MAGE_IDS.PRIESTESS_APPRENTICE, manaCost: 21, name: '闪电天使瓦尔莎拉' },
        { spellCardId: 2910, mageId: MAGE_IDS.WARLOCK_APPRENTICE, manaCost: 16, name: '玛拉寇达' },
    ])('implements $spellCardId $name as a structured creature attack contract', ({ spellCardId, mageId, manaCost, name }) => {
        const planningState = setupState('planning');
        const planned = runCommand({
            core: withPlayerMage(planningState.core, '0', mageId),
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const summon = runCommand({
            core: {
                ...planned.state.core,
                players: {
                    ...planned.state.core.players,
                    '0': {
                        ...planned.state.core.players['0'],
                        mana: Math.max(20, manaCost),
                    },
                },
            },
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const object = summon.state.core.objects[`mwobj-0-${spellCardId}-1`];
        const attackProfile = getMageWarsObjectAttackProfile(object, 'attack-0');

        expect(getMageWarsSpellCardFromConfig(spellCardId)?.requiresCodeSupport).toBe(false);
        expect(summon.success).toBe(true);
        expect(object).toMatchObject({
            kind: 'creature',
            name,
            sourceSpellCardId: spellCardId,
            combatProfilesSource: 'config',
        });
        expect(attackProfile).toBeDefined();
        if (spellCardId === 2817) {
            expect(attackProfile?.damageTypes).toEqual(['闪电', 'aether']);
            expect(attackProfile?.statusEffects).toEqual(expect.arrayContaining([
                expect.objectContaining({ statusTokenId: 'daze', minEffectDie: 7 }),
                expect.objectContaining({ statusTokenId: 'stun', minEffectDie: 9 }),
            ]));
        }
        if (spellCardId === 2910) {
            expect(attackProfile?.pierce).toBe(1);
            expect(isMageWarsSlowArenaObject(summon.state.core, object)).toBe(true);
        }
    });

    it('implements 2902 Deathfang Vampire with its own melee vampiric trait', () => {
        const spellCardId = 2902;
        const planningState = setupState('planning');
        const preparedCore = withPlayerMage(planningState.core, '0', MAGE_IDS.WARLOCK_APPRENTICE);
        const planned = runCommand({
            core: {
                ...preparedCore,
                players: {
                    ...preparedCore.players,
                    '0': {
                        ...preparedCore.players['0'],
                        mana: 20,
                        damage: 4,
                    },
                },
            },
            sys: planningState.sys,
        }, planCommand([spellCardId]));
        const summoned = runCommand({
            core: withPlayerInZone(planned.state.core, '1', PLAYER_ZERO_START_ZONE),
            sys: { ...planned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.CAST_SPELL,
            playerId: '0',
            payload: {
                spellCardId,
                manaCost: 16,
                targetZoneId: PLAYER_ZERO_START_ZONE,
            },
        });
        const vampireId = `mwobj-0-${spellCardId}-1`;
        const vampire = summoned.state.core.objects[vampireId];
        const attacked = runCommand({
            core: {
                ...summoned.state.core,
                objects: {
                    ...summoned.state.core.objects,
                    [vampireId]: { ...vampire, actionReady: true },
                },
            },
            sys: { ...summoned.state.sys, phase: 'creatureAction' },
        }, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: vampireId,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(getMageWarsSpellCardFromConfig(spellCardId)?.requiresCodeSupport).toBe(false);
        expect(summoned.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({
                    attackerObjectId: vampireId,
                    vampiric: true,
                    diceResults: [3, 3, 3, 3, 3],
                    baseDamage: 15,
                }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_VAMPIRIC_HEALING_AVAILABLE,
                payload: expect.objectContaining({
                    spellCardId,
                    healing: 15,
                }),
            }),
        ]));
        expect(attacked.state.core.players['0'].damage).toBe(0);
    });

    it('implements 3413 Banish with upkeep ordering, attached-object transport, and action-readiness preservation', () => {
        const target = makeArenaObject('banish-target-1', '1', PLAYER_ZERO_START_ZONE, {
            actionReady: false,
            life: 8,
        });
        const attached = makeVisibleEnchantmentObject('banish-attached-enchantment-1', '1', PLAYER_ZERO_START_ZONE, {
            anchoredToObjectId: target.id,
        });
        const base = setupState('creatureAction');
        const state: MatchState<MageWarsCore> = {
            core: [target, attached].reduce(
                (core, object) => withArenaObject(core, object),
                withPreparedPlayerMage(base.core, '0', MAGE_IDS.WIZARD_APPRENTICE, [3413]),
            ),
            sys: base.sys,
        };
        const cast = runCommand(state, castObjectSpellCommand(3413, 14, target.id));
        const zoneAfterCast = cast.state.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)!;

        expect(getMageWarsSpellCardFromConfig(3413)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(cast.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_BANISHED,
                payload: expect.objectContaining({
                    objectId: target.id,
                    remainingTokens: 3,
                    returnToZoneId: PLAYER_ZERO_START_ZONE,
                }),
            }),
        ]));
        expect(cast.state.core.objects[target.id]).toMatchObject({
            banished: {
                remainingTokens: 3,
                returnToZoneId: PLAYER_ZERO_START_ZONE,
                sourceSpellCardId: 3413,
            },
            actionReady: false,
        });
        expect(zoneAfterCast.objectIds).not.toEqual(expect.arrayContaining([target.id, attached.id]));
        expect(validateCommand({
            ...cast.state,
            core: {
                ...cast.state.core,
                currentPlayerId: '1',
                phaseActorId: '1',
            },
        }, {
            type: MAGE_WARS_COMMANDS.MOVE_ARENA_OBJECT,
            playerId: '1',
            payload: { objectId: target.id, toZoneId: ARENA_ZONE_IDS.A2 },
        })).toBe('objectBanished');

        let current = cast.state;
        const upkeepResults = [];
        for (let index = 0; index < 3; index += 1) {
            current = {
                ...current,
                core: { ...current.core, phaseReadyPlayerIds: ['1'], phaseActorId: '0' },
                sys: { ...current.sys, phase: 'channel' },
            };
            const upkeep = runCommand(current, {
                type: FLOW_COMMANDS.ADVANCE_PHASE,
                playerId: '0',
                payload: {},
            });
            expect(upkeep.success).toBe(true);
            expect(upkeep.events).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    type: MAGE_WARS_EVENTS.ARENA_OBJECT_BANISH_TICKED,
                    payload: expect.objectContaining({ objectId: target.id }),
                }),
            ]));
            upkeepResults.push(upkeep);
            current = upkeep.state;
        }

        expect(upkeepResults[0].state.core.objects[target.id].banished?.remainingTokens).toBe(2);
        expect(upkeepResults[1].state.core.objects[target.id].banished?.remainingTokens).toBe(1);
        expect(current.core.objects[target.id].banished).toBeUndefined();
        expect(current.core.objects[target.id].actionReady).toBe(false);
        const restoredZone = current.core.arena.find((zone) => zone.id === PLAYER_ZERO_START_ZONE)!;
        expect(restoredZone.objectIds).toEqual(expect.arrayContaining([target.id, attached.id]));
    });

    it('implements 3416 Battle Fury as one optional quick melee attack after the next non-counterstrike melee attack', () => {
        const attacker = makeArenaObject('battle-fury-attacker-0', '0', PLAYER_ZERO_START_ZONE, {
            attackOrTraitLine: '利爪：快速近战 2 骰',
        });
        const base = setupState('creatureAction');
        const state: MatchState<MageWarsCore> = {
            core: withPlayerInZone(
                withArenaObject(
                    withPreparedPlayerMage(base.core, '0', MAGE_IDS.BEASTMASTER_APPRENTICE, [3416]),
                    attacker,
                ),
                '1',
                PLAYER_ZERO_START_ZONE,
            ),
            sys: base.sys,
        };
        const cast = runCommand(state, castObjectSpellCommand(3416, 5, attacker.id));
        const attacked = runCommand(cast.state, {
            type: MAGE_WARS_COMMANDS.DECLARE_OBJECT_ATTACK,
            playerId: '0',
            payload: {
                attackerObjectId: attacker.id,
                attackProfileId: 'attack-0',
                targetPlayerId: '1',
            },
        });

        expect(getMageWarsSpellCardFromConfig(3416)?.requiresCodeSupport).toBe(false);
        expect(cast.success).toBe(true);
        expect(attacked.success).toBe(true);
        expect(attacked.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.BATTLE_FURY_AVAILABLE,
                payload: expect.objectContaining({ attackerObjectId: attacker.id, roundNumber: 1 }),
            }),
        ]));
        const interaction = getSimpleChoicePrompt(attacked.state, 'mw.battle-fury.choice');
        expect(interaction).toBeDefined();
        const promptOptions = getPromptOptions(attacked.state);
        expect(promptOptions).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'pass' }),
            expect.objectContaining({ value: expect.objectContaining({ action: 'attack' }) }),
        ]));
        const attackOption = promptOptions.find((option) => (
            (option.value as { action?: string } | undefined)?.action === 'attack'
        ));
        expect(attackOption).toBeDefined();
        const extra = runCommand(attacked.state, {
            type: INTERACTION_COMMANDS.RESPOND,
            playerId: '0',
            payload: {
                interactionId: interaction!.id,
                optionId: attackOption!.id,
            },
        } as Command);

        expect(extra.success).toBe(true);
        expect(extra.events).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.BATTLE_FURY_CONSUMED,
                payload: expect.objectContaining({ attackerObjectId: attacker.id }),
            }),
            expect.objectContaining({
                type: MAGE_WARS_EVENTS.ARENA_OBJECT_ATTACK_DECLARED,
                payload: expect.objectContaining({ attackerObjectId: attacker.id }),
            }),
        ]));
        expect(extra.state.core.objects[attacker.id].temporaryTraits?.battleFuryRoundNumber).toBeUndefined();
    });
});
