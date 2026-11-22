# Architecture

Ce document distingue le code présent de l’architecture visée. Les décisions détaillées, les garanties attendues et les travaux restants figurent dans [ALBA_PROGRESS.md](../ALBA_PROGRESS.md).

## État actuel

```text
Navigateur → Nuxt → /api/* → binding API → Hono/oRPC (santé)
API → binding PRICE_CHECK provisionné → Worker Workflows (squelette)
Neon : fabrique de client seulement
```

Les trois Workers et le Workflow sont déployés sur le stage `dev`. Seul Nuxt possède une URL workers.dev ; API et Workflows restent internes. HTTP et oRPC ont été vérifiés via Nuxt. Une instance du squelette a terminé via l’API de gestion Cloudflare ; le déclenchement par le Worker API reste à valider en B07. Aucun suivi, appel Zyte ou accès SQL n’est implémenté. Voir [les preuves et commandes](infrastructure.md).

## Applications

| Répertoire | Présent | Responsabilité visée |
| --- | --- | --- |
| `apps/web` | Nuxt 4, page provisoire et proxy serveur `/api/*`. | Interface, rendu serveur et transmission de `/api/*` vers l’API. |
| `apps/api` | Hono, `GET /health`, adaptation oRPC sous `/rpc/*` et serveur Bun local. | API, authentification, cron et dispatcher. |
| `apps/workflows` | Classe `PriceCheckWorkflow` et réponse HTTP 404. | Worker hébergeant le Workflow durable de vérification. |

Les trois applications correspondent aux Workers déclarés par Alchemy. Le cron et les traitements métier restent à implémenter.

## Packages

| Répertoire | Présent | Rôle visé |
| --- | --- | --- |
| `packages/api` | Routeur oRPC avec procédure `health` et type associé. | Procédures et types de l’API. |
| `packages/db` | Fabrique Drizzle utilisant le driver Neon HTTP, sans connexion à l’import. | Schémas, accès aux données et migrations. |
| `packages/contracts` | Contrats Zod B03, types inférés et fixtures API/extraction/Workflow. | Schémas et types partagés sans code serveur. |
| `packages/auth` | Point d’entrée réservé. | Authentification. |
| `packages/tracking` | Point d’entrée réservé. | Logique métier commune aux applications serveur. |
| `packages/extraction` | Point d’entrée réservé. | Adaptateur d’extraction et normalisation des résultats. |
| `packages/config` | Configuration TypeScript stricte partagée. | Conventions techniques communes. |

Les workspaces consomment les points d’entrée TypeScript de leurs dépendances internes. Les applications assemblent les packages ; les secrets, accès SQL et implémentations serveur ne doivent pas être importés dans le code navigateur.

Les [contrats B03](contracts.md) définissent les entrées et réponses métier, le contexte d’offre, les montants décimaux, les observations et les erreurs classées. Leur validation est testée localement. Les routes métier et l’utilisation de ces contrats par l’adaptateur Zyte et le Workflow restent à implémenter ; le squelette B02 conserve son ancien payload jusqu’à B07.

## Flux cible

```mermaid
flowchart LR
  U[Utilisateur] --> W[Web Nuxt]
  W -->|service binding /api/*| A[API Hono et oRPC]
  A --> D[(Neon PostgreSQL)]
  A --> F[Workflow de vérification]
  A -->|cron et dispatcher| F
  F --> Z[API Zyte]
  F --> D
```

Ce schéma est une **cible**, pas une représentation des connexions en fonctionnement. Le cron et le dispatcher doivent vivre dans le Worker API. Une vérification doit être persistée, puis traitée par une instance de Workflow ; les détails d’idempotence, de reprise et de budget sont définis dans le suivi du projet.

## Infrastructure et intégrations

- **Alchemy** : `alchemy`, `@alchemy.run/cloudflare` et `@alchemy.run/frontend-frameworks` sont épinglés ensemble en `2.0.0-beta.87`. [`alchemy.run.ts`](../alchemy.run.ts) assemble les modules `infra/`, utilise l’état distant Cloudflare et isole les noms par stage. Le build Nitro Cloudflare, le premier déploiement dev et le redéploiement sont vérifiés.
- **Cloudflare** : bindings `API` (Web → API) et `PRICE_CHECK` (API → Workflow cross-worker) provisionnés. Pas de cron ni de secrets métier injectés à ce stade. Les routes de santé via Nuxt et le squelette Workflow sont exécutés sur Cloudflare ; les méthodes de création/consultation du binding API seront exercées en B07.
- **Neon et Drizzle** : `createDb` construit un client HTTP à partir d’une URL fournie par le serveur. Aucune connexion, migration ou transaction n’a été testée. Les transactions interactives exigeraient de réévaluer le transport.
- **Zyte, Better Auth et interface métier** : non intégrés. Les variables proposées dans `.env.example` ne rendent pas ces fonctionnalités opérationnelles.

Références : [Alchemy Nuxt](https://alchemy.run/cloudflare/frontend/nuxt/), [Alchemy Workflows](https://alchemy.run/cloudflare/compute/add-a-workflow/), [Cloudflare Workflows](https://developers.cloudflare.com/workflows/), [oRPC avec Hono](https://orpc.dev/docs/adapters/hono) et [Drizzle avec Neon](https://orm.drizzle.team/docs/connect-neon).
