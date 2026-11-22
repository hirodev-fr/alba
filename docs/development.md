# Développement

## Prérequis et installation

Le projet utilise les workspaces Bun et Turborepo. Bun **1.4.4** est déclaré dans `package.json` ; Node.js **24.22.3** est indiqué dans `.node-version` et utilisé par la CI. Avec `fnm`, utiliser `fnm use` à la racine pour sélectionner cette version.

Depuis la racine :

```sh
bun install --frozen-lockfile
```

Cette commande installe les dépendances à partir de `bun.lock` sans le modifier. Après un changement intentionnel de dépendance, utiliser `bun install` et conserver le lockfile mis à jour avec les manifests concernés.

## Serveurs locaux

```sh
bun run dev
```

Turborepo lance les deux tâches de développement disponibles :

| Service | Adresse | Comportement |
| --- | --- | --- |
| Web | <http://localhost:3000> | Page Nuxt provisoire. |
| API | <http://localhost:3001> | Serveur Bun avec rechargement, exposant Hono et oRPC. |

Le port 3001 doit être disponible pour l’API ; Nuxt utilise le port 3000 par défaut. `Ctrl+C` arrête les tâches. Le Workflow n’est pas lancé par cette commande ; `bunx alchemy dev` l’héberge localement avec ses bindings. Le serveur Bun permet de développer l’API, mais ne reproduit pas le runtime Cloudflare Workers.

Pour contrôler l’API sans navigateur :

```sh
curl -fsS http://localhost:3001/health
curl -fsS -X POST http://localhost:3001/rpc/health \
  -H 'content-type: application/json' -d '{}'
```

Les réponses attendues sont respectivement `{"status":"ok"}` et `{"json":{"status":"ok"}}`. Le proxy Nuxt `/api/*` utilise le service binding `API`, disponible avec Alchemy. Avec `bun run dev`, ce binding est absent : le proxy retourne 503 et ces URL directes servent au développement local. `bunx alchemy dev` (ou `bun run infra:dev`) démarre les applications avec les bindings Alchemy, dans un stage personnel distinct du stage cloud `dev`. Neon reste distant et ses migrations sont appliquées automatiquement. Les ports locaux sont affichés par Alchemy ; HTTP et oRPC via Nuxt ont été vérifiés dans ce mode. Voir le [guide Neon B04](database.md).

## Commandes de vérification

Toutes les commandes suivantes se lancent depuis la racine :

| Commande | Effet |
| --- | --- |
| `bun run check` | Vérifie le formatage et le lint via Ultracite, sans modifier les fichiers. |
| `bun run fix` | Applique les corrections et le formatage automatiques ; des erreurs peuvent nécessiter une correction manuelle. |
| `bunx ultracite doctor` | Diagnostique l’installation et les configurations Ultracite, Oxlint et Oxfmt. |
| `bun run typecheck` | Vérifie la configuration Alchemy racine, puis les workspaces qui déclarent cette tâche. |
| `bun run test` | Exécute les tests Bun de l’API et des contrats B03 via Turbo, sans service externe. |
| `bun run build` | Construit les applications Web, API et Workflows. |
| `bun run db:generate --name description` | Génère une migration Drizzle ; Alchemy l’applique au prochain passage. |
| `bun run db:test` | Teste réellement Neon avec `DATABASE_URL` sur un projet de développement déjà migré. |

Le [guide infrastructure](infrastructure.md) décrit aussi `infra:plan`, `infra:deploy`, `infra:verify` et `build:cloudflare`.

Les tests actuels couvrent les routes de santé HTTP et oRPC, une route RPC absente et les [contrats B03](contracts.md) avec fixtures valides/invalides. La suite Neon explicite couvre les contraintes SQL, transactions et reprises de finalisation ; voir [les précautions et preuves](database.md). Pour cibler les contrats : `bun run --cwd packages/contracts test`. Le build Nuxt utilise localement le preset Nitro `node-server` ; les builds API et Workflows sont des bundles Bun. Ils ne prouvent pas à eux seuls une exécution Cloudflare ; le déploiement dev B02 et les tests cloud distincts sont décrits dans le guide infrastructure.

Ultracite 8 utilise les configurations racine `oxlint.config.mts` et `oxfmt.config.mts`. Exécuter `bun run check` après modification ; `bun run fix` modifie les fichiers concernés. Les exceptions ciblées correspondent aux points d’entrée vides, à la méthode requise par Cloudflare et au point d’entrée public du package de contrats.

## Environnement et secrets

`check`, `typecheck`, `test` et `build` fonctionnent sans fichier `.env`. `alchemy dev` utilise les profils Cloudflare/Neon, ou les credentials de provisionnement serveur décrits dans [`.env.example`](../.env.example). Alchemy injecte la connexion Neon en secret dans API et Workflows. Pour `db:test`, configurer `DATABASE_URL` dans le `.env` racine après provisionnement du projet personnel. Better Auth et Zyte restent des variables prévues. Ne pas les renseigner dans du code destiné au navigateur ni versionner leurs valeurs. `.env`, ses variantes et les fichiers `.dev.vars` sont ignorés par Git.

Ne pas considérer ces noms ou exemples comme une configuration de production complète : les bindings sont déclarés par Alchemy ; la validation et l’utilisation des variables métier dans les points d’entrée applicatifs restent à intégrer.

## Dépannage

- **Installation non reproductible** : vérifier la version de Bun, puis la cohérence entre les manifests et `bun.lock`. Ne pas remplacer `--frozen-lockfile` silencieusement dans une vérification.
- **Port occupé** : arrêter le processus utilisant le port concerné avant de relancer le développement.
- **Erreurs de format ou de lint** : consulter la sortie de `bun run check`, puis appliquer `bun run fix` et corriger les erreurs restantes. `bunx ultracite doctor` aide à diagnostiquer l’installation.
- **Échec lié à un service externe** : `check/typecheck/test/build` ne nécessitent aucun cloud. `alchemy dev` et `db:test` accèdent à Neon ; contrôler le profil, le projet personnel et les migrations sans afficher les secrets.

## Intégration continue GitHub

Le workflow `CI` se déclenche sur les pull requests, les push vers `dev` et `main`, les merge queues et manuellement. Les branches de travail ne déclenchent pas de CI au simple push ; une fois la pull request ouverte, chaque mise à jour de celle-ci déclenche `Verify` une seule fois. Le job `Verify` installe la version de Node indiquée dans `.node-version` et la version de Bun définie par `packageManager`, puis exécute l’installation figée, `check`, `typecheck`, `test` et `build`. Les actions sont épinglées par SHA ; aucun secret ni déploiement n’est nécessaire. Une nouvelle exécution annule la précédente pour une même pull request.

Le workflow `CodeQL` analyse JavaScript et TypeScript sur les pull requests, les push vers `dev` et `main`, chaque semaine et manuellement. La configuration Dependabot propose chaque semaine des mises à jour pour Bun et les actions GitHub ; son activation et les premiers résultats dépendent de GitHub et de la branche par défaut. CodeQL nécessite l’activation et la disponibilité de la sécurité GitHub pour le dépôt. Dans une pull request, le job d’analyse et le contrôle des résultats de code scanning sont deux contrôles distincts : le second présente les alertes issues de l’analyse.

Après publication des workflows, vérifier leurs premières exécutions dans l’onglet Actions et, si souhaité, configurer une règle de protection pour exiger le job `Verify` avant fusion. Ces fichiers ne configurent ni protections de branche ni déploiement. Le build Nuxt et les bundles Workers restent des validations locales, pas un test Cloudflare.

## Branches et pull requests

Le flux prévu protège `dev` et `main` contre les modifications directes. Créer une branche de travail depuis la branche cible, y committer les changements avec un message Conventional Commit, puis pousser cette branche et ouvrir une pull request vers la cible. La branche distante `main` n’existe pas encore dans l’état observé ; la créer avant de l’utiliser comme cible. Ne pas pousser directement vers les branches protégées.

Exemple pour une modification destinée à `dev` :

```sh
git switch dev
git pull --ff-only
git switch -c feat/ma-modification
# Modifier les fichiers, puis exécuter les vérifications adaptées.
git add <fichiers>
cog commit feat "describe the change"
git push -u origin feat/ma-modification
```

Ouvrir ensuite une pull request vers `dev`. Les changements destinés à `main` passent également par une pull request ; une promotion depuis `dev` pourra utiliser `dev` comme branche source. Les paramètres de fusion et le nombre d’approbations relèvent des règles du dépôt.

### Réglages GitHub à appliquer

La présence des workflows ne protège pas les branches : dans **Settings → Rules → Rulesets**, créer une règle de branche ciblant explicitement `dev` et `main`, puis activer **Require a pull request before merging** et **Require status checks to pass before merging**. Ajouter le contrôle `Verify` de la GitHub App Actions après sa première exécution réussie ; garder les déclencheurs `pull_request` et `merge_group` si une merge queue est activée. Configurer les approbations et les éventuels droits de contournement selon les personnes qui maintiennent le dépôt. Éviter d’autoriser les force pushes ou suppressions sur ces branches.

Ne pas confondre l’obligation de passer par une pull request avec une règle qui restreint toutes les mises à jour de branche : cette dernière peut également empêcher les fusions si ses exceptions ne sont pas adaptées. Vérifier les règles effectives et les droits de contournement, y compris pour les administrateurs, avec une pull request de test. Ces réglages sont à appliquer sur GitHub ; ce fichier ne les active pas.

Dependabot ouvre par défaut ses pull requests vers la branche par défaut, actuellement `dev`. Aucun workflow de release ne pousse automatiquement vers les branches protégées ; avant d’en ajouter un, prévoir son mode de publication et ses droits sans contourner involontairement ces protections.
