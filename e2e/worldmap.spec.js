const { test, expect } = require('@playwright/test');

const quaternionAngle = (a, b) => {
    const dot = Math.abs(
        a[0] * b[0] +
        a[1] * b[1] +
        a[2] * b[2] +
        a[3] * b[3]
    );
    const clamped = Math.min(1, Math.max(-1, dot));
    return 2 * Math.acos(clamped);
};

test('worldmap drag does not jump after enabling north lock', async ({ page }) => {
    await page.goto('/map', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="worldmap-canvas"]');
    await page.waitForFunction(() => window.__worldmapDebug?.getQuaternion?.());

    await page.evaluate(() => window.__worldmapDebug?.setAutoRotate?.(false));

    const canvas = page.locator('[data-testid="worldmap-canvas"]');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    const start = {
        x: box.x + box.width * 0.55,
        y: box.y + box.height * 0.5
    };

    // First drag in normal mode to reproduce the issue context.
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 2);
    await page.mouse.up();
    await page.waitForTimeout(80);

    const compass = page.locator('[data-testid="worldmap-compass"]');
    await compass.click({ button: 'right' });
    await page.waitForTimeout(80);

    const qLockStart = await page.evaluate(() => window.__worldmapDebug.getQuaternion());
    expect(qLockStart).toBeTruthy();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 8, start.y + 1);
    await page.mouse.up();
    await page.waitForTimeout(50);

    const qLockEnd = await page.evaluate(() => window.__worldmapDebug.getQuaternion());
    expect(qLockEnd).toBeTruthy();

    const angle = quaternionAngle(qLockStart, qLockEnd);
    expect(angle).toBeLessThan(0.6);
});
