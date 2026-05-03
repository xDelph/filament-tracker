# Decoupage d'issues MVP

## Objectif du decoupage

Decouper le MVP de Filament Tracker pour permettre a plusieurs agents de travailler en parallele sans se bloquer inutilement.

Le principe recommande est de separer :

- le socle technique,
- le modele de donnees,
- les composants UI reutilisables,
- les ecrans metier,
- les calculs,
- les tests,
- puis l'assemblage final.

## Hypotheses de depart

- La branche de base est `develop`.
- Chaque issue de realisation part de `develop`.
- Les issues qui touchent au meme fichier critique doivent etre sequencees pour eviter les conflits.
- La stack cible est definie dans `docs/technical-stack.md`.
- Le MVP est single-user.
- Les donnees minimales sont les bobines, les impressions, les consommations de filament, et les ajustements manuels.
- Les couts couvrent uniquement le filament.
- Les poids sont stockes en grammes.

## Chemin critique

Ces issues doivent etre faites en premier ou presque, car elles debloquent le reste.

### Issue 1: Initialiser l'application web

Objectif:

Mettre en place le squelette applicatif, les commandes de dev/test/build, le layout global et une page d'accueil minimale.

Livrables:

- Stack web initialisee.
- Commandes documentees.
- Layout applicatif de base.
- Navigation minimale.
- Page placeholder pour le dashboard.

Dependances:

- Aucune, a part `develop`.

Peut etre parallelisee avec:

- Issue 2 si les conventions de stack sont connues.
- Issue 3 si les tokens UI sont independants.

### Issue 2: Definir le modele de donnees et les types metier

Objectif:

Creer les types, schemas ou modeles pour `Spool`, `Print`, `PrintFilamentUsage` et `SpoolAdjustment`.

Livrables:

- Types ou schemas metier.
- Enums pour material, spool status et print status.
- Validation de base des champs.
- Donnees de seed ou fixtures de test.

Dependances:

- Aucune stricte si la stack est connue.

Peut etre parallelisee avec:

- Issue 1.
- Issue 3.

### Issue 3: Creer le design system minimal

Objectif:

Creer les composants UI reutilisables necessaires au MVP.

Livrables:

- Boutons.
- Inputs numeriques et texte.
- Selects.
- Badges de statut.
- Swatches couleur.
- Cards de bobine.
- Table ou liste compacte.
- Modal ou drawer de formulaire si retenu.

Dependances:

- Issue 1 pour l'integration finale, mais le travail peut demarrer en parallele si la stack est fixee.

Peut etre parallelisee avec:

- Issue 2.
- Issue 4 en utilisant des composants provisoires.

## Issues metier parallelisables

Ces issues peuvent etre prises par differents agents une fois le socle minimum pose.

### Issue 4: Implementer la gestion des bobines

Objectif:

Permettre de creer, modifier, lister, archiver et marquer vide une bobine.

Livrables:

- Formulaire de creation et edition de bobine.
- Liste des bobines actives.
- Actions archive et empty.
- Validation des poids et prix.

Dependances:

- Issue 2.
- Issue 3 recommandee.

Peut etre parallelisee avec:

- Issue 5 si les contrats de donnees sont stabilises.
- Issue 6 si les fonctions de calcul sont separees.

### Issue 5: Implementer l'ajout rapide d'une impression

Objectif:

Permettre d'ajouter une impression en moins de 30 secondes, avec une ou plusieurs bobines.

Livrables:

- Formulaire d'ajout d'impression.
- Selection d'une ou plusieurs bobines.
- Saisie des grammes consommes et des grammes de dechet.
- Statut completed, failed, cancelled.
- Preselection d'une bobine quand le formulaire est ouvert depuis son detail.

Dependances:

- Issue 2.
- Issue 4 pour un flux complet, mais peut demarrer avec fixtures.

Peut etre parallelisee avec:

- Issue 6.
- Issue 7.

### Issue 6: Implementer les calculs d'inventaire et de cout

Objectif:

Centraliser les calculs pour eviter que l'UI duplique la logique metier.

Livrables:

- Cout par gramme.
- Cout par consommation.
- Cout total d'une impression.
- Poids restant.
- Pourcentage restant.
- Detection low-stock.
- Tests unitaires sur les cas limites.

Dependances:

- Issue 2.

Peut etre parallelisee avec:

- Issue 4.
- Issue 5.
- Issue 7.

### Issue 7: Implementer le dashboard d'inventaire

Objectif:

Faire du dashboard l'ecran principal de consultation et d'action rapide.

Livrables:

- Liste des bobines actives.
- Grammes restants.
- Pourcentage restant.
- Cout restant estime.
- Indicateur low-stock.
- Filtres material, status, low-stock.
- Tri par stock restant et derniere utilisation.
- Action rapide add print.

Dependances:

- Issue 2.
- Issue 3.
- Issue 6 pour les valeurs calculees.

Peut etre parallelisee avec:

- Issue 8.

### Issue 8: Implementer la page detail bobine

Objectif:

Donner une vue auditable des informations et de l'historique d'une bobine.

Livrables:

- Metadata de la bobine.
- Restant, utilise, pourcentage, cout par gramme.
- Historique des impressions liees.
- Historique des ajustements manuels.
- Actions add print, edit, adjust, mark empty, archive.

Dependances:

- Issue 2.
- Issue 4.
- Issue 6.

Peut etre parallelisee avec:

- Issue 7.
- Issue 9.

### Issue 9: Implementer les ajustements manuels de poids

Objectif:

Permettre de corriger le stock restant sans casser l'historique.

Livrables:

- Formulaire d'ajustement.
- Raison ou note d'ajustement.
- Evenement d'ajustement stocke.
- Recalcul du poids restant.
- Affichage dans le detail bobine.

Dependances:

- Issue 2.
- Issue 6.
- Issue 8 pour l'affichage final, mais la logique peut etre developpee separement.

Peut etre parallelisee avec:

- Issue 7.
- Issue 10.

### Issue 10: Implementer l'historique des impressions

Objectif:

Permettre de retrouver les impressions et leurs couts.

Livrables:

- Liste des impressions.
- Date, statut, bobines utilisees, grammes, cout total.
- Filtres par date, bobine, material, statut.
- Detail simple d'une impression.

Dependances:

- Issue 2.
- Issue 5.
- Issue 6.

Peut etre parallelisee avec:

- Issue 7.
- Issue 8.

## Issues de qualite et integration

Ces issues doivent arriver apres les fondations, mais certaines peuvent demarrer tot avec des fixtures.

### Issue 11: Ajouter les tests metier et parcours critiques

Objectif:

Verifier que les calculs et les workflows principaux restent fiables.

Livrables:

- Tests unitaires des calculs.
- Tests de validation de formulaire.
- Tests de creation bobine.
- Tests d'ajout impression.
- Tests de correction de stock.
- Tests de non-regression sur over-consumption.

Dependances:

- Issue 2.
- Issue 6.
- Les tests end-to-end dependent d'Issue 4 et Issue 5.

Peut etre parallelisee avec:

- Issues 4 a 10 une fois les contrats stabilises.

### Issue 12: Integrer le flux MVP complet

Objectif:

Assembler les pieces et valider que le parcours complet fonctionne de bout en bout.

Parcours cible:

1. Creer une bobine.
2. Voir la bobine dans le dashboard.
3. Ajouter une impression depuis cette bobine.
4. Constater la baisse du poids restant.
5. Voir le cout de l'impression.
6. Corriger manuellement le poids restant.
7. Retrouver l'historique dans la page detail.

Dependances:

- Issues 1 a 10.

Peut etre parallelisee avec:

- Issue 11 sur les tests non bloquants.

## Proposition de vagues de travail

### Vague 1: Fondations

Peut etre lancee en parallele:

- Issue 1: Initialiser l'application web.
- Issue 2: Definir le modele de donnees et les types metier.
- Issue 3: Creer le design system minimal.

### Vague 2: Coeur metier

Peut etre lancee quand Issue 2 est suffisamment stable:

- Issue 4: Gestion des bobines.
- Issue 5: Ajout rapide d'une impression.
- Issue 6: Calculs d'inventaire et de cout.

### Vague 3: Consultation et correction

Peut etre lancee quand les contrats de donnees et calculs sont poses:

- Issue 7: Dashboard d'inventaire.
- Issue 8: Page detail bobine.
- Issue 9: Ajustements manuels.
- Issue 10: Historique des impressions.

### Vague 4: Stabilisation

A lancer une fois les parcours metier assemblables:

- Issue 11: Tests metier et parcours critiques.
- Issue 12: Integration du flux MVP complet.

## Issues a eviter au debut

Ces sujets sont utiles mais risquent de ralentir le MVP s'ils arrivent trop tot:

- Authentification et multi-user.
- Integrations imprimante ou slicer.
- Import/export complet.
- Gestion avancee des fournisseurs.
- Gestion du cout hors filament.
- Notifications et rappels de reapprovisionnement.
- Tableaux de bord custom.

## Decision de stack

La stack technique recommandee est maintenant documentee dans `docs/technical-stack.md`.

Points structurants pour les issues:

- frontend React + TypeScript avec Vite,
- routing type-safe avec TanStack Router,
- persistence locale IndexedDB via Dexie,
- validation avec Zod,
- formulaires avec React Hook Form,
- tests unitaires Vitest et parcours critiques Playwright.

Les issues de Vague 1 peuvent donc etre creees et lancees en parallele en partant de `develop`.
