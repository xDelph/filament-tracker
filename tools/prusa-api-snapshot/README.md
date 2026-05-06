# Prusa API snapshot (local)

Petit utilitaire **Bun** à côté de l’app SvelteKit : une fois le fichier `.env` rempli, il appelle les endpoints PrusaLink (digest) et Prusa Connect (Bearer JWT) documentés pour l’étude d’import, puis écrit **un JSON unique** que tu peux partager (sans secrets : mots de passe et jetons ne sont jamais écrits dans le fichier de sortie).

## Installation

```sh
cd tools/prusa-api-snapshot
bun install
cp .env.example .env
# Éditer .env puis :
bun run snapshot
```

Le fichier généré par défaut : `out/prusa-snapshot.json` (surchargeable avec `OUTPUT_PATH`).

## Variables d’environnement

Voir `.env.example`. Résumé :

| Variable | Rôle |
|----------|------|
| `PRUSALINK_ENABLED` | `true` pour interroger l’imprimante en LAN |
| `PRUSALINK_BASE_URL` | Ex. `http://192.168.1.42` (sans slash final) |
| `PRUSALINK_USER` | Souvent `maker` |
| `PRUSALINK_PASSWORD` | Mot de passe API PrusaLink |
| `PRUSALINK_BASIC_AUTH` | `true` uniquement si ton instance utilise Basic au lieu de Digest |
| `PRUSALINK_MAX_PRINT_FILE_SAMPLES` | Limite d’exemples fichiers avec méta complète (défaut 80) |
| `PRUSA_CONNECT_ENABLED` | `true` pour l’API mobile `connect-mobile-api.prusa3d.com` |
| `PRUSA_CONNECT_BEARER_TOKEN` | JWT (session navigateur ; ne pas commiter) |
| `PRUSA_CONNECT_BASE_URL` | Défaut production officielle |
| `PRUSA_CONNECT_ITEMS_PER_PAGE` | Pagination |
| `PRUSA_CONNECT_MAX_PAGES` | Garde-fou par collection |
| `OUTPUT_PATH` | Chemin du JSON sortant |

## Contenu du JSON

- **PrusaLink** : `/api/version`, `/api/v1/info`, `/api/v1/status`, `/api/v1/job`, `/api/v1/storage`, puis pour chaque volume connu un parcours récursif des dossiers et des échantillons `PRINT_FILE` avec métadonnées.
- **Prusa Connect** : imprimantes paginées, jobs `past` et `current` paginés, détail par imprimante, première page de stockage par imprimante.

Les erreurs HTTP (401, etc.) apparaissent sous forme d’objets `{ ok: false, ... }` dans la sortie pour diagnostic.

## Vérification statique

```sh
bun run check
```
