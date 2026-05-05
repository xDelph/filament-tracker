import { expect, test, type Page } from '@playwright/test';

test.describe('spool detail weight adjustment', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		await page.evaluate(() => indexedDB.deleteDatabase('filament-tracker'));
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
	});

	test('records a manual adjustment from the detail page', async ({ page }) => {
		await createSpool(page, 'Adjust Target');

		await page.getByRole('link', { name: 'Adjust Target' }).click();
		await expect(page.getByRole('heading', { name: 'Adjust Target' })).toBeVisible();

		await page.getByRole('button', { name: 'Adjust weight' }).click();
		const dialog = page.getByRole('dialog', { name: 'Adjust remaining weight' });
		await expect(dialog).toBeVisible();

		await dialog.getByLabel('New remaining (g)').fill('850');
		await dialog.getByLabel('Reason / note').fill('Kitchen scale verification.');
		await dialog.getByRole('button', { name: 'Save adjustment' }).click();

		await expect(page.getByText('Manual adjustment recorded.')).toBeVisible();
		await expect(page.getByText(/1000 g → 850 g/)).toBeVisible();
	});
});

async function createSpool(page: Page, name: string) {
	await page.getByRole('button', { name: 'Ajouter une bobine' }).click();
	await expect(page.getByRole('dialog', { name: 'Ajouter une bobine' })).toBeVisible();

	await page.locator('#dashboard-spool-form-name').fill(name);
	await page.locator('#dashboard-spool-form-color').fill('Blue');
	await page.locator('#dashboard-spool-form-hex').fill('#2563eb');
	await page.locator('#dashboard-spool-form-initial').fill('1000');
	await page.locator('#dashboard-spool-form-price').fill('24.99');

	await page.getByRole('button', { name: 'Enregistrer la bobine' }).click();
}
