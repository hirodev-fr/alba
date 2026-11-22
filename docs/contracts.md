# Contrats B03

`@alba/contracts` exporte les schémas Zod 4.6.7 et les types TypeScript inférés. Sa seule dépendance d’exécution est Zod ; il peut être importé dans le navigateur, sans code serveur ni secret.

Les contrats définissent les échanges à intégrer en B04–B10. Ils n’ajoutent pas de routes métier ni d’appel fournisseur. Le squelette Workflow B02 conserve `{ checkId }` jusqu’à B07 ; `PriceCheckParamsV1` définit le nouveau payload `{ version: 1, checkId }`.

## Conventions

Chaque contrat d’échange porte `version: 1`. Les schémas sont nommés en camelCase (`extractionResultV1Schema`) et les types inférés en PascalCase (`ExtractionResultV1`). Les objets stricts rejettent les clés inconnues, y compris dans les objets imbriqués. Aucune conversion implicite n’est appliquée. Les champs nullable doivent être explicitement `null` s’ils n’ont pas de valeur.

- Identifiants opaques : 1 à 128 caractères ASCII alphanumériques, `_` ou `-`, premier caractère alphanumérique. Aucun choix d’identifiant SQL n’est imposé.
- Dates : chaînes UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, à la milliseconde. Le serveur devra convertir les dates SQL vers ce format.
- Argent : chaîne décimale positive ou nulle, point décimal, sans signe, exposant ni zéros initiaux superflus. `"0"`, `"0.00"` et `"19.9900"` sont conservés à l’identique. Aucun passage par `Number` ; B04 utilise `numeric` sans précision/échelle imposée pour éviter un arrondi silencieux ; les limites PostgreSQL restent applicables.
- Devise : trois lettres ASCII majuscules ; pays : deux lettres ASCII majuscules. La syntaxe est validée, pas l’appartenance à un registre ISO ni la couverture du fournisseur.
- Disponibilité : `in_stock`, `out_of_stock`, `unknown`. Une observation exige toujours un montant et une devise, même si le produit est indisponible.
- URL : HTTP(S), nom de domaine, 4096 caractères maximum, sans credentials, espaces bruts ni caractères de contrôle. Les adresses IP littérales et les hôtes locaux (`localhost`, suffixes `.localhost`, `.local`, `.internal`) sont refusés. Chemin, fragment et paramètres sont conservés.

La validation d’URL reste syntaxique. La résolution DNS, les redirections, les domaines autorisés et la prévention complète des accès privés doivent être contrôlés côté serveur en B05/B13. Un domaine accepté n’est pas une preuve de destination publique.

## Offre et observation

`Offer` associe une URL à un `OfferContext` explicite : attributs de variante (`Record<string, string>`), pays, devise attendue et vendeur. Une variante inconnue se représente par `{}` ; les autres champs inconnus par `null`. Aucun champ n’est déduit silencieusement et aucune canonicalisation ne fusionne des offres. Les règles de comparaison et de mutualisation restent à implémenter dans le métier.

`ExtractedPrice` contient `amount`, `currency`, `availability`, `title` nullable, `observedAt`, `sourceUrl` et la provenance `{ provider: "zyte", mode: "http" | "browser" }`. Il représente le prix normalisé d’une offre, sans structure brute Zyte ni HTML. B05 contrôle la correspondance entre requête et résultat (variante, pays, vendeur, devise), ainsi que le caractère exploitable du prix.

`PriceObservationV1` associe ce prix à `id`, `productId` et `checkId`. `ProductV1` expose l’offre, son titre nullable, sa date de création et `currentObservation` nullable. B04 ajoute les références composites et lit l’observation courante par `observed_at DESC, id DESC`. L’assemblage de la réponse API et l’utilisation dans le Workflow restent à intégrer en B07/B10.

## API

| Schéma / type correspondant | Rôle |
| --- | --- |
| `createTrackingInputV1Schema` / `CreateTrackingInputV1` | Offre, fréquence en secondes, début et fin du suivi. |
| `updateTrackingInputV1Schema` / `UpdateTrackingInputV1` | Identifiant et remplacement complet de la fréquence, période et état modifiables. |
| `getTrackingInputV1Schema` / `GetTrackingInputV1` | Consultation par `trackingId`. |
| `trackingV1Schema` / `TrackingV1` | Réponse de création, modification ou consultation d’un suivi. |
| `getProductInputV1Schema` / `GetProductInputV1` | Consultation par `productId`. |
| `productV1Schema` / `ProductV1` | Offre et observation courante éventuelle. |
| `getPriceHistoryInputV1Schema` / `GetPriceHistoryInputV1` | Historique par `trackingId`, limite et curseur nullable. |
| `priceHistoryV1Schema` / `PriceHistoryV1` | Observations et `nextCursor` nullable. |
| `getPriceCheckInputV1Schema` / `GetPriceCheckInputV1` | Consultation par `checkId` ; même forme que le payload Workflow versionné. |
| `priceCheckV1Schema` / `PriceCheckV1` | État discriminé d’une vérification. |

Les entrées n’acceptent pas de propriétaire fourni par le client. B10 devra déterminer l’utilisateur depuis la session et vérifier les droits sur chaque ressource ; les contrats seuls ne fournissent aucune autorisation.

La période d’un suivi doit être strictement croissante (`endsAt > startsAt`). La fréquence est un entier de 60 à 31 536 000 secondes : bornes techniques B03, pas une grille commerciale. La période complète est fournie lors d’une modification pour vérifier son ordre sans accès SQL. Les transitions autorisées et la cohérence avec l’horloge seront contrôlées par le métier.

États d’un suivi : `active`, `paused`, `cancelled`, `expired`. Le client ne peut pas imposer `expired` lors d’une modification. L’historique comporte au plus 100 observations par page ; sa requête exige une limite entre 1 et 100. Les curseurs sont des identifiants opaques ; l’ordre stable et leur interprétation seront définis par l’API.

États d’une vérification :

- `pending` : échéance et identifiant Workflow nullable ;
- `running` : identifiant Workflow et `startedAt` obligatoires ;
- `succeeded` : `finishedAt` et `observationId` obligatoires ;
- `failed` : `finishedAt` et erreur classée obligatoires ;
- `cancelled` : `finishedAt` obligatoire.

Les champs d’une autre branche sont refusés : une vérification en attente ne peut pas contenir une observation finale. B04 contraint les champs SQL selon le statut et les références vérification/observation/produit. `finalizeCheck` conserve le premier état terminal dans une transaction HTTP idempotente ; les autres transitions runtime restent à intégrer en B07/B10.

## Extraction et Workflow

`PriceCheckParamsV1` contient uniquement la version et `checkId`. Le futur Workflow chargera puis figera le contexte depuis la base ; le déclencheur ne fournit pas d’URL ni de contexte alternatif.

`ExtractionRequestV1` exige l’offre et un mode explicite `http` ou `browser`. Il n’active pas automatiquement un recours navigateur. Le serveur devra autoriser et plafonner chaque appel en B07/B14.

`ExtractionResultV1` est discriminé par `status` : `success` exige un `price` normalisé complet ; `error` exige une erreur classée et ne peut pas contenir de prix. Les erreurs sont discriminées par `category` :

| Catégorie | Codes | Traitement attendu |
| --- | --- | --- |
| `temporary` | `network`, `timeout`, `rate_limited`, `provider_unavailable` | Reprises bornées à configurer dans le Workflow. |
| `permanent` | `authentication`, `budget_exceeded`, `access_denied`, `unsupported_url`, `invalid_response` | Arrêt ; pas de reprise automatique illimitée. |
| `business` | `missing_price`, `ambiguous_price`, `context_mismatch`, `currency_mismatch`, `product_not_found` | Résultat explicite sans observation invalide. |

La classification est normalisée par Alba ; le mapping des réponses HTTP et des erreurs Zyte est réalisé en B05 (voir [extraction](extraction.md)). Un code d’authentification ou de budget ne peut pas être classé temporaire. La validation de structure ne garantit pas l’exactitude du prix extrait. Les messages doivent être rédigés par l’adaptateur, sans corps fournisseur ni credentials.

## Utilisation et vérifications

Importer les schémas et types depuis `@alba/contracts`, puis valider les données inconnues avec `.parse(payload)` ou `.safeParse(payload)`. `safeParse` permet de traiter une entrée invalide sans exception de validation. Ne pas journaliser le payload brut : les URL et messages peuvent contenir des données sensibles.

`packages/contracts/tests/fixtures/valid.ts` contient des exemples typés de chaque contrat et des trois catégories d’erreur. `invalid.ts` contient des payloads invalides et le chemin de l’erreur attendu. Les tests vérifient aussi la précision décimale après transport JSON, les URL refusées, le contexte non fusionné et les branches de statuts.

```sh
bun run --cwd packages/contracts test
bun run test
```

Les tests utilisent le runner Bun déjà présent et sont inclus dans la tâche Turbo/CI existante. Ils ne nécessitent ni compte cloud, ni base, ni clé Zyte.
