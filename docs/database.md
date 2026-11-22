# Neon et Drizzle — B04

`@alba/db` contient le client Neon HTTP, les dix tables Drizzle et leurs migrations. `@alba/tracking` expose la finalisation atomique d’une vérification et la lecture de son observation courante. Ces packages sont réservés au serveur.

## Utilisation

```sh
bun run db:generate --name description_du_changement
bunx alchemy dev
# Après provisionnement : configurer DATABASE_URL dans le .env local ignoré.
bun run db:test
```

Drizzle ORM et Kit sont épinglés en **1.0.0-rc.6** : leur format de migrations v1 est requis par Alchemy **2.0.0-beta.87**. Alchemy applique le répertoire référencé par `Neon.Project({ migrations: "./packages/db/migrations" })` et tient `__alchemy_migrations`. `pg` **8.23.1** sert à cette application ; le code applicatif utilise le driver Neon HTTP **1.2.1**. Ne pas modifier les SQL déjà appliqués ni ajouter un second mécanisme d’application.

`alchemy dev` utilise un stage personnel, par exemple `dev_raphael`. Les Workers sont locaux et Neon reste distant. `infra/database.ts` déclare PostgreSQL 17 à Francfort et une rétention de six heures ; les noms du projet, de la base et du rôle suivent les valeurs du provider. Alchemy injecte `DATABASE_URL` en secret dans API et Workflows ; Web ne reçoit que son binding API. Le projet persiste à l’arrêt. Le profil Neon ou `NEON_API_KEY` sert au provisionnement, jamais au navigateur.

## Garanties SQL

Le schéma couvre les comptes/sessions Better Auth, les produits, suivis, échéances, vérifications, tentatives et observations. L’authentification reste à intégrer en B11 ; la création/déduplication d’offres et la réservation des échéances appartiennent aux étapes métier suivantes.

Les contraintes imposent une vérification par `(product_id, scheduled_at)`, un `workflow_id` unique lorsqu’il est renseigné, une tentative par `(check_id, attempt_number)` et une observation par `check_id`. Les références composites empêchent de rattacher une observation au mauvais produit ou à la mauvaise vérification. Les périodes, fréquences et champs de statut sont contrôlés en SQL.

Les montants utilisent `numeric` sans échelle imposée et restent des chaînes côté TypeScript, sans arrondi silencieux ni conversion en `Number`. Les timestamps sont `timestamptz(3)`, convertis en ISO UTC pour les contrats.

`finalizeCheck` envoie un seul `db.batch` : verrouillage de la vérification, insertion éventuelle de l’observation, mise à jour du statut et lecture du résultat. Le premier état terminal est conservé lors des reprises et accès concurrents ; une erreur SQL annule le lot. Les callbacks `db.transaction` ne sont pas pris en charge par le driver HTTP. Le prix courant est lu par `observed_at DESC, id DESC`, pour qu’un ancien résultat ne remplace pas le plus récent.

## Vérification

Le 22 novembre 2026, `bunx alchemy dev` a provisionné le projet Neon personnel et appliqué les migrations. Les tests ont ensuite été relancés avec le `DATABASE_URL` du `.env` après recréation de l’état Alchemy. Les **8 tests Neon** couvrent contraintes, précision, finalisations concurrentes, états terminaux, rollback après panne SQL et prix courant. Ils créent des données synthétiques puis les suppriment ; le test de panne crée temporairement un trigger ciblé. Utiliser un projet de développement autorisant ce DDL. Les tests ordinaires `bun run test` restent sans cloud.

Les routes HTTP/oRPC via Nuxt local ont répondu. Pour ce mode, la compatibilité Cloudflare utilise `2026-11-02`, prise en charge par workerd beta.87, et le chemin Nuxt est résolu depuis `infra/web.ts`. Aucun déploiement Worker B04 n’a été lancé. Les accès SQL sont testés depuis Bun sur Neon réel ; le parcours Workflow/Zyte et l’authentification restent à intégrer.
