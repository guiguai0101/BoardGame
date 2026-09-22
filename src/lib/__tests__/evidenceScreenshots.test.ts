import { describe, expect, it } from 'vitest';
import { getEvidenceScreenshotPath } from '../../../e2e/framework/evidenceScreenshots';

const testInfo = {
    file: 'D:/gongzuo/webgame/BoardGame/e2e/dicethrone/example.e2e.ts',
    title: '蜘蛛侠截图格式合同',
} as any;

describe('evidence screenshot format contract', () => {
    it('preserves a png filename when format is omitted', () => {
        expect(getEvidenceScreenshotPath(testInfo, '蜘蛛侠-牌桌', {
            filename: '蜘蛛侠-牌桌.png',
        })).toMatch(/蜘蛛侠-牌桌\.png$/);
    });

    it('uses png when the caller explicitly requests png without a filename', () => {
        expect(getEvidenceScreenshotPath(testInfo, '蜘蛛侠-牌桌', {
            format: 'png',
        })).toMatch(/蜘蛛侠-牌桌\.png$/);
    });

    it('rejects mismatched filename and requested format', () => {
        expect(() => getEvidenceScreenshotPath(testInfo, '蜘蛛侠-牌桌', {
            filename: '蜘蛛侠-牌桌.jpg',
            format: 'png',
        })).toThrow('文件名扩展名与 format 不一致');
    });
});
