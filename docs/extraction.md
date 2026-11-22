# Extraction Zyte B05

`@alba/extraction` expose `createZyteExtractor({ apiKey, timeoutMs?, allowedHosts? })`, qui retourne une fonction asynchrone acceptant `ExtractionRequestV1` et produisant `ExtractionResultV1`. Importer ce package uniquement côté serveur. La clé est fournie explicitement ; aucun secret n’est chargé par le package.

Le client effectue un seul POST vers Zyte avec `product: true` et `productOptions.extractFrom: "httpResponseBody"`. Le mode navigateur est refusé avant tout appel. Le pays demandé est transmis via `geolocation`. Le timeout par défaut est de 60 secondes, configurable entre 1 et 120000 millisecondes. Les reprises bornées sont assemblées dans le [Workflow B07](workflows.md).

Les prix restent des chaînes décimales ; seuls les zéros initiaux superflus sont supprimés. Le prix barré et la devise brute ne remplacent jamais le prix courant ou la devise ISO. Les attributs de variante demandés doivent correspondre aux attributs extraits. Un vendeur demandé produit actuellement `context_mismatch`, faute de preuve fiable dans le schéma produit. La géolocalisation demandée n’est pas une garantie de marché ou de taxe. Ces limites sont mesurées dans le [benchmark B06](extraction-benchmark.md) : les trois cas de contexte explicite sont refusés.

Les erreurs HTTP, réseau et métier sont classées selon les contrats B03. Les messages sont fixes et ne recopient ni corps fournisseur, ni URL, ni exception. Aucun HTML ou payload brut n’est conservé dans le résultat.

```sh
bun run --cwd packages/extraction test
bun run --cwd packages/extraction typecheck
```

Les 24 tests locaux utilisent des réponses simulées. Le 22 novembre 2026 à 17:17:07 UTC, `bun run extraction:verify` a réussi sur Zyte réel : « A Light in the Attic », montant `51.77`, devise `GBP`, disponibilité `in_stock`, provenance `zyte/http`. Ce contrôle confirme une extraction réelle normalisée, pas la couverture de boutiques représentatives (B06). Ce contrôle B05 ne validait pas le Workflow ; son assemblage et ses preuves B07 sont décrits dans [le guide Workflow](workflows.md).

Références consultées : [extraction automatique](https://docs.zyte.com/zyte-api/usage/extract/), [schéma fournisseur](https://docs.zyte.com/zyte-api/usage/reference.html), [erreurs](https://docs.zyte.com/zyte-api/usage/errors.html).

Le statut du site cible est contrôlé même si Zyte retourne HTTP 200. Le timeout est testé avec annulation de la requête. Pour la validation réelle, définir `ZYTE_API_KEY` dans `.env`, puis lancer `bun run extraction:verify` : un seul appel payant sur le livre de référence (51.77 GBP), sans retry. Cette commande est exclue des tests ordinaires et de la CI.

La politique URL refuse les IP littérales, credentials, hôtes locaux, suffixes réservés et ports non standard. `allowedHosts` permet de restreindre exactement les hôtes autorisés, à l’entrée et sur le résultat ; le vérificateur utilise books.toscrape.com. Les redirections et résolutions DNS internes à Zyte ne sont pas observables par cet adaptateur : ce contrôle ne constitue pas une protection DNS complète. B13 approfondira cette politique avant ouverture à des URL arbitraires.

Le paramètre serveur optionnel `tags` transmet des étiquettes Zyte pour isoler les statistiques d’un benchmark. Aucun tag n’est ajouté par défaut. Le benchmark et la collecte de coût sont décrits dans [B06](extraction-benchmark.md).

B07 utilise `redirect: "manual"`, compatible Workers, et refuse les réponses 3xx sans suivre leur destination. Le mode Fetch `error` initialement utilisé n’est pas pris en charge par workerd.
