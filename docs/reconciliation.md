# Réconciliation — B09

Le cron API exécute la réconciliation avant le dispatcher avec le même interrupteur `DISPATCH_ENABLED=true`. Il inspecte les obligations `pending` et `running`, y compris celles créées par le déclencheur opérateur, sans appeler Zyte. Une panne de réconciliation n’empêche pas le passage du dispatcher ; les erreurs d’un contrôle n’empêchent pas les autres contrôles du lot.

## Réservation et reprise

La migration `20261122212459_b09_reconciliation` ajoute `price_checks.next_reconcile_at`, initialisé à l’heure PostgreSQL plus deux minutes, et un index partiel sur les contrôles ouverts. Alchemy applique cette migration avant le démarrage du nouveau code. Les anciens contrôles deviennent éligibles deux minutes après migration.

`reserveReconciliation` réserve par défaut 20 contrôles (borne 1–100), triés par prochaine inspection puis identifiant, avec `FOR UPDATE SKIP LOCKED`. La même instruction repousse leur inspection de deux minutes avant toute consultation distante. Un crash reste récupérable, les crons concurrents se répartissent les contrôles et les instances inaccessibles passent derrière les obligations non inspectées. Aucun verrou SQL n’est conservé pendant un appel Workflow. Ce délai ne prouve pas qu’une instance est arrêtée et ne constitue pas une limite de durée d’exécution.

| État observé | Action |
| --- | --- |
| `errored`, `terminated`, `complete` | Réconcilier la vérification à partir du dernier résultat SQL exploitable. |
| `queued`, `running`, `waiting`, `paused`, `waitingForPause` | Garder l’obligation ouverte et la réinspecter au prochain passage éligible. |
| Consultation impossible, réponse invalide ou `unknown` pour un contrôle `running` | Différer sans modifier le statut métier ni créer une instance. |
| Consultation incertaine pour un contrôle `pending` | Retenter `create` avec le même `checkId` uniquement ; si la réponse est perdue ou l’instance existe déjà, consulter à nouveau son statut. |
| Identité Workflow différente du `checkId` | Différer pour inspection opérateur, sans créer de remplacement. |

B08 conserve la récupération des baux de distribution non acquittés. B09 complète cette garantie pour les obligations encore ouvertes indépendamment de l’échéance courante. Il n’avance pas la planification : le dispatcher garde cette responsabilité et ses protections par jeton de bail.

## Finalisation sans nouvelle extraction

Après confirmation d’un état runtime terminal, la dernière tentative SQL est validée par Zod. Un succès, une erreur permanente/métier ou la troisième erreur temporaire peuvent être finalisés avec `finalizeCheck`. Une erreur temporaire intermédiaire ne prouve pas le résultat final : une tentative suivante peut avoir eu lieu sans journal SQL. Sans résultat final récupérable, B09 enregistre `failed`, code permanent `workflow_failed`, avec un message fixe indiquant l’état terminal observé. Les erreurs brutes Cloudflare/SQL ne sont pas copiées dans ce message.

La transaction de finalisation existante conserve le premier état terminal et l’unicité de l’observation, même si le Workflow ou deux réconciliations finalisent simultanément. Une panne SQL annule la transaction ; l’obligation sera réinspectée après deux minutes. Un contrôle devenu terminal libère le produit pour sa prochaine échéance, sous les règles B08 des suivis actifs.

Aucun `restart`, `delete`, `terminate` ou appel fournisseur n’est effectué. Le journal durable Workflow est conservé. Si l’extraction n’existe que dans ce journal et n’a jamais atteint SQL, B09 enregistre l’échec technique ; il ne prétend pas récupérer ce résultat. Les instances actives ou inaccessibles ne sont jamais déclarées échouées sur leur seul âge. Une pause volontaire, une disparition après rétention ou une anomalie persistante nécessite une inspection opérateur ; le produit reste bloqué afin d’éviter un chevauchement incertain. Les plafonds globaux et l’observabilité approfondie restent en B13.

## Vérifier

```sh
bun run check
bun run typecheck
bun run test
bun run db:test
DISPATCH_ENABLED=true EXTRACTION_ENABLED=false bun run infra:dev
bun run reconciliation:verify http://localhost:1338
```

`db:test` exige une base Neon personnelle migrée, autorisant les triggers temporaires ciblés des tests de panne. Arrêter le cron pendant cette suite. Les tests B09 couvrent les réservations concurrentes et leur rotation, la récupération après crash, les finalisations concurrentes, le résultat sauvegardé, les erreurs intermédiaires et la reprise après panne SQL réelle. Les tests sans réseau simulent le binding pour couvrir les états runtime, pertes de réponses, réponses invalides et isolation des échecs ; ils ne constituent pas une validation Cloudflare distante.

`reconciliation:verify` utilise `DATABASE_URL` et `WORKFLOW_VERIFY_TOKEN` du stage local. Il crée un contrôle synthétique dont la requête navigateur est délibérément incompatible avec la préparation HTTP B07. Le véritable Workflow local passe en `errored` avant extraction, tandis que SQL reste `running`. Le script rend ensuite cette obligation éligible, déclenche deux passages cron et exige `failed/workflow_failed`, zéro tentative et zéro observation. Les lignes sont conservées comme preuve ; aucun suivi renouvelable n’est créé. Un timeout impose d’inspecter cet identifiant, pas de relancer aveuglément le script. `bun run reconciliation:verify <url-api-locale> --resume <b09-check-id>` reprend la vérification de cette instance sans en créer une autre.

Référence vérifiée : [API Workers des Workflows](https://developers.cloudflare.com/workflows/build/workers-api/), avec les types installés `@cloudflare/workers-types` 5.20261121.1. Aucun déploiement cloud B09 n’est inclus.

## Preuves du 22 novembre 2026

Alchemy a appliqué la migration sur le projet personnel `red-dust-70386461`, branche `br-withered-wave-bas16r1a`. Le contrôle `b09-286ded5e-3df1-4626-81a5-4a656d06150b` est passé en `errored` dans Workflows local, puis `failed/workflow_failed` dans Neon, sans tentative fournisseur ni observation. La reprise du vérificateur avec `--resume` a confirmé deux passages cron réussis et le même état final. Le runtime a été arrêté après vérification.

Les premiers passages du vérificateur ont reçu HTTP 500 : la réconciliation du contrôle cible avait réussi, mais des contrôles historiques `running` ne pouvaient pas être consultés dans ce runtime. La lecture SQL a confirmé que ces contrôles étaient différés, et non déclarés échoués. Le vérificateur a ensuite repris le même identifiant après leur report. Cette preuve valide le runtime local et Neon distant, pas le service Workflows cloud.

Validation finale avec Bun 1.4.4 et Node 24.22.3 : `check`, `typecheck`, `test` (157 tests hors réseau) et `build` passent ; les tâches inchangées peuvent provenir du cache Turbo. `db:test` passe avec **22 tests Neon**, dont six tests B09. Aucun appel Zyte n’a été nécessaire pour B09.
