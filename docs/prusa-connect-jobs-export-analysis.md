# Analyse export Prusa Connect jobs

Source analysee : `prusa_connect_jobs.json`, export Prusa Connect fourni pour enrichir `filament-tracker` apres le premier import local.

## Resume

L'export est exploitable au-dela des donnees deja importees. Il contient 94 jobs imprimes entre le 1 avril 2026 et le 7 mai 2026, tous associes a une meme imprimante (`printer_uuid`) et a du PLA. Les metadonnees fichier (`jobs[].file.meta`) sont riches et presque toujours presentes : consommation filament, cout slicer, duree estimee, layer height, nozzle, temperatures, support, infill, hauteur, objets STL, modele imprimante.

Le schema actuel ne conserve que l'essentiel :

- `Print` : nom, date, statut, notes.
- `PrintFilamentUsage` : grammes utilises, cout, bobine.
- Bobines synthetiques par type de filament pour rendre l'import valide.

Les informations restantes doivent etre modelisees explicitement, car les stocker dans `notes` rendrait impossible le filtrage, les stats et l'affichage detaille.

## Structure observee

Racine :

- `jobs[]` : 94 lignes.
- `pager` : `{ limit: 250, offset: 0, total: 94 }`.

Statuts :

- `FIN_OK` : 86 jobs.
- `FIN_STOPPED` : 8 jobs.
- Aucun `FIN_ERROR` dans ce fichier.

Sources :

- `CONNECT_USER` : 89 jobs avec bloc `planned`.
- `UNKNOWN` : 5 jobs sans `planned`.

Deduplication :

- 94 `lifetime_id` uniques.
- 91 `hash` fichier uniques.
- 91 noms de fichiers uniques.
- 3 fichiers/hashs apparaissent deux fois, typiquement une tentative stoppee suivie d'une impression terminee. La cle primaire d'import doit donc etre le job (`lifetime_id` ou `id`), pas le hash fichier.

## Donnees directement exploitables

### Job Prusa Connect

Champs pertinents au niveau `jobs[]` :

- `id`, `origin_id` : identifiants numeriques Connect.
- `lifetime_id` : UUID stable par job, bon candidat pour `externalJobId`.
- `printer_uuid` : identifiant imprimante.
- `path` : chemin court sur l'imprimante, ex. `/usb/PLA~8F4A.BGC`.
- `state` : etat final Connect (`FIN_OK`, `FIN_STOPPED`, etc.).
- `hash` : hash du fichier imprime.
- `team_id` : identifiant equipe Connect, a considerer sensible ou au moins non necessaire au produit.
- `time_printing` : duree d'impression effective en secondes.
- `start`, `end` : timestamps Unix secondes.
- `source` : origine du job (`CONNECT_USER`, `UNKNOWN`).
- `print_height` : valeur brute fournie par Connect. Elle ne correspond pas toujours a `total_height / layer_height` et semble etre une valeur interne ou de progression. A conserver brute avant d'en faire une metrique "layer failed".

Champs a ne pas persister par defaut :

- `source_info` et `owner` : contiennent identite utilisateur, nom public et avatar.

### Fichier imprime

Champs pertinents au niveau `jobs[].file` :

- `type`, `name`, `display_name`.
- `size`.
- `hash`.
- `upload_id`, `uploaded` quand presents.
- `preview_url`, `preview_mimetype`.
- `path`, `display_path`.
- `sync.synced`, `sync.source`, `sync.synced_by.firmware`, `sync.synced_by.device_type`.

Les champs `planned.file` reprennent generalement le meme fichier que `file`. Pour l'import, `file` doit rester la source principale et `planned` servir seulement a enrichir les conditions de planification.

### Metadonnees slicer

Couverture des principaux champs `jobs[].file.meta` :

| Champ | Couverture | Usage produit |
| --- | ---: | --- |
| `filament_used_g` | 94/94 | consommation actuelle, deja importee |
| `filament_used_mm`, `filament_used_m`, `filament_used_mm3`, `filament_used_cm3` | 94/94 | stats avancees / controle de coherence |
| `filament_cost` | 94/94 | cout slicer, deja converti en monnaie mineure |
| `filament_type` | 94/94 | mapping matiere/bobine, tous `PLA` ici |
| `estimated_print_time` | 94/94 | duree estimee secondes |
| `estimated_printing_time_normal_mode` | 94/94 | libelle humain, non necessaire si on garde les secondes |
| `layer_height` | 94/94 | taille de couche |
| `nozzle_diameter` | 94/94 | diametre nozzle, tous `0.4` ici |
| `total_height`, `max_layer_z` | 94/94 | hauteur modele / hauteur max Z |
| `printer_model` | 94/94 | modele imprimante |
| `objects_info.objects[].name` | 93/94 | fichiers/objets STL |
| `fill_density` | 93/94 | infill, chaine avec `%` |
| `support_material` | 93/94 | support active/desactive (`0`/`1`) |
| `temperature`, `bed_temperature` | 93/94 | temperatures nozzle/bed |
| `brim_width` | 94/94 | largeur brim |
| `ironing` | 93/94 | ironing active/desactive (`0`/`1`) |
| `nozzle_high_flow` | 93/94 | nozzle high flow (`1` ici) |
| `filament_abrasive` | 93/94 | filament abrasif (`0` ici) |
| `extruder_colour` | 3/94 | couleur extrudeur, rare dans cet export |

Une seule ligne (`id: 43`, fichier `Untitled_0.4n_0.2mm_PLA_Prusa CORE One L_39m29s.gcode`) manque les champs optionnels listes a 93/94.

Valeurs observees :

- Layer height : `0.1` (1), `0.15` (4), `0.2` (64), `0.25` (23), `0.28` (2).
- Nozzle : `0.4` pour 94/94.
- Filament : `PLA` pour 94/94.
- Printer model : `COREONEL` (93), `Prusa CORE One L` (1).
- Temperature nozzle : `220`, `225`, `230`, `235` avec une valeur manquante.
- Temperature bed : `55`, `60` avec une valeur manquante.
- Support material : `1` pour 76 jobs, `0` pour 17, manquant pour 1.

Totaux de l'export :

- Filament consomme declare : 6458.57 g.
- Temps d'impression effectif (`time_printing`) : 737815 s, soit environ 204.95 h.
- Temps estime slicer : 741263 s, soit environ 205.91 h.

## Cas `FIN_STOPPED` et "layer fail"

Les 8 jobs stoppees contiennent `time_printing`, `start`, `end`, `print_height`, `total_height`, `layer_height` et `estimated_print_time`.

Il ne faut pas encore nommer `print_height` "nombre de layers fails" dans le domaine :

- Sur certains jobs stoppees, `print_height` vaut `0`.
- Sur d'autres, `print_height` vaut `67`, `117` ou `299`, valeurs qui ne correspondent pas directement au nombre total de couches estime (`total_height / layer_height`).
- Des jobs termines ont aussi des valeurs `print_height` similaires.

Specification recommandee : importer `print_height` dans un champ brut documente (`connectPrintHeightRaw` ou `connectProgressHeightRaw`) et ajouter plus tard une interpretation UI seulement apres validation avec d'autres exports ou la documentation API.

## Evolutions de schema recommandees

### 1. Ajouter une identite d'import externe

Objectif : rendre les imports idempotents et eviter les doublons.

Champs proposes sur `Print` ou table separee `printExternalRefs` :

- `source`: enum, ex. `manual`, `prusa_connect`.
- `externalJobId`: `lifetime_id`.
- `externalConnectId`: `id`.
- `externalOriginId`: `origin_id`.
- `fileHash`: `hash`.
- `importedAt`: date ISO.

Contrainte recommandee : unicite logique `(source, externalJobId)`.

### 2. Ajouter les temps reels et estimes

Champs proposes sur `Print` :

- `startedAt` : ISO depuis `start`.
- `finishedAt` : ISO depuis `end`, peut alimenter `printedAt`.
- `timePrintingSec` : `time_printing`.
- `elapsedSec` : `end - start`.
- `estimatedPrintTimeSec` : `file.meta.estimated_print_time`.

Ces champs permettent stats par duree, comparaison estimation/reel, et meilleure analyse des echecs.

### 3. Ajouter une entite imprimante

Nouvelle table `printers` :

- `id` UUID local.
- `source`, `externalPrinterUuid`.
- `model`.
- `displayName` optionnel.
- `createdAt`, `updatedAt`.

Champ `printerId` optionnel sur `Print`.

Dans cet export, une seule imprimante est observee, mais le schema doit supporter plusieurs imprimantes.

### 4. Ajouter les reglages slicer d'une impression

Option : table 1-1 `printSettings` liee a `printId`, pour eviter de gonfler `Print`.

Champs proposes :

- `nozzleDiameterMm`.
- `nozzleHighFlow`.
- `layerHeightMm`.
- `totalHeightMm`.
- `maxLayerZMm`.
- `fillDensityPercent` (parser `"15%"` en `15`, conserver le brut si parse impossible).
- `supportMaterial`.
- `brimWidthMm`.
- `ironing`.
- `nozzleTemperatureC`.
- `bedTemperatureC`.
- `filamentAbrasive`.
- `printerModelRaw`.
- `connectPrintHeightRaw`.

### 5. Ajouter les fichiers et objets imprimes

Nouvelle table `printFiles` ou champs sur `Print` si un seul fichier par print reste garanti :

- `printId`.
- `fileName`.
- `displayName`.
- `displayPath`.
- `path`.
- `sizeBytes`.
- `hash`.
- `uploadId`.
- `uploadedAt`.
- `previewUrl`.
- `previewMimeType`.

Nouvelle table `printObjects` :

- `printId`.
- `name`.
- `position` ou `quantity`.

Important : `objects_info.objects` peut contenir plusieurs occurrences du meme nom. Il faut decider si l'UI veut afficher les occurrences exactes ou une aggregation `{ name, quantity }`.

### 6. Enrichir `PrintFilamentUsage`

Les champs actuels suffisent pour le MVP, mais l'export fournit plus d'unites utiles :

- `usedLengthMm`.
- `usedVolumeMm3`.
- `usedVolumeCm3`.
- `slicerCost` ou `sourceCost`.
- `sourceCurrency` a resoudre : l'export ne donne pas la devise.

Le cout actuel peut rester le cout local calcule ou importe. Si on garde le cout slicer, il faut le distinguer du cout calcule depuis la bobine reelle.

### 7. Modeliser les conditions planifiees si necessaire

`planned.conditions` contient :

- `material_type.actual/expected`.
- `nozzle_diameter.actual/expected`.
- `file_in_cache`, `printer_ready`, `wait_until`, `printer_not_locked`.

Ces donnees sont secondaires pour l'inventaire filament. A importer seulement si une vue "diagnostic Prusa Connect" est prevue.

## Adaptations importer

1. Etendre le parseur `PrusaJobRow` dans `src/lib/storage/prusa-connect-jobs-import.ts` avec les champs ci-dessus, en gardant tous les champs optionnels.
2. Remplacer la creation uniquement via `notes` par une vraie projection vers `Print`, `PrintFilamentUsage`, `Printer`, `PrintSettings`, `PrintFile`, `PrintObject`.
3. Ajouter une strategie d'idempotence avant insertion : chercher `(source, externalJobId)` et ignorer/mettre a jour selon decision produit.
4. Conserver l'omission volontaire de `source_info` et `owner`.
5. Ajouter des tests avec au moins :
   - un job `FIN_OK` complet ;
   - un job `FIN_STOPPED` ;
   - le job incomplet `id: 43` ;
   - deux jobs partageant le meme hash mais pas le meme `lifetime_id`.
6. Incrementer `LOCAL_JSON_DB_SCHEMA_VERSION` et fournir une migration locale JSON/IndexedDB.

## Specifications produit a trancher

- Le cout a afficher doit-il etre le cout slicer (`filament_cost`) ou le cout calcule depuis la bobine Filament Tracker ?
- Les objets STL doivent-ils etre affiches comme liste exacte ou agreges par quantite ?
- Les jobs `FIN_STOPPED` doivent-ils consommer du filament automatiquement ? L'export donne `filament_used_g` du fichier complet, pas forcement la consommation reelle de la tentative stoppee.
- Comment mapper `PLA` vers une bobine reelle quand plusieurs bobines PLA existent ? La creation de bobines synthetiques est utile pour importer, mais insuffisante pour un suivi reel.
- Faut-il conserver les URLs de preview Prusa Connect ? Elles peuvent dependre d'une session ou exposer un chemin cloud.

