import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_SPOOL_INITIAL_WEIGHT_G } from '../src/lib/domain/index';
import { FILAMENT_TRACKER_INDEXED_DB_NAME } from '../src/lib/storage/db';

test.describe('dashboard spools', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		await page.evaluate(() => fetch('/api/local-db', { method: 'DELETE' }));
		await page.evaluate(
			([current, legacy]) => {
				indexedDB.deleteDatabase(current);
				indexedDB.deleteDatabase(legacy);
			},
			[FILAMENT_TRACKER_INDEXED_DB_NAME, 'filament-tracker'] as const,
		);
		await page.reload();
		await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
	});

	test('add spool modal prefills initial weight from product default', async ({ page }) => {
		await page.getByRole('button', { name: 'Ajouter une bobine' }).click();
		await expect(page.getByRole('dialog', { name: 'Ajouter une bobine' })).toBeVisible();
		await expect(page.locator('#dashboard-spool-form-initial')).toHaveValue(
			String(DEFAULT_SPOOL_INITIAL_WEIGHT_G),
		);
	});

	test('creates a spool and shows it in the inventory grid', async ({ page }) => {
		await createSpool(page, 'E2E Spool');

		await expect(page.getByRole('heading', { name: 'E2E Spool' })).toBeVisible();
		await expect(
			page.getByText(`${DEFAULT_SPOOL_INITIAL_WEIGHT_G} g`).first(),
		).toBeVisible();
	});

	test('restores inventory from the local JSON database in a fresh browser profile', async ({
		browser,
		page,
	}) => {
		await createSpool(page, 'JSON Source Spool');
		await expect(page.getByRole('heading', { name: 'JSON Source Spool' })).toBeVisible();

		const freshPage = await browser.newPage();
		await freshPage.goto('/dashboard');

		await expect(freshPage.getByRole('heading', { name: 'JSON Source Spool' })).toBeVisible();
		await freshPage.close();
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
		await printDialog.getByLabel("Nom de l'impression").fill('Fast calibration cube');
		await printDialog.getByLabel('Bobine').selectOption({
			label: `Print Source (${DEFAULT_SPOOL_INITIAL_WEIGHT_G} g)`,
		});
		await printDialog.getByLabel('Utilisé').fill('10');
		await printDialog.getByLabel('Rebut').fill('2');
		await printDialog.getByRole('button', { name: /Enregistrer l[\u2019']impression/ }).click();

		await expect(page.getByText('Impression enregistrée et stocks mis à jour.')).toBeVisible();
		await expect(page.getByText('Fast calibration cube')).toBeVisible();
		await expect(page.getByText('12 g')).toBeVisible();
		await expect(page.getByText('988 g')).toBeVisible();
	});

	test('print history lists saved prints with filters and detail', async ({ page }) => {
		await createSpool(page, 'History Source');

		await page.getByRole('button', { name: 'Ajouter une impression' }).click();
		const printDialog = page.getByRole('dialog', { name: 'Ajouter une impression' });
		await printDialog.getByLabel("Nom de l'impression").fill('History calibration cube');
		await printDialog.getByLabel("Date d'impression").fill('2026-05-04T00:30');
		await printDialog.getByLabel('Bobine').selectOption({
			label: `History Source (${DEFAULT_SPOOL_INITIAL_WEIGHT_G} g)`,
		});
		await printDialog.getByLabel('Utilisé').fill('10');
		await printDialog.getByLabel('Rebut').fill('2');
		await printDialog.getByRole('button', { name: /Enregistrer l[\u2019']impression/ }).click();
		await expect(page.getByText('Impression enregistrée et stocks mis à jour.')).toBeVisible();

		await page.goto('/prints');

		await expect(page.getByRole('heading', { name: 'Print history' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'History calibration cube' })).toBeVisible();
		await expect(page.getByText('12 g').first()).toBeVisible();
		await expect(page.getByText('0,30 €').first()).toBeVisible();

		await page.getByLabel('Spool').selectOption({ label: 'History Source' });
		await page.getByLabel('From').fill('2026-05-04');
		await expect(page.getByText('1 prints / 12 g / 0,30 €')).toBeVisible();

		await page.getByLabel('Status').selectOption('failed');
		await expect(page.getByRole('heading', { name: 'No prints match these filters' })).toBeVisible();
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
	await page.locator('#dashboard-spool-form-color').selectOption({ label: 'Bleu' });
	if (options.initialWeightG !== undefined) {
		await page.locator('#dashboard-spool-form-initial').fill(options.initialWeightG);
	}
	await page.locator('#dashboard-spool-form-price').fill(options.price ?? '24.99');

	await page.getByRole('button', { name: 'Enregistrer la bobine' }).click();
}
