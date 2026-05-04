import { expect, test } from '@playwright/test';

test.describe('dashboard spools', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		await page.evaluate(() => indexedDB.deleteDatabase('filament-tracker'));
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});

	test('creates a spool and shows it in the inventory grid', async ({ page }) => {
		await page.getByRole('button', { name: 'Add spool' }).click();
		await expect(page.getByRole('dialog', { name: 'Add spool' })).toBeVisible();

		await page.locator('#dashboard-spool-form-name').fill('E2E Spool');
		await page.locator('#dashboard-spool-form-color').fill('Blue');
		await page.locator('#dashboard-spool-form-hex').fill('#2563eb');
		await page.locator('#dashboard-spool-form-initial').fill('1000');
		await page.locator('#dashboard-spool-form-price').fill('24.99');

		await page.getByRole('button', { name: 'Save spool' }).click();

		await expect(page.getByRole('heading', { name: 'E2E Spool' })).toBeVisible();
		await expect(page.getByText('1000 g').first()).toBeVisible();
	});

	test('archiving removes the card after confirmation', async ({ page }) => {
		await page.getByRole('button', { name: 'Add spool' }).click();
		await page.locator('#dashboard-spool-form-name').fill('Archive Me');
		await page.locator('#dashboard-spool-form-color').fill('Grey');
		await page.locator('#dashboard-spool-form-initial').fill('500');
		await page.locator('#dashboard-spool-form-price').fill('19');

		await page.getByRole('button', { name: 'Save spool' }).click();
		await expect(page.getByRole('heading', { name: 'Archive Me' })).toBeVisible();

		page.once('dialog', (d) => d.accept());
		await page.getByRole('button', { name: 'Archive' }).click();

		await expect(page.getByRole('heading', { name: 'Archive Me' })).toHaveCount(0);
	});
});
