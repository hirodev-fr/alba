# Benchmark extraction B06

Le 22 novembre 2026, un benchmark exploratoire de **12 cas** a été exécuté sur Zyte réel depuis Bun : 6 observations conformes aux références disponibles, 2 rejets métier attendus, 3 contextes non couverts et 1 cas sans référence indépendante vérifiable. **Coût fournisseur mesuré : 0,006733 USD**, récupération HTTP et extraction produit comprises. Aucun navigateur ni retry.

Les [références](../benchmarks/extraction/corpus.json), le [corpus exécuté](../benchmarks/extraction/results/2026-11-22/corpus.json), les [résultats](../benchmarks/extraction/results/2026-11-22/results.json), le [rapport](../benchmarks/extraction/results/2026-11-22/report.json) et les [statistiques fournisseur expurgées](../benchmarks/extraction/results/2026-11-22/stats.json) sont versionnés. Le contrôle réseau initial bloqué par le sandbox n'est pas inclus dans ces mesures ; le run réel est identifié par `b06-0e4e79ea-37e1-4662-b0cb-100609bf516c`.

## Méthode et périmètre

Le corpus a été figé avant les appels et les échecs ont été conservés. Il couvre sept enseignes/fabricants (IKEA, LEGO, Lush, Apple, Patagonia, Raspberry Pi, Decathlon), trois marchés (FR, GB, US), trois devises, mobilier, jouets, beauté, électronique, habillement et sport. Books to Scrape constitue un contrôle synthétique séparé. Les cas testent prix public, tarif membre à exclure, prix au kilo, pack, variante, vendeur, redirection vers un catalogue et offres multiples.

Les références proviennent d'une lecture indépendante des pages publiques, avec URL, date UTC et justification. La politique retient le prix public unitaire, hors livraison, sans avantage membre ni abonnement ; la fiscalité suit l'affichage du marché choisi. La lecture web peut refléter un cache ou un autre contexte géographique : ce benchmark mesure une concordance avec ces références, pas une certification du prix au checkout.

Chaque cas est exécuté une seule fois, séquentiellement, avec l'adaptateur B05 inchangé quant à l'extraction. Les références de plus de 24 heures, futures ou non vérifiables sont exclues de l'exactitude. Les montants sont comparés sans flottants, en ignorant seulement les zéros décimaux finaux. La disponibilité est comparée uniquement lorsqu'une référence indépendante existe. Une erreur technique ne valide pas un rejet métier attendu.

L'exactitude compte les observations conformes et les rejets métier attendus, divisés par les cas vérifiables. La couverture compte seulement les observations conformes, divisées par tous les cas. Un refus de contexte pour une offre connue réduit donc la couverture ; il ne signifie pas qu'un prix erroné a été publié. Les champs `amount`, `currency` et `availability` détaillent les comparaisons par cas.

## Résultats

| Segment | Cas | Références vérifiables | Réponses conformes | Observations conformes |
| --- | --: | --: | --: | --: |
| Contrôle synthétique | 1 | 1 | 1 | 1 |
| Fiches marchandes | 6 | 5 | 5 | 5 |
| Variante ou vendeur explicite | 3 | 3 | 0 | 0 |
| Rejet attendu | 2 | 2 | 2 | 0 |
| Total | 12 | 11 | 8 | 6 |

- Exactitude sur références : **8/11 (72,7 %)** ; couverture globale : **6/12 (50 %)**. Les deux rejets attendus ne produisent pas d'observation.
- Parmi les neuf cas avec prix attendu : **6/9** produisent une observation conforme ; hors contrôle synthétique : **5/8**. Ces petits dénominateurs doivent accompagner toute présentation du résultat.
- Prix/devise conformes : livre 51,77 GBP, LACK FR 9,99 EUR, LACK GB 10 GBP (pas le prix membre magasin de 8 GBP), roses LEGO 14,99 EUR, Lush 8 EUR (pas le prix au kg), AirTag pack de 1 à 35 EUR.
- Disponibilité confirmée sur trois observations seulement : livre, LEGO et Lush. Le stock IKEA et Apple n'est pas validé par ce benchmark.
- Variante IKEA, vendeur IKEA et taille Patagonia : `context_mismatch`. Le prix et la devise ne sont pas observables dans ces résultats refusés.
- Ancienne fiche IKEA redirigée et page Raspberry Pi multi-offres : `missing_price`, sans observation.
- Decathlon : `missing_price` ; référence inaccessible avec l'outil indépendant, verdict non vérifié.
- Latence p50 : **2 308 ms** ; p95 : **18 386 ms** (méthode du rang supérieur, 12 observations). Durée totale : environ 62 secondes.

## Coût mesuré

L'[API Stats Zyte](https://docs.zyte.com/zyte-api/usage/stats/index.html) a retourné **12 requêtes** et **6 733 micro-USD**, filtrés par le tag unique du run et sa fenêtre UTC. La première lecture n'était pas encore complète ; le rapprochement a réussi à 17:32:31 UTC. Le script refuse de déclarer le coût mesuré si le compteur ou la pagination ne correspond pas.

Le coût moyen est de **0,0005610833 USD par appel** et de **0,0011221667 USD par observation conforme** (ratios arrondis ici ; numérateur et dénominateur exacts dans `cost.json`). Ce dernier inclut les dépenses des refus et du cas non vérifié. Les statistiques agrégées ne séparent pas ici la récupération HTTP du supplément d'extraction produit ; leur somme est mesurée. Navigateur et tentatives supplémentaires : zéro appel. Ce coût concerne ce run, pas un tarif garanti pour toutes les boutiques ni une facture après crédits et taxes.

## Reproduire

```sh
# Sans réseau, sans clé, sans dépense
bun run extraction:benchmark --validate benchmarks/extraction/corpus.json

# Rafraîchir d'abord les références indépendantes ; un nouveau répertoire est obligatoire.
bun run extraction:benchmark --live benchmarks/extraction/corpus.json /tmp/alba-b06-run

# Lecture seule, après disponibilité des statistiques ; ne relance aucune extraction.
bun run extraction:cost /tmp/alba-b06-run
```

`--live` utilise `ZYTE_API_KEY` du `.env`, effectue au maximum 30 appels et s'arrête sur une erreur d'authentification ou de budget. Le répertoire contient `run.json` (identifiant écrit avant le premier appel), `corpus.json`, `results.jsonl` synchronisé après chaque appel, et `report.json`. Le hash SHA-256 porte sur `JSON.stringify` du corpus validé, indépendamment de son formatage. Les preuves versionnées convertissent le journal en tableau `results.json` pour faciliter la lecture. Aucune réponse brute, HTML ou clé n'est enregistrée.

`extraction:cost` utilise `ZYTE_STATS_API_KEY` (clé Dashboard distincte) et `ZYTE_ORGANIZATION_ID` ; l'orthographe `ZYTE_ORGANISATION_ID` est également acceptée. La commande utilise l'endpoint USD ; une organisation facturée dans une autre devise doit employer l'endpoint multidevise avant de mesurer son coût. `stats.json` conserve uniquement compteur et coût, sans identifiant de compte. Si les statistiques sont incomplètes, relancer cette commande plus tard : aucun coût nul n'est déduit d'une absence de données.

## Décisions et limites

B06 fournit une première mesure reproductible permettant de poursuivre B07 sur des offres simples. La confirmation stricte du vendeur et des variantes reste une limite démontrée ; conserver ces refus dans B07. Les résultats ne justifient pas encore un basculement navigateur automatique (B14), ni une promesse de couverture générale.

Ce corpus raisonné n'est pas un échantillon statistique du commerce en ligne : IKEA est surreprésenté pour isoler les effets du contexte, il n'y a qu'un passage par cas et aucune mesure de stabilité temporelle. Les marketplaces multi-vendeurs, les abonnements, les mensualités, les prix barrés et les ruptures de stock réelles devront faire l'objet d'une campagne complémentaire avant ouverture large. Les trois marchés ne prouvent pas le marché effectivement servi par chaque fournisseur. Aucun Workflow ni déploiement Cloudflare n'est validé par B06.

## Vérifications locales

Sous Bun 1.4.4 et Node 24.22.3 : `bun run check`, `bun run typecheck`, `bun run test` et `bun run build` passent. Les tâches inchangées sont restaurées du cache Turbo ; les 31 tests d’extraction, dont sept tests B06, ont été exécutés. Les 12 verdicts archivés, les agrégats, le hash du corpus et le coût ont également été recalculés hors réseau à partir des preuves versionnées. Les tests Neon n’ont pas été relancés : aucune opération SQL n’a changé.
