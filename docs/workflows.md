# Première vérification durable — B07

Le Workflow consomme `{ version: 1, checkId }`, avec un identifiant d’instance **égal au `checkId`**. La vérification doit déjà exister dans Neon. B07 fournit un déclencheur opérateur protégé ; la création des suivis, le dispatcher et la réconciliation restent en B08–B11.

## Étapes et garanties

1. `prepare` verrouille la vérification, passe de `pending` à `running` et fige la requête HTTP depuis le produit dans une transaction Neon HTTP. Une reprise conserve ce contexte même si le produit change. Une vérification terminale sort sans appel fournisseur ; une instance différente ou une requête figée invalide est refusée.
2. `extract-http-1` appelle Zyte et retourne uniquement le résultat normalisé, les identifiants et les timestamps. Workflows enregistre ce résultat avant l’étape SQL suivante. Aucun HTML ni corps fournisseur brut n’entre dans l’état durable.
3. `record-attempt-1` enregistre la tentative dans Neon, de façon idempotente par `(checkId, attemptNumber)`. Une panne de cette écriture ne rejoue pas l’extraction déjà durable.
4. Si l’erreur est temporaire, `retry-http-1` attend 10 secondes avant la deuxième tentative ; la troisième attend 20 secondes. Maximum : trois appels logiques. Une erreur permanente (dont authentification/budget) ou métier (prix absent/ambigu) arrête immédiatement les reprises et est finalisée sans observation.
5. `finalize` utilise la transaction B04 : une observation au maximum par vérification, état terminal cohérent et première finalisation conservée. Une panne SQL reprend cette étape sans rejouer l’extraction enregistrée.

Les étapes SQL ont **5 retries**, délai initial **2 secondes**, backoff exponentiel, timeout **30 secondes par essai**. Chaque étape d’extraction a **0 retry implicite**, timeout **90 secondes**, et le client `fetch` s’annule après **60 secondes**. Les reprises métier temporaires sont les étapes explicites ci-dessus ; les exceptions inattendues ne créent pas de boucle de dépense. Après épuisement des retries SQL, l’instance peut être en erreur et la vérification rester `running` : la réconciliation automatique appartient à B09.

L’appel externe n’est pas exactement une fois : une panne entre succès Zyte et enregistrement durable peut produire une dépense supplémentaire. Ne pas redémarrer une instance terminée avec son état effacé pour reprendre une finalisation ; préserver son journal durable. L’unicité SQL protège les observations, pas la facturation externe.

## Configuration et accès

Alchemy beta.87 injecte `DATABASE_URL` et `ZYTE_API_KEY` uniquement côté serveur, la clé Zyte étant un binding secret de Workflows. `EXTRACTION_ENABLED` vaut `false` par défaut. `EXTRACTION_ALLOWED_HOSTS` est une liste séparée par des virgules, vide par défaut : aucune destination n’est alors autorisée. Le navigateur Zyte reste désactivé. Ces contrôles et les trois tentatives bornent une vérification ; ils ne constituent pas un quota monétaire global concurrent (B13).

`WORKFLOW_VERIFY_TOKEN` est un secret opérateur injecté uniquement dans API. Sans ce secret, les routes répondent 404. Avec `Authorization: Bearer <secret>` :

- `POST /internal/checks/start`, corps `{ "version": 1, "checkId": "..." }`, appelle le binding `PRICE_CHECK.create` avec l’ID déterministe ;
- `GET /internal/checks/:id` appelle `PRICE_CHECK.get().status()`.

Via Nuxt, préfixer `/api`. Ce déclencheur sert à la validation explicite, pas à des utilisateurs finaux. Ne jamais intégrer le secret dans l’interface. Il ne crée ni produit ni vérification ; le script opérateur les crée en base. Un démarrage incertain doit être inspecté avec le même identifiant ; B08/B09 fourniront la récupération automatique.

## Vérification reproductible

Renseigner le `.env` ignoré avec `ZYTE_API_KEY`, un `WORKFLOW_VERIFY_TOKEN` aléatoire et `DATABASE_URL` correspondant au **stage personnel** provisionné par Alchemy. L’activation ne doit pas être implicite dans les previews.

```sh
EXTRACTION_ENABLED=true EXTRACTION_ALLOWED_HOSTS=books.toscrape.com bun run infra:dev
# Utiliser l’URL Web affichée par Alchemy, qui peut changer.
bun run infra:verify http://localhost:1339
bun run workflow:verify http://localhost:1339 --live
# Projet de développement autorisant un trigger temporaire ciblé :
bun run workflow:verify http://localhost:1339 --live --sql-failure
```

`workflow:verify` peut effectuer jusqu’à trois appels HTTP payants sur le livre de référence. Il contrôle le passage par le binding API, l’état Workflow, la tentative SQL, une observation à 51.77 GBP et deux finalisations supplémentaires sans doublon. Les données restent en base comme preuve, avec l’identifiant imprimé avant le déclenchement. L’option `--sql-failure` crée un trigger ciblé sur cet identifiant et une séquence non transactionnelle : la première finalisation échoue, la suivante réussit. Le compteur est contrôlé avant les finalisations répétées et les objets DDL sont supprimés en `finally`. Ne pas utiliser ce mode sur une base de production.

Une expiration de l’attente du script ne prouve pas l’arrêt du Workflow : consulter l’instance affichée avant de relancer un test. Le mode local Alchemy utilise workerd/Miniflare et Neon/Zyte distants ; il ne valide pas le service Workflows cloud déployé.

## Preuves et limites

Le 22 novembre 2026, sur le stage personnel `dev_raphael` :

- HTTP et oRPC via Nuxt local passent.
- `b07-6a233740-f944-4dd5-8bb8-357a2ebd1f44` : Workflow local `complete`, vérification `succeeded`, une tentative Zyte réelle, une observation **51.77 GBP**, horodatée `2026-11-22T17:51:52.994Z`. Deux finalisations répétées conservent l’observation.
- `b07-8aa5bcce-3df4-4f1a-86db-87d928f6ba99` : injection SQL dans le runtime local, compteur de finalisations **2** (première en échec, deuxième réussie), une tentative et une observation **51.77 GBP**, horodatée `2026-11-22T17:53:03.438Z`. Deux finalisations supplémentaires restent idempotentes ; trigger, fonction et séquence supprimés.
- Le premier essai `b07-ad1906ac-8059-4209-b94a-f1342a8cfeac` a révélé que Workers refuse `redirect: "error"`. Trois erreurs réseau ont été persistées aux intervalles prévus, puis finalisées en échec. Le client utilise maintenant `manual` et refuse les 3xx sans suivre leur destination ; un test de non-régression couvre ce comportement.
- Les tests ordinaires incluent les reprises temporaires, l’arrêt sur erreurs permanentes/métier, la reprise SQL simulée après journal durable et l’accès au déclencheur. Ils n’effectuent aucun appel cloud.
- Les **10 tests Neon** incluent gel du contexte concurrent et panne SQL réelle avec replay d’un journal Workflow simulé et fournisseur simulé : un seul appel fournisseur compté, une observation finale. Ce test ne prétend pas simuler la durabilité du service cloud.

`bun run check`, `bun run typecheck`, `bun run test` (130 tests ordinaires) et `bun run build` passent ; `bun run db:test` passe avec 10 tests Neon.

Aucun déploiement distant B07 n’est inclus dans ces preuves. Le stage cloud `dev` conserve le squelette B02 tant qu’un déploiement B07 n’a pas été réalisé. Les quotas globaux, la récupération des instances échouées et le parcours utilisateur restent à réaliser.

Références vérifiées : [API Workflows](https://developers.cloudflare.com/workflows/build/workers-api/), [retries et délais](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/), [modes de redirection Workers](https://developers.cloudflare.com/workers/runtime-apis/request/). Les bindings Alchemy utilisent les types de la version **2.0.0-beta.87** installée.
