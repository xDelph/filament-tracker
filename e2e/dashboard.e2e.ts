import { expect, test, type Page } from '@playwright/test';

test.describe('dashboard spools', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		await page.evaluate(() => indexedDB.deleteDatabase('filament-tracker'));
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
	});

	test('creates a spool and shows it in the inventory grid', async ({ page }) => {
		await createSpool(page, 'E2E Spool');

		await expect(page.getByRole('heading', { name: 'E2E Spool' })).toBeVisible();
		await expect(page.getByText('1000 g').first()).toBeVisible();
	});

	test('archiving removes the card after confirmation', async ({ page }) => {
		await createSpool(page, 'Archive Me', { initialWeightG: '500', price: '19' });
		await expect(page.getByRole('heading', { name: 'Archive Me' })).toBeVisible();

		page.once('dialog', (d) => d.accept());
		await page.getByRole('button', { name: 'Archive' }).click();

		await expect(page.getByRole('heading', { name: 'Archive Me' })).toHaveCount(0);
	});

	test('quick print form persists usage and updates inventory', async ({ page }) => {
		await createSpool(page, 'Print Source');

		await page.getByRole('button', { name: 'Add print' }).click();
		await page.getByLabel('Print name').fill('Fast calibration cube');
		await page.getByLabel('Spool').selectOption({ label: 'Print Source (1000 g)' });
		await page.getByLabel('Used').fill('10');
		await page.getByLabel('Waste').fill('2');
		await page.getByRole('button', { name: 'Save print' }).click();

		await expect(page.getByText('Print saved and spool inventory updated.')).toBeVisible();
		await expect(page.getByText('Fast calibration cube')).toBeVisible();
		await expect(page.getByText('12 g')).toBeVisible();
		await expect(page.getByText('988 g')).toBeVisible();
	});
});

async function createSpool(
	page: Page,
	name: string,
	options: { initialWeightG?: string; price?: string } = {},
) {
	await page.getByRole('button', { name: 'Add spool' }).click();
	await expect(page.getByRole('dialog', { name: 'Add spool' })).toBeVisible();

	await page.locator('#dashboard-spool-form-name').fill(name);
	await page.locator('#dashboard-spool-form-color').fill('Blue');
	await page.locator('#dashboard-spool-form-hex').fill('#2563eb');
	await page.locator('#dashboard-spool-form-initial').fill(options.initialWeightG ?? '1000');
	await page.locator('#dashboard-spool-form-price').fill(options.price ?? '24.99');

	await page.getByRole('button', { name: 'Save spool' }).click();
}
