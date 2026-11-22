# Instructions pour les agents — Alba

## Contexte et architecture

- Lire [ALBA_PROGRESS.md](ALBA_PROGRESS.md) avant de modifier l’architecture ; il distingue les décisions cibles des fonctionnalités réellement implémentées.
- Le dépôt est un monorepo Bun et Turborepo en TypeScript strict. Consulter [l’architecture](docs/architecture.md) et le [guide de développement](docs/development.md) pour les frontières et les commandes.
- Garder les secrets et les implémentations serveur hors du navigateur. Ne jamais versionner de credentials ou de fichiers d’environnement locaux.
- Utiliser les API d’Alchemy **2.0.0-beta.87**, sans les mélanger avec celles de la v1. L’infrastructure B02 est déployée sur dev ; les intégrations métier restent partielles. Consulter les preuves dans `docs/infrastructure.md` et ne pas annoncer une intégration fonctionnelle sans vérification adaptée.

## Collaboration Git

- Travailler sur une branche dédiée et proposer les changements par pull request vers `dev` ou `main` ; ne pas pousser directement sur ces branches.
- Conserver des commits Conventional Commits compatibles avec Cocogitto. Ne pas considérer une protection de branche ou un contrôle GitHub comme actif sans vérification.

## Commandes

Exécuter depuis la racine avec Bun 1.4.4 et Node.js 24.22.3 (version indiquée dans `.node-version` et utilisée par la CI) :

| Commande | Usage |
| --- | --- |
| `bun install --frozen-lockfile` | Installer les dépendances du lockfile. |
| `bun run dev` | Lancer les serveurs locaux disponibles. |
| `bun run check` | Vérifier le lint et le formatage sans modifier les fichiers. |
| `bun run fix` | Appliquer les corrections et le formatage automatiques. |
| `bun run typecheck` | Vérifier les types. |
| `bun run test` | Exécuter les tests disponibles. |
| `bun run build` | Construire les applications. |
| `bun run db:generate --name description` | Générer une migration Drizzle versionnée, appliquée ensuite par Alchemy. |
| `bun run db:test` | Vérifier les transactions sur Neon avec `DATABASE_URL` d’un projet de développement migré. |
| `bunx ultracite doctor` | Diagnostiquer la configuration de qualité. |

Choisir les vérifications adaptées à la modification et rapporter leurs résultats réels. `bun run fix` modifie les fichiers ; éviter les reformattages hors périmètre. Le hook Codex `PostToolUse` configuré pour `apply_patch` peut lancer `bunx ultracite fix --hook`.

## Conventions de code

- Respecter les configurations Ultracite 8, Oxlint et Oxfmt : `oxlint.config.mts` étend les presets core, Vue, TanStack et Drizzle ; `oxfmt.config.mts` définit le formatage.
- Privilégier un code lisible et sûr : types explicites lorsqu’ils clarifient l’intention, `unknown` plutôt que `any`, réduction de type plutôt qu’assertion, noms explicites et fonctions ciblées.
- Utiliser `const` par défaut, les accolades pour chaque branche conditionnelle, des retours anticipés et des opérations asynchrones correctement attendues. Éviter les cycles d’import, `eval`, les commentaires TODO ou FIXME ajoutés et les instructions de débogage en production.
- Employer les éléments HTML sémantiques, des libellés accessibles et une hiérarchie de titres cohérente. En Vue, utiliser les attributs `class` et `for`.
- Écrire des tests ciblés avec des assertions dans `test` ou `it` ; éviter `.only`, `.skip` et les callbacks `done`. Ne pas présenter une intégration comme vérifiée sans test adapté.
- Zed exclut le serveur Biome ; Oxlint et Oxfmt sont configurés pour JavaScript, TypeScript et TSX.

## Documentation

- Après **chaque modification**, vérifier si elle rend une documentation obsolète ou nécessite de nouvelles explications. Si nécessaire, mettre à jour les documents concernés dans le même travail.
- Selon le changement, examiner notamment [README.md](README.md), [docs/development.md](docs/development.md), [docs/architecture.md](docs/architecture.md), [ALBA_PROGRESS.md](ALBA_PROGRESS.md), `.env.example` et ce fichier. Documenter les commandes réellement disponibles et distinguer les fonctionnalités réalisées des intégrations prévues ou non vérifiées.

## Références

- [Alchemy : Nuxt](https://alchemy.run/cloudflare/frontend/nuxt/) et [Workflows](https://alchemy.run/cloudflare/compute/add-a-workflow/)
- [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
- [oRPC avec Hono](https://orpc.dev/docs/adapters/hono)
- [Drizzle avec Neon](https://orm.drizzle.team/docs/connect-neon)
