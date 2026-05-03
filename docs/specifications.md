# Filament Tracker Specifications

## Objective

Build a web application that lets a 3D-printing user track how many grams of filament are consumed from each spool, add a print to a spool with minimal friction, and automatically calculate spool cost, remaining material, and usage history.

## Target User

The initial target user is an individual 3D-printing hobbyist or small workshop operator who owns multiple filament spools and wants a reliable view of:

- Which spools are available.
- How many grams remain on each spool.
- How much each print costs in material.
- Which prints consumed material from a specific spool.

## MVP Scope

The first version should focus on fast manual tracking, not printer integration.

Included:

- Create, edit, archive, and view filament spools.
- Record a 3D print against one or more spools.
- Calculate consumed grams, remaining grams, and material cost.
- Show a spool inventory dashboard.
- Show a per-spool usage history.
- Support common filament metadata: material, brand, color, price, total weight, and purchase date.

Excluded from MVP:

- Direct integration with slicers, OctoPrint, Klipper, Bambu, Prusa Connect, or printers.
- Barcode scanning.
- Multi-user collaboration.
- Stock reorder automation.
- Tax/accounting export.
- Cloud sync beyond normal app persistence.

## Core Concepts

### Spool

A spool represents one physical filament roll.

Fields:

- `id`: unique identifier.
- `name`: human-readable display name.
- `brand`: optional brand name.
- `material`: PLA, PETG, ABS, TPU, ASA, Nylon, PC, or custom.
- `color_name`: user-facing color label.
- `color_hex`: optional color swatch.
- `initial_weight_g`: usable filament weight in grams, typically 1000 g.
- `remaining_weight_g`: calculated or manually adjusted remaining filament.
- `purchase_price`: total purchase price.
- `currency`: default EUR unless configured otherwise.
- `purchase_date`: optional date.
- `supplier`: optional vendor.
- `diameter_mm`: 1.75 or 2.85.
- `density_g_cm3`: optional, useful for slicer conversions.
- `status`: active, low, empty, archived.
- `notes`: optional free text.
- `created_at` and `updated_at`.

Derived values:

- `used_weight_g = initial_weight_g - remaining_weight_g`.
- `usage_percent = used_weight_g / initial_weight_g`.
- `remaining_percent = remaining_weight_g / initial_weight_g`.
- `cost_per_gram = purchase_price / initial_weight_g`.

### Print

A print represents one completed or planned 3D print that consumes filament.

Fields:

- `id`: unique identifier.
- `name`: model or job name.
- `printed_at`: date and optional time.
- `status`: completed, failed, cancelled.
- `notes`: optional free text.
- `created_at` and `updated_at`.

### Print Filament Usage

A print can consume material from one or more spools.

Fields:

- `id`: unique identifier.
- `print_id`: linked print.
- `spool_id`: linked spool.
- `used_weight_g`: filament consumed in grams.
- `waste_weight_g`: optional failed/support/purge waste in grams.
- `cost`: calculated from the linked spool cost per gram.

Derived values:

- `total_consumed_g = used_weight_g + waste_weight_g`.
- `cost = total_consumed_g * spool.cost_per_gram`.

## Key Workflows

### Add a Spool

The user enters the spool details once when buying or opening a roll.

Required inputs:

- Name.
- Material.
- Initial weight in grams.
- Purchase price.

Recommended optional inputs:

- Brand.
- Color.
- Diameter.
- Purchase date.
- Supplier.

After saving, the spool appears in the active inventory with full remaining weight.

### Add a Print to a Spool

This is the most important workflow and must be fast.

Required inputs:

- Print name.
- Spool.
- Filament used in grams.

Optional inputs:

- Waste grams.
- Print date.
- Status.
- Notes.

On save:

- A print record is created.
- A usage record is linked to the selected spool.
- The spool remaining weight is reduced by `used_weight_g + waste_weight_g`.
- The material cost is calculated immediately.

Validation:

- Used grams must be greater than zero.
- Waste grams must be zero or greater.
- Total consumed grams should not exceed remaining spool weight unless the user confirms an override.

### Add a Multi-Material Print

The user can add multiple spool usage rows to the same print.

For each row:

- Select a spool.
- Enter used grams.
- Optionally enter waste grams.

The print total cost is the sum of all usage row costs.

### Adjust Remaining Weight

The user can manually correct a spool after weighing it or after tracking mistakes.

Fields:

- New remaining weight in grams.
- Reason or note.

The system should store an adjustment event so the usage history remains explainable.

### Archive or Empty a Spool

The user can mark a spool as empty or archived.

Rules:

- Empty spools should not appear as default choices when adding a print.
- Archived spools remain visible in history and reports.
- Historical print costs must not change when a spool is archived.

## Views

### Inventory Dashboard

Primary first screen.

Content:

- Active spools.
- Remaining grams.
- Remaining percentage.
- Estimated remaining material value.
- Material, brand, and color.
- Low-stock indicators.
- Quick action to add a print.

Useful filters:

- Material.
- Brand.
- Color.
- Status.
- Low stock only.

Useful sorting:

- Lowest remaining grams.
- Most recently used.
- Material.
- Brand.

### Spool Detail

Content:

- Spool metadata.
- Remaining grams and percentage.
- Cost per gram.
- Total consumed grams.
- Total material cost consumed.
- Print usage timeline.
- Manual adjustment history.

Actions:

- Add print.
- Edit spool.
- Adjust remaining weight.
- Mark empty.
- Archive.

### Add Print

This should be reachable from:

- Dashboard global action.
- A specific spool row.
- Spool detail page.

When launched from a spool, preselect that spool.

### Print History

Content:

- Print name.
- Date.
- Spool or spools used.
- Total grams consumed.
- Total material cost.
- Status.

Useful filters:

- Date range.
- Spool.
- Material.
- Status.

## Calculations

### Cost Per Gram

```text
cost_per_gram = purchase_price / initial_weight_g
```

Example:

- 24.99 EUR spool.
- 1000 g initial weight.
- Cost per gram: 0.02499 EUR.

### Print Cost

```text
print_usage_cost = (used_weight_g + waste_weight_g) * spool_cost_per_gram
print_total_cost = sum(print_usage_cost)
```

### Remaining Filament

```text
remaining_weight_g = initial_weight_g - tracked_consumption_g + manual_adjustments_g
```

Where:

- `tracked_consumption_g` is the sum of all usage rows linked to the spool.
- `manual_adjustments_g` is the net result of correction events.

### Low Stock

Default low-stock threshold:

- 15% remaining, or
- 100 g remaining,

whichever is reached first.

The threshold should be configurable later.

## Data Integrity Rules

- Print usage rows should store their calculated cost at creation time to preserve historical costs if a spool price is later edited.
- Editing a usage row must recalculate the linked spool remaining weight and stored usage cost.
- Deleting a print should restore the consumed grams to linked spools.
- Spool deletion should be restricted when usage history exists; archive should be preferred.
- All weights should be stored in grams as decimal numbers.
- Currency values should be stored as decimal values, not floating-point binary values.

## Non-Functional Requirements

- The app must work well on desktop and mobile.
- Adding a print should be possible in under 30 seconds for a normal single-spool print.
- The UI should optimize for scanning and repeated use.
- Data should persist reliably before adding integrations or automation.
- Validation messages should be clear and prevent silent inventory corruption.
- The app should support future local-first or cloud-backed persistence without changing the user-facing model.

## Suggested Implementation Phases

### Phase 1: Local MVP

- Spool CRUD.
- Single-spool print logging.
- Dashboard.
- Spool detail usage history.
- Basic calculations.

### Phase 2: Better Tracking

- Multi-spool prints.
- Manual adjustment events.
- Print history filters.
- Low-stock indicators.

### Phase 3: Import and Automation

- CSV import/export.
- Slicer estimate import.
- Optional printer ecosystem integrations.
- Reorder reminders.

## Open Questions

- Should the first version be local-only, authenticated cloud, or both?
- Should empty spool weight be tracked separately from usable filament weight?
- Which currency should be the default for the workspace?
- Should failed prints count as normal prints with status `failed`, or as waste-only usage?
- Should cost include electricity, printer depreciation, or only filament for now?
- Should users be able to define custom materials and default densities?
