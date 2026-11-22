# Dispatcher — B08

Le Worker API exporte `fetch` et `scheduled`. Alchemy **2.0.0-beta.87** déclare un cron `* * * * *` lorsque `DISPATCH_ENABLED=true`. Par défaut, aucun cron n’est déclaré et le handler est inactif. Aucun appel Zyte n’est effectué par le dispatcher.

## Réservation et démarrage

`reserveDueChecks` réserve au plus 20 produits par passage (borne serveur : 1 à 100). Une seule instruction SQL verrouille les échéances avec `FOR UPDATE SKIP LOCKED`, pose un bail de deux minutes et crée ou retrouve le `PriceCheck` unique par `(product_id, scheduled_at)`. Une panne SQL annule l’ensemble. L’horloge PostgreSQL fait autorité ; les dates sont des `timestamptz`.

Les nouveaux contrôles exigent un suivi `active` dans sa période `[starts_at, ends_at[`. Plusieurs suivis d’un produit partagent une vérification. Les offres/contextes distincts restent des produits distincts. Une autre vérification `pending` ou `running` du produit bloque la création suivante, y compris après expiration du bail.

Le binding démarre `{ version: 1, checkId }` avec **`workflowId = checkId`**. Une erreur de création entraîne une consultation `get(id).status()` ; une réservation récupérée consulte l’instance avant de retenter la création avec le même identifiant. Une erreur de consultation n’est pas interprétée comme une preuve d’absence : l’unicité de l’ID protège la nouvelle tentative. Aucun `restart`, effacement ou nouvel identifiant n’est utilisé.

La prochaine échéance reste inchangée jusqu’à confirmation du démarrage. L’acquittement SQL exige le même jeton, un bail non expiré et la correspondance entre produit, contrôle et échéance. Un ancien dispatcher ne peut donc pas acquitter le bail de son remplaçant. En cas de panne entre création Workflow et acquittement, le passage suivant retrouve le même contrôle et la même instance après expiration du bail. Une vérification déjà terminale en SQL est acquittée sans recréer d’instance.

Une obligation réservée reste récupérable même si le suivi est ensuite suspendu ou expire. La suspension empêche les nouvelles obligations ; elle n’annule pas une vérification déjà réservée. Les futures mutations B10 doivent préserver ces obligations et ne pas remplacer une échéance portant un bail.

## Fréquence et limites

Après acquittement, la fréquence effective est le minimum des fréquences des suivis actuellement actifs. La prochaine échéance vaut l’heure d’acquittement plus cette fréquence, ou le début d’un suivi futur s’il est plus proche. Les échéances manquées sont regroupées en un contrôle : aucune rafale de rattrapage historique. La création et les changements de suivis B10 devront créer/réajuster la planification lorsqu’une fréquence plus exigeante arrive entre deux passages.

Les appels de démarrage du lot sont parallèles et leurs échecs isolés. Les obligations non confirmées gardent leur bail ; le handler signale un échec du passage, sans exposer les exceptions fournisseur ou SQL. Un prochain cron reprend après expiration. Ce lot borné ne constitue ni un quota global d’instances ni un plafond monétaire : ces contrôles restent en B13.

[B09](reconciliation.md) réconcilie les instances terminales et les contrôles bloqués après démarrage avant chaque passage du dispatcher. B08 confirme leur existence sans les redémarrer ; tant que leur état SQL reste non terminal, le produit ne reçoit pas de nouvelle vérification. Le parcours utilisateur est en B10–B12 et la validation cloud complète en B16.

## Vérifier

```sh
bun run test
bun run db:test
DISPATCH_ENABLED=true EXTRACTION_ENABLED=false bun run infra:dev
# URL du Worker API affichée par Alchemy, pas celle de Nuxt.
bun run dispatcher:verify http://localhost:1338
```

`DATABASE_URL` dans `.env` doit correspondre exactement à la base du stage personnel actif. Le script crée un suivi synthétique, déclenche le handler via la route locale Alchemy `/cdn-cgi/handler/scheduled`, attend une finalisation `failed/budget_exceeded` (extraction désactivée), vérifie l’avancement de l’échéance puis répète le cron sans doublon. L’URL synthétique `.example` est également refusée avant dépense par l’adaptateur si l’extraction a été activée par erreur. Le suivi est annulé en `finally` et les lignes de preuve sont conservées. Un timeout d’observation n’implique pas l’arrêt d’une instance ; inspecter le contrôle existant avant de relancer.

La route de déclenchement est fournie par le runtime local, pas par Hono : aucun endpoint public de dispatch n’est ajouté. `bun run dev` ne simule pas le cron.

Les tests hors réseau couvrent perte de réponse, consultation avant reprise, isolation des échecs, panne d’acquittement et export du handler. Les tests Neon couvrent les réservations concurrentes, bornes de lots, unicité, baux expirés, acquittements obsolètes, périodes de suivi, absence de chevauchement et rollback réel après injection d’une panne d’insertion.

Référence : [API Workers des Workflows](https://developers.cloudflare.com/workflows/build/workers-api/). La propriété Alchemy `crons` et la route locale ont été contrôlées dans les sources installées **2.0.0-beta.87**.

## Preuves du 22 novembre 2026

Sur le stage personnel `dev_raphael`, avec Neon distant et le runtime local Alchemy : produit `b08-ec871648-6c58-4152-94b0-7ceadf0f650c`, contrôle `f0f8c8e1-d856-4261-b61e-5931194d28c2`. Le handler cron démarre le Workflow via son binding ; le contrôle termine en `failed/budget_exceeded`, une tentative sans appel Zyte, bail libéré et prochaine échéance `2026-11-22T19:27:25.265Z`. Le second déclenchement conserve une seule vérification. Le suivi synthétique est annulé après le test.

Le premier essai pointait vers une autre base via le `.env` local : il n’a réservé aucun contrôle dans cette base et ne constitue pas une validation runtime. Après correction de la connexion par l’opérateur, le test ci-dessus passe. Aucun déploiement cloud B08 n’a été effectué ; le stage distant `dev` reste B02.

Validation finale sous Bun 1.4.4 et Node 24.22.3 : `check`, `typecheck`, `test` (141 tests hors réseau) et `build` passent. `db:test` passe avec **16 tests Neon**, dont six tests B08. Les tâches inchangées peuvent provenir du cache Turbo. Le runtime Alchemy de vérification a été arrêté après les contrôles.
