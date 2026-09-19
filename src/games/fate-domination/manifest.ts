import type { GameManifestEntry } from '../manifest.types';

export const FATE_DOMINATION_MOBILE_BOARD_SHELL_DESIGN_WIDTH_PX = 1920;
export const FATE_DOMINATION_MOBILE_BOARD_SHELL_DESIGN_HEIGHT_PX = 1080;

const entry: GameManifestEntry = {
    id: 'fate-domination',
    type: 'game',
    enabled: true,
    titleKey: 'games.fate-domination.title',
    descriptionKey: 'games.fate-domination.description',
    category: 'card',
    playersKey: 'games.fate-domination.players',
    icon: 'FD',
    thumbnailPath: 'fate-domination/thumbnails/cover',
    cursorTheme: 'fate-domination-table',
    allowLocalMode: true,
    playerOptions: [3, 4, 5, 6, 7],
    bestPlayers: [3, 4],
    tags: ['card_driven', 'tabletop', 'prototype'],
    setupOptions: {
        mode: {
            type: 'select',
            labelKey: 'games.fate-domination.setup.mode.label',
            options: [
                {
                    value: 'custom',
                    labelKey: 'games.fate-domination.setup.mode.custom',
                },
                {
                    value: '3x',
                    labelKey: 'games.fate-domination.setup.mode.threeX',
                },
            ],
            default: 'custom',
            presentation: 'segmented',
        },
    },
    mobileProfile: 'landscape-adapted',
    preferredOrientation: 'landscape',
    mobileLayoutPreset: 'board-shell',
    mobileBoardShellLayout: {
        designWidth: FATE_DOMINATION_MOBILE_BOARD_SHELL_DESIGN_WIDTH_PX,
        designHeight: FATE_DOMINATION_MOBILE_BOARD_SHELL_DESIGN_HEIGHT_PX,
    },
    shellTargets: ['pwa', 'app-webview', 'mini-program-webview'],
    ai: {
        capture: true,
        localAi: false,
        remoteAi: false,
    },
};

export const FATE_DOMINATION_MANIFEST: GameManifestEntry = entry;
export default entry;
