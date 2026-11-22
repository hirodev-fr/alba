# Alba

Alba est un projet de suivi de prix : l’objectif est de surveiller des fiches produit et de consulter l’historique de leurs prix. Le dépôt contient actuellement les **fondations et l’infrastructure dev** du monorepo ; les suivis, l’authentification et les extractions ne sont pas encore implémentés.

## Démarrage rapide

Prérequis : Bun **1.4.4** et Node.js **24.22.3** (indiqué dans `.node-version`).

```sh
bun install --frozen-lockfile
bun run dev
```

Ouvrir [localhost:3000](http://localhost:3000) pour la page Nuxt. L’API locale répond sur [localhost:3001/health](http://localhost:3001/health). Arrêter les serveurs avec `Ctrl+C`.

```sh
bun run check      # lint et formatage, sans modification
bun run typecheck  # TypeScript et Nuxt
bun run test       # tests disponibles
bun run build      # builds des applications
```

Aucune variable d’environnement ni aucun service externe ne sont nécessaires à ces commandes. [`.env.example`](.env.example) indique les variables envisagées pour les futures intégrations.

## Documentation

- [Développement](docs/development.md) : commandes, tests, configuration locale, CI GitHub et dépannage.
- [Architecture](docs/architecture.md) : applications, packages, flux cible et limites des intégrations.
- [Suivi du projet](ALBA_PROGRESS.md) : décisions, risques, chantiers et état d’avancement.
- [Conventions pour les agents](AGENTS.md) : règles du dépôt et références techniques.

La stack Alchemy 2.0.0-beta.87 est déployée sur `dev` : Nuxt transmet `/api/*` au Worker API et le squelette Workflow peut être exécuté. Les suivis, Neon et Zyte restent à intégrer. Voir le [guide infrastructure](docs/infrastructure.md) pour le plan, le déploiement et la vérification cloud.
