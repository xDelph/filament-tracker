import { expect, test } from '@playwright/test';

test('dashboard placeholder is visible', async ({ page }) => {
	await page.goto('/dashboard');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
