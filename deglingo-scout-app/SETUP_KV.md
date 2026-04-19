# Setup Cloudflare KV — sync teams cross-device

Le nouvel onglet **Mes Teams** centralise Pro Limited, Pro Rare (5 ligues) et Stellar
indexé par compte Sorare. Ça marche dès que le KV namespace est bindé au projet Pages.

## Étapes (une seule fois, dashboard Cloudflare)

1. **Créer le namespace KV**
   - Dashboard Cloudflare → *Storage & Databases* → *KV* → *Create namespace*
   - Nom : `deglingo-teams` (ou ce que tu veux)
   - Noter l'ID qui apparaît

2. **Binder au projet Pages**
   - Dashboard → *Workers & Pages* → ton projet Pages (`deglingo-scout` / `scout`)
   - *Settings* → *Functions* → *KV namespace bindings*
   - *Add binding* :
     - Variable name : `TEAMS_KV`  (**obligatoire**, les Functions lisent `env.TEAMS_KV`)
     - KV namespace : `deglingo-teams`
   - Faire la même chose côté **Production** et **Preview**
   - Save → retrigger un deploy (push vide ou bouton *Retry deployment*)

3. **Vérifier**
   - Ouvrir `https://scout.deglingosorare.com/api/teams` sans token → doit répondre `{"error":"no_token"}` (401).
     Si `{"error":"kv_not_bound"}` (500), le binding n'est pas pris → refaire le deploy.
   - Se connecter Sorare sur l'app, sauver une team Pro ou Stellar, puis regarder le KV
     dans le dashboard : une clé `teams:<ton_slug>` doit apparaître.

## Structure des données (pour debug / migration future)

Clé : `teams:<sorare_slug>`
Valeur (JSON) :

```json
{
  "proLimited": { "PL": { "gw-2026-04-18": [ {team...} ] } },
  "proRare":    { "L1": { "gw-2026-04-18": [ {team...} ] } },
  "stellar":    { "2026-04-19": [ {team...} ] },
  "_updatedAt": "2026-04-19T12:00:00Z"
}
```

Limites gratuites KV : 1 GB stockage + 100k lectures / 1k écritures / jour.
Largement suffisant (1 user = ~50 KB max).
