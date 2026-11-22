# Infrastructure B02

`alchemy.run.ts` est la source de vérité. Les modules `infra/` déclarent trois Workers et un Workflow Cloudflare ; aucune configuration Wrangler parallèle n’est nécessaire.

| Ressource | Configuration |
| --- | --- |
| Web | Nuxt, preset Nitro `cloudflare_module`, URL workers.dev publique, binding `API` |
| API | Hono/oRPC, workers.dev et URLs de preview désactivés, binding `PRICE_CHECK` |
| Workflows | Classe exportée `PriceCheckWorkflow`, workers.dev et previews désactivés |
| PriceCheck | Workflow hébergé par Workflows, référence cross-worker dans API |

Alchemy génère les noms des Workers par stack et stage. Le Workflow porte le nom `alba-price-check-<stage>`. Le stage `dev` est explicite dans les scripts ; pour un autre stage, utiliser directement `bunx alchemy plan --stage <stage>` puis `bunx alchemy deploy --stage <stage>`. Ne pas réutiliser un stage pour des environnements indépendants.

## Versions et accès

Utiliser Bun **1.4.4**, Node **24.22.3** et `bun install --frozen-lockfile`. Alchemy, son provider Cloudflare et l’intégration frontend sont épinglés en **2.0.0-beta.87** ; Effect et `@effect/platform-bun` sont en **4.1.5**. Ce dernier est nécessaire au CLI local Bun.

Le profil Alchemy local `default` est utilisé, sauf sélection explicite par les options du CLI. Les credentials existants restent dans `~/.alchemy`, hors du dépôt. Pour un environnement automatisé, les alternatives `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` sont prises en charge par cette version ; les permissions doivent couvrir les Workers, Workflows et les ressources nécessaires au stockage d’état. Aucune clé métier Neon/Zyte/Better Auth n’est nécessaire pour B02.

L’état est distant via `Cloudflare.state()`, pas un fichier local à copier entre machines. Alchemy utilise son Worker de stockage d’état et ses credentials de profil. Garder le même compte, la même stack `Alba` et le même stage pour reprendre un déploiement. Le plan peut nécessiter l’initialisation du stockage d’état sur un nouveau compte.

## Plan, déploiement et vérification

Depuis la racine :

```sh
bun run check
bun run typecheck
bun run test
bun run build:cloudflare
bun run infra:plan
bun run infra:deploy
```

`infra:deploy` affiche un plan avant confirmation. Il construit Nuxt avec l’intégration Alchemy, téléverse les assets et provisionne les bindings. Il retourne `webUrl`, `apiWorkerName`, `workflowWorkerName` et `workflowName`. Relancer la même commande met à jour les ressources existantes ; `bun run infra:plan` permet ensuite de vérifier l’absence de changement.

Exécuter le contrôle cloud avec les sorties du déploiement :

```sh
bun run infra:verify <webUrl> <workflowName>
```

Ce contrôle utilise le profil local, vérifie HTTP et oRPC via Nuxt, crée une instance de Workflow avec un identifiant unique, attend son état terminal pendant au plus 60 secondes et vérifie le résultat du squelette. Chaque exécution laisse une instance de test soumise à la rétention Cloudflare. Il n’appelle ni Zyte ni Neon. Il échouera intentionnellement quand le contrat du squelette sera remplacé en B07 ; l’adapter alors au nouveau comportement.

Pour le développement avec bindings, `bun run infra:dev` sélectionne le runtime local Alchemy ; ce mode n’a pas été validé dans B02. Avec les serveurs Bun/Nuxt classiques (`bun run dev`), le binding `API` est absent et `/api/*` retourne 503. Aucun repli vers une URL distante n’est implicite.

## Preuves du 22 novembre 2026

Le stage `dev` du profil local a été déployé et redéployé avec les mêmes noms :

- Web : <https://alba-web-dev-lvfigfj44yndcohx.rdecostaire.workers.dev>.
- API : `alba-api-dev-dytfhg4zdzozjpcu`.
- Workflows : `alba-workflows-dev-3q6gijlu3coaur4f`.
- Workflow : `alba-price-check-dev`.
- `/api/health` : HTTP 200, `{"status":"ok"}`.
- `POST /api/rpc/health` : HTTP 200, `{"json":{"status":"ok"}}`.
- Instance `b02-a4d81be0-e3a8-4d36-8c77-7adc957ca424` : `complete`, résultat contenant le même `checkId` et `status: not-implemented`.
- Script final `infra:verify` : succès avec l’instance `b02-7755c91f-e04e-4a67-bfba-08be52bd4342`.
- Plan final après redéploiement : `Plan: no changes`, toutes les ressources et tous les bindings en `noop`.

Le déclenchement de cette instance utilise l’API de gestion Cloudflare. Le binding API → Workflow est provisionné ; son utilisation par la logique métier sera testée en B07. Les cookies, redirections d’authentification et droits utilisateurs seront validés en B11. Aucun cron, secret métier, schéma SQL ou traitement d’extraction n’est ajouté par B02. La CI GitHub continue à effectuer les contrôles locaux sans déployer.
