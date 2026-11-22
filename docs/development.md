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

Le port 3001 doit être disponible pour l’API ; Nuxt utilise le port 3000 par défaut. `Ctrl+C` arrête les tâches. Le Workflow n’a pas de serveur de développement local configuré. Le serveur Bun permet de développer l’API, mais ne reproduit pas le runtime Cloudflare Workers.

Pour contrôler l’API sans navigateur :

```sh
curl -fsS http://localhost:3001/health
curl -fsS -X POST http://localhost:3001/rpc/health \
  -H 'content-type: application/json' -d '{}'
```

Les réponses attendues sont respectivement `{"status":"ok"}` et `{"json":{"status":"ok"}}`. Il n’existe pas encore de proxy depuis Nuxt vers l’API ; ces URL servent uniquement au développement local.

## Commandes de vérification

Toutes les commandes suivantes se lancent depuis la racine :

| Commande | Effet |
| --- | --- |
| `bun run check` | Vérifie le formatage et le lint via Ultracite, sans modifier les fichiers. |
| `bun run fix` | Applique les corrections et le formatage automatiques ; des erreurs peuvent nécessiter une correction manuelle. |
| `bunx ultracite doctor` | Diagnostique l’installation et les configurations Ultracite, Oxlint et Oxfmt. |
| `bun run typecheck` | Vérifie la configuration Alchemy racine, puis les workspaces qui déclarent cette tâche. |
| `bun run test` | Exécute les tests déclarés dans les workspaces ; actuellement, ceux de l’API. |
| `bun run build` | Construit les applications Web, API et Workflows. |

Les tests actuels couvrent les routes de santé HTTP et oRPC ainsi qu’une route RPC absente. Le build Nuxt utilise localement le preset Nitro `node-server` ; les builds API et Workflows sont des bundles Bun. Ils ne prouvent pas que les applications fonctionnent dans `workerd` ou sur Cloudflare.

Ultracite 8 utilise les configurations racine `oxlint.config.mts` et `oxfmt.config.mts`. Exécuter `bun run check` après modification ; `bun run fix` modifie les fichiers concernés. Les exceptions ciblées présentes dans les squelettes correspondent aux points d’entrée vides et à la méthode requise par Cloudflare.

## Environnement et secrets

Les commandes ci-dessus fonctionnent sans fichier `.env`. Le fichier [`.env.example`](../.env.example) répertorie des variables **prévues**, non branchées aux applications actuelles : connexion Neon, Better Auth, Zyte et credentials de provisionnement. Ne pas les renseigner dans du code destiné au navigateur ni versionner leurs valeurs. `.env`, ses variantes et les fichiers `.dev.vars` sont ignorés par Git.

Ne pas considérer ces noms ou exemples comme une configuration de production complète : les bindings, la validation des variables et la distribution des secrets restent à implémenter.

## Dépannage

- **Installation non reproductible** : vérifier la version de Bun, puis la cohérence entre les manifests et `bun.lock`. Ne pas remplacer `--frozen-lockfile` silencieusement dans une vérification.
- **Port occupé** : arrêter le processus utilisant le port concerné avant de relancer le développement.
- **Erreurs de format ou de lint** : consulter la sortie de `bun run check`, puis appliquer `bun run fix` et corriger les erreurs restantes. `bunx ultracite doctor` aide à diagnostiquer l’installation.
- **Échec lié à un service externe** : aucun service cloud n’est nécessaire au parcours local décrit ici ; vérifier qu’une commande ou une modification supplémentaire ne tente pas d’y accéder.

## Intégration continue GitHub

Le workflow `CI` se déclenche sur les push, pull requests, merge queues et manuellement. Le job `Verify` installe la version de Node indiquée dans `.node-version` et la version de Bun définie par `packageManager`, puis exécute l’installation figée, `check`, `typecheck`, `test` et `build`. Les actions sont épinglées par SHA ; aucun secret ni déploiement n’est nécessaire. Une nouvelle exécution annule la précédente pour une même pull request.

Le workflow `CodeQL` analyse JavaScript et TypeScript sur les pull requests, les push vers `dev` et `main`, chaque semaine et manuellement. La configuration Dependabot propose chaque semaine des mises à jour pour Bun et les actions GitHub ; son activation et les premiers résultats dépendent de GitHub et de la branche par défaut. CodeQL nécessite l’activation et la disponibilité de la sécurité GitHub pour le dépôt.

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
