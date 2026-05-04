import { expect, test, type Page } from '@playwright/test';

test.describe('dashboard spools', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		await page.evaluate(() => indexedDB.deleteDatabase('filament-tracker'));
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
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
		await page.getByRole('button', { name: 'Archiver' }).click();

		await expect(page.getByRole('heading', { name: 'Archive Me' })).toHaveCount(0);
	});

	test('material filter and reset narrow inventory', async ({ page }) => {
		await createSpool(page, 'PLA Only');
		await createSpool(page, 'PETG Line', { catalogMaterial: 'PETG' });

		await expect(page.getByRole('heading', { name: 'PLA Only' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'PETG Line' })).toBeVisible();

		await page.locator('#filter-material').selectOption({ label: 'PETG' });

		await expect(page.getByRole('heading', { name: 'PETG Line' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'PLA Only' })).toHaveCount(0);

		await page.getByRole('button', { name: 'Réinitialiser les filtres' }).first().click();

		await expect(page.getByRole('heading', { name: 'PLA Only' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'PETG Line' })).toBeVisible();
	});

	test('shows empty-filter banner when no row matches filters', async ({ page }) => {
		await createSpool(page, 'Healthy Active');

		await page.locator('#filter-status').selectOption({ value: 'low' });

		await expect(page.getByRole('status')).toContainText('Aucun résultat pour ces filtres');
		await expect(page.getByRole('heading', { name: 'Healthy Active' })).toHaveCount(0);

		await page.getByRole('button', { name: 'Réinitialiser les filtres' }).first().click();

		await expect(page.getByRole('heading', { name: 'Healthy Active' })).toBeVisible();
	});

	test('quick print form persists usage and updates inventory', async ({ page }) => {
		await createSpool(page, 'Print Source');

		await page.getByRole('button', { name: 'Ajouter une impression' }).click();
		const printDialog = page.getByRole('dialog', { name: 'Ajouter une impression' });
		await printDialog.locator('#print-name').fill('Fast calibration cube');
		await printDialog.getByLabel('Bobine').selectOption({ label: 'Print Source (1000 g)' });
		await printDialog.getByLabel('Utilisé').fill('10');
		await printDialog.getByLabel('Rebut').fill('2');
		await printDialog.getByRole('button', { name: /Enregistrer l[\u2019']impression/ }).click();

		await expect(page.getByText('Impression enregistrée et stocks mis à jour.')).toBeVisible();
		await expect(page.getByText('Fast calibration cube')).toBeVisible();
		await expect(page.getByText('12 g')).toBeVisible();
		await expect(page.getByText('988 g')).toBeVisible();
	});
});

async function createSpool(
	page: Page,
	name: string,
	options: { initialWeightG?: string; price?: string; catalogMaterial?: string } = {},
) {
	await page.getByRole('button', { name: 'Ajouter une bobine' }).click();
	await expect(page.getByRole('dialog', { name: 'Ajouter une bobine' })).toBeVisible();

	await page.locator('#dashboard-spool-form-name').fill(name);
	if (options.catalogMaterial) {
		await page.locator('#dashboard-spool-form-mat-code').selectOption(options.catalogMaterial);
	}
	await page.locator('#dashboard-spool-form-color').fill('Blue');
	await page.locator('#dashboard-spool-form-hex').fill('#2563eb');
	await page.locator('#dashboard-spool-form-initial').fill(options.initialWeightG ?? '1000');
	await page.locator('#dashboard-spool-form-price').fill(options.price ?? '24.99');

	await page.getByRole('button', { name: 'Enregistrer la bobine' }).click();
}
