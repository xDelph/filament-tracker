# Stratégie d’import d’historique : PrusaLink et Prusa Connect

Document de recherche technique pour nourrir Filament Tracker à partir des données déjà disponibles chez Prusa (LAN ou cloud).

## Recommandation (synthèse)

1. **Prusa Connect (API mobile officielle)** : c’est la seule voie qui expose un **liste de jobs imprimés** avec états temporels et lien fichier (`/api/v1/jobs`, filtre `printerJobStatus=past`). Spéc OpenAPI publique : [`https://connect-mobile-api.prusa3d.com/api/docs.jsonopenapi`](https://connect-mobile-api.prusa3d.com/api/docs.jsonopenapi).

2. **PrusaLink (OpenAPI officielle)** : utile pour **métadonnées G-code** (filament estimé en grammes, type, temps, etc.) pour les fichiers **encore présents** sur l’imprimante. Il **n’y a pas de journal d’impressions passées** : seuls l’état courant, le job courant et l’arborescence fichiers sont exposés. Spéc : [`prusa3d/Prusa-Link-Web` `spec/openapi.yaml`](https://github.com/prusa3d/Prusa-Link-Web/blob/master/spec/openapi.yaml).

3. **Stratégie produit réaliste** : viser **les deux sources en option** (l’utilisateur choisit « Connect » et/ou « Imprimante locale »), avec des **limites différentes** documentées à l’UI.

4. **Implémentation client** : **client minimal interne** (fetch + types Zod alignés sur les schémas OpenAPI) plutôt qu’une dépendance npm opaque. Les paquets `@jamesgopsill/prusa-link` et `prusalink-client` peuvent servir de **référence** ; le second est récent et sans dépôt public clair dans les métadonnées npm — **ne pas l’embarquer sans revue** de maintenance et de sécurité.

---

## PrusaLink : ce qu’on peut reconstruire

### Endpoints utiles pour l’import « fichiers restants »

| Endpoint | Rôle | Champs / contenu utiles pour Filament Tracker |
|----------|------|-----------------------------------------------|
| `GET /api/version` | Compatibilité / firmware | `api`, `firmware`, `printer`, `capabilities` |
| `GET /api/v1/info` | Contexte machine | `name`, `hostname`, `serial`, `nozzle_diameter`, … |
| `GET /api/v1/storage` | Volumes disponibles | `storage_list[]` : `path` (`/local`, …), `type`, `available` |
| `GET /api/v1/files/{storage}/{path}` | Métadonnées fichier / dossier | Pour `PRINT_FILE` : `meta` (objet `PrintFileMetadata` dans la spec) : `filament used [g]`, `filament_type`, `filament_type per tool`, `estimated_print_time`, `print_time`, `filament cost`, `printer_model`, `material_name`, `layer_height`, `m_timestamp`, `display_name`, etc. |
| `GET /api/v1/status` | État courant | `printer.state`, `job` (optionnel) : progression, temps |
| `GET /api/v1/job` | Job en cours | `file`, `meta`, `state`, `time_printing` — **pas d’historique** |

### Limites PrusaLink

- **Pas d’historique des impressions terminées** : impossible de lister « toutes les impressions des 12 derniers mois » si les G-code ne sont plus sur la machine.
- **`m_timestamp`** sur un fichier reflète la **dernière modification / présence** du fichier, **pas** la date de fin d’impression réelle (une impression peut être supprimée, un fichier recopié, etc.).
- **Fichiers supprimés** : aucune trace via l’API une fois partis du stockage vu par PrusaLink.
- **Réseau** : accès **LAN** (ou tunnel) ; l’appareil doit être joignable depuis l’environnement qui exécute le client.
- **Authentification** : **HTTP Digest** (schéma `digestAuth` dans la spec).
- **CORS** : les navigateurs n’appellent en général **pas** directement l’imprimante depuis une app web hébergée ; tout appel depuis le domaine du site nécessite un **proxy côté serveur** (SvelteKit `+server.ts`) ou une exécution **locale** (script, app desktop).
- **Multi-outil / MMU** : les champs `… per tool` dans `PrintFileMetadata` imposent une règle de fusion (somme par outil, ou une ligne `PrintFilamentUsage` par outil si on modélise plusieurs bobines).

---

## Prusa Connect : API publique documentée (mobile gateway)

### Authentification

- Schéma OpenAPI : **`client_jwt_token`** — clé API dans l’en-tête **`Authorization`** (valeur attendue par le backend mobile Prusa ; en pratique les outils communautaires utilisent un **JWT de session** obtenu depuis la session web — **stockage sensible**, rotation, ne jamais logger).

### Endpoints utiles pour l’historique / le contexte

| Endpoint | Rôle | Champs / remarques |
|----------|------|-------------------|
| `GET /api/v1/jobs` | Liste paginée des jobs | Query : `page`, `itemsPerPage`, `pagination`, `printer`, `state`, `printerJobStatus` (`past` \| `current`). Réponse : tableau de `Job`. |
| `GET /api/v1/jobs/{id}` | Détail d’un job | Même schéma `Job`. |
| `GET /api/v1/printers` | Imprimantes du compte | Pour résoudre `printerUuid` / noms. |
| `GET /api/v1/printers/{uuid}/detail` | Détail imprimante | Contexte machine côté Connect. |
| `GET /api/v1/storage/printer/{printerUuid}` | Fichiers vus par l’imprimante côté cloud | `files[].meta` : `filamentType`, `estimatedPrintTime`, `layerHeight`, etc. (exemple dans la spec ; **pas** de garantie `filament used [g]` dans l’exemple fourni). |

### Schéma `Job` (extrait des propriétés documentées)

- Identité : `id` (UUID), `connectId`, `printerUuid`, `printerName`, `printerType`, …
- Fichier : `fileName`, `fileHash`, `previewUrl`
- Temps : `startAt`, `endAt` (entiers — epoch secondes côté spec), `estimatedPrintTime`, `createdAt` (date-time ISO), `updatedAt`
- État : `state` parmi `PRINTING`, `PAUSED`, `FIN_STOPPED`, `FIN_ERROR`, `FIN_OK`, `FIN_HARVESTED`, `UNKNOWN`
- Autres : `progress`, `layerHeight`, `material` (chaîne, ex. type filament)

**Point important** : le schéma **ne documente pas** une consommation filament en grammes au niveau du job. Pour un import précis en grammes, il faudra :

- **Enrichir** avec les métadonnées G-code si `fileHash` / nom peut être rapproché d’un fichier PrusaLink ou d’une entrée storage Connect, ou
- **Demander à l’utilisateur** une estimation / un mapping manuel, ou
- **Accepter** que seul un ordre de grandeur (durée, type `material`) soit importé tant que le grammage n’est pas résolu.

### Limites Prusa Connect

- **Rétention** : la spec OpenAPI **ne fixe pas** la durée de conservation de l’historique. Les retours utilisateurs et outils tiers évoquent souvent une **fenêtre récente (de l’ordre de trois mois)** pour l’historique visible — à traiter comme **contrainte opérationnelle à valider empiriquement** lors des premiers imports, pas comme engagement contractuel.
- **Tolérateur de changement** : API version `0.0.1-dev` dans la spec téléchargée — prévoir versioning défensif et tests sur réponses réelles.
- **Confidentialité** : jetons d’accès personnels ; l’architecture doit éviter de **persister en clair** sur un backend tiers sans consentement explicite (import local ou chiffrement côté client à discuter dans les tickets d’implémentation).

---

## CORS et où exécuter le client

- **PrusaLink** : généralement **pas** appelable depuis le navigateur d’une app SaaS sans proxy (même origine LAN rare pour un site public).
- **Prusa Connect** : le serveur `connect-mobile-api.prusa3d.com` doit être appelé depuis un contexte où **Authorization** peut être défini sans fuite CSP/CORS problématique — en pratique **route serveur** (SvelteKit) ou **script local**.

Pour une app Filament Tracker **auto-hébergée / locale**, un `+server.ts` qui relaie les requêtes avec les identifiants fournis par l’utilisateur pour la session est cohérent.

---

## Format cible : `Print` et `PrintFilamentUsage`

Types actuels : `src/lib/domain/print.ts`, `src/lib/domain/print-filament-usage.ts`.

### `Print`

| Champ domaine | Source probable Prusa | Notes |
|---------------|----------------------|--------|
| `id` | — | **Nouvel UUID** généré côté Filament Tracker à l’import. |
| `name` | `fileName` / `display_name` | Tronquer à 200 caractères (contrainte schéma). |
| `printedAt` | `endAt` (Connect) ou dérivé | Connect : convertir epoch → **ISO 8601 avec offset** (`endAt` préféré si présent). PrusaLink seul : **approximation** à partir de `m_timestamp` ou saisie utilisateur — **à marquer** en note ou flag produit. |
| `status` | `state` (Connect) ou heuristique | Ex. `FIN_OK` → `completed` ; `FIN_ERROR` → `failed` ; `FIN_STOPPED` → `cancelled` ; états inconnus → défaut conservateur + `notes`. |
| `notes` | — | Ex. `Import Prusa Connect job <id>` ou avertissement « date approximative ». |
| `createdAt` / `updatedAt` | Horodatage import | ISO maintenant (ou politique d’audit du produit). |

### `PrintFilamentUsage`

| Champ domaine | Source probable | Notes |
|---------------|-----------------|--------|
| `id` | — | Nouvel UUID. |
| `printId` | ID du `Print` créé | Lien 1-n. |
| `spoolId` | — | **Obligatoire** ; l’API Prusa ne connaît pas les bobines Filament Tracker. L’import doit inclure une étape **« associer type/nom de filament → bobine existante »** (ou création guidée de bobine). |
| `usedWeightG` | `meta["filament used [g]"]` (PrusaLink) ou saisie | Doit être **> 0** (validation Zod). Si inconnu : **bloquer la ligne** ou forcer saisie. |
| `wasteWeightG` | défaut `0` | Sauf saisie utilisateur. |
| `cost` | `meta["filament cost"]` ou calcul | `MoneyMinor` : `minorUnits` entier + `currency` ISO 4217. Si Prusa ne fournit que le coût sans devise, **règle métier** : devise du profil utilisateur ou saisie obligatoire. |

### Multi-bobines

- G-code avec `filament used [g] per tool` : une ligne `PrintFilamentUsage` par outil, chacune mappée à une **bobine** choisie par l’utilisateur (ou une seule bobine si l’utilisateur fusionne — produit à trancher dans l’UI).

---

## Suite d’implémentation suggérée (sans ambiguïté)

1. **Connect** : flux « coller jeton / connexion session » + pagination `GET /api/v1/jobs?printerJobStatus=past` + mapping état → `Print.status`.
2. **Enrichissement grammage** : si `fileHash` ou nom coïncide avec fichier accessible en PrusaLink (optionnel, config URL + digest), récupérer `PrintFileInfo.meta` pour `usedWeightG`.
3. **PrusaLink seul** : assistant « parcourir stockage » + import des métadonnées fichier avec **avertissement date** + pas de liste de jobs historiques.
4. **Spool mapping** : écran ou fichier de correspondance `(material, couleur?, fabricant?) → spoolId` réutilisable entre imports.
5. **Sécurité & emplacement d’exécution** : décider officiellement proxy SvelteKit vs outil CLI pour les jetons Connect.

---

## Références

- PrusaLink OpenAPI : [`https://github.com/prusa3d/Prusa-Link-Web/blob/master/spec/openapi.yaml`](https://github.com/prusa3d/Prusa-Link-Web/blob/master/spec/openapi.yaml)
- Prusa Connect mobile API OpenAPI : [`https://connect-mobile-api.prusa3d.com/api/docs.jsonopenapi`](https://connect-mobile-api.prusa3d.com/api/docs.jsonopenapi)
- Paquets npm (référence uniquement) : [`@jamesgopsill/prusa-link`](https://www.npmjs.com/package/@jamesgopsill/prusa-link), [`prusalink-client`](https://www.npmjs.com/package/prusalink-client)
