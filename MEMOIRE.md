# MEMOIRE DEGLINGO SCOUT — Connaissances critiques a ne JAMAIS reoublier

> **Claude Code :** lis ce fichier EN PREMIER avant tout travail sur le fetch titu%.
> Chaque entree ici a coute plusieurs heures de debug. Ne repete pas les chemins morts.

---

## 🔥 SORARE GRAPHQL — schema titu% (decouvert 2026-04-22, 5h de chasse)

### La VERITE ultime

Le titu% precis (equivalent Sorareinside, avec fiabilite HIGH/MEDIUM/LOW) est dispo
dans l'API Sorare federation sous :

```
Game.playerGameScores → [PlayerGameScore]
  PlayerGameScore {
    id: "PlayerGameScore:<uuid>"
    anyPlayer → Player            # interface ! fragment: ... on Player { slug displayName }
    anyPlayerGameStats → PlayerGameStats {
      footballPlayingStatusOdds {
        starterOddsBasisPoints    # titu% × 100 (ex: 4000 = 40%)
        reliability               # HIGH | MEDIUM | LOW
        providerIconUrl           # sorare_inside.png
        providerRedirectUrl       # https://sorareinside.com
      }
    }
  }
```

### Query qui marche (copy-paste direct)

```graphql
query($id: ID!) {
  football {
    game(id: $id) {
      playerGameScores {
        __typename
        ... on PlayerGameScore {
          id
          anyPlayer {
            ... on Player { slug displayName }
          }
          anyPlayerGameStats {
            ... on PlayerGameStats {
              footballPlayingStatusOdds {
                starterOddsBasisPoints
                reliability
              }
              anyTeam { ... on Club { slug } }
            }
          }
        }
      }
    }
  }
}
```

- `$id` : **UUID brut** (`db595776-a88c-4846-ae43-83473161e4d1`), **PAS** `Game:UUID`
- Renvoie ~63 entries pour un match (roster complet 2 equipes)
- ~55 avec odds dispo (les 8 manquants = staff/juniors/pas encore note)
- Fiable pour matchs **weekend ET mid-week** (≠ `nextClassicFixturePlayingStatusOdds`)

### Types GraphQL verifies

| Type                             | Kind         | Champs utiles                                   |
|----------------------------------|--------------|-------------------------------------------------|
| `Game`                           | type         | `playerGameScores`, `anyPlayers`                |
| `PlayerGameScore`                | type         | `id`, `anyPlayer`, `anyPlayerGameStats`         |
| `PlayerGameStats`                | type         | `footballPlayingStatusOdds`, `fieldStatus`, `anyTeam`, `projection` |
| `AnyPlayerInterface`             | interface    | (besoin de `... on Player { slug }`)            |
| `AnyPlayerGameStatsInterface`    | interface    | (besoin de `... on PlayerGameStats { ... }`)    |
| `PlayingStatusOdds`              | type         | `starterOddsBasisPoints`, `reliability`, `providerIconUrl` |

### Formats d'ID

- Dans la query : **UUID brut** (sans prefixe)
- Dans la reponse : `"Game:<uuid>"`, `"PlayerGameScore:<uuid>"`, `"PlayerGameStats:<uuid>"`
- `node(id:)` accepte les IDs prefixes `"PlayerGameStats:<uuid>"`

---

## 🧨 CHEMINS MORTS a NE PAS re-essayer

| Tentative                                                  | Resultat                                  |
|------------------------------------------------------------|-------------------------------------------|
| `Game.anyPlayerGameStats`                                  | ❌ "doesn't exist. Did you mean `anyPlayers`" |
| `Game.playerGameStats`                                     | ❌ "doesn't exist. Did you mean `playerGameScores` or `playerGameScore`" |
| `Game.lineup`, `Game.playingPlayers`, `Game.anyLineups`    | ❌ "doesn't exist"                        |
| `Game.anyPlayers`                                          | ⚠️  retourne juste `[Player]` (63 items), PAS les odds |
| `Player.footballPlayingStatusOdds`                         | ❌ "doesn't exist on type Player"         |
| `Player.nextClassicFixturePlayingStatusOdds`               | ⚠️  renvoie `null` en mid-week            |
| `Player.playingStatus` (enum STARTER/REGULAR/SUBSTITUTE)   | ⚠️  generique, pas precis par match       |
| Introspection `__type(name: "Game")` et compagnie          | ❌ disabled cote API Sorare federation    |
| `id = "Game:<uuid>"` dans la query                         | ❌ fails — il faut l'UUID nu              |
| Scraping `__NEXT_DATA__` sur `sorare.com/football/players/...` | ❌ page SSR sans les odds            |

---

## ✅ SCRIPT A UTILISER : `fetch_titu_fast.py`

Appele depuis `MAJ_turbo.sh` etape `[2bis/6]`.

```bash
python3 fetch_titu_fast.py              # full, patch players.json
python3 fetch_titu_fast.py --dry-run    # pas de patch
python3 fetch_titu_fast.py --game <uuid> --dry-run   # 1 match
python3 fetch_titu_fast.py --days 5     # fenetre plus large (default 3)
python3 fetch_titu_fast.py --probe      # debug si schema change encore
python3 fetch_titu_fast.py --introspect # si API ouvre un jour introspection
```

- Recupere les Game UUIDs via `so5.inProgressSo5Fixture + futureSo5Fixtures`
- 4 workers parallele, ~5-10s pour tous les games de 3 jours
- Patche `sorare_starter_pct` (0-99) + `sorare_starter_reliability` dans `players.json`

Fallback Sorareinside encore dispo dans `MAJ_turbo.sh` (si l'API Sorare plante un jour).

---

## 📸 SCREENSHOT DE REFERENCE — DevTools PSG-Nantes 2026-04-23

Obtenu sur `sorare.com/fr/football/scores/matches/db595776-a88c-4846-ae43-83473161e4d1/lineups` :

```
{
  __typename: "PlayerGameScore",
  id: "PlayerGameScore:74aead37-0af2-40f1-8892-12673bd559f5",
  anyPlayer: {
    __typename: "Player",
    slug: "desire-doue",
    displayName: "Désiré Doué",
    cardPositions: ["Forward", "Midfielder"]
  },
  anyPlayerGameStats: {
    __typename: "PlayerGameStats",
    id: "PlayerGameStats:737e9e9d-ecaa-4509-8da1-c1b9d21f9f00",
    anyTeam: { __typename: "Club", slug: "psg-paris" },
    fieldStatus: "UNKNOWN",
    footballPlayingStatusOdds: {
      __typename: "PlayingStatusOdds",
      starterOddsBasisPoints: 4000,     ← 40% titu
      reliability: "MEDIUM",
      providerIconUrl: "...sorare_inside.png",
      providerRedirectUrl: "https://sorareinside.com"
    }
  }
}
```

Valide a l'UI Sorare : panneau gauche "Previsions des titulaires" montre
"Désiré Doué 40%" — match exact avec `starterOddsBasisPoints: 4000 / 100`.

---

## 🛠 PROCESS DEBUG GraphQL QUAND SORARE CHANGE SON SCHEMA

Sorare modifie regulierement le schema (ex : `status` → `statusTyped`). Protocole :

1. **Repro** : ouvre F12 → Network → filtre `graphql` sur la page qui affiche la data voulue
2. **Identifie la query** dans "Payload" (le backend la log)
3. **Confirme la response shape** dans "Preview"
4. **Identifie les interfaces** : si `__typename` apparait en tete d'objet →
   c'est probablement une interface, il FAUT un fragment `... on <ConcreteType>`
5. **Error "Did you mean X"** est ton meilleur ami : GraphQL suggere le vrai nom
6. **Introspection `__type(name)`** : si ça marche utilise la.
   Si tu obtiens "type introuvable" → introspection disabled, fais du probing field-par-field
7. **Format d'ID** : essaie l'UUID nu ET l'UUID prefixe (`"Game:<uuid>"`)

---

## 🔑 .env (rappel)

```bash
FOOTBALL_DATA_API_KEY=<cle football-data.org>  # gratuite
SORARE_API_KEY=<cle Sorare>                     # developers.sorare.com
SORAREINSIDE_PASSWORD=<mdp Sorareinside>        # fallback seulement
```

Sans `SORARE_API_KEY` : complexity max 500 → inutilisable pour batch.
Avec : complexity 30000 → batch 150 players OK.

---

## 📂 Fichiers cles du projet

| Fichier                              | Role                                          |
|--------------------------------------|-----------------------------------------------|
| `fetch_titu_fast.py`                 | **Titu% precis via API Sorare** (primaire)    |
| `fetch_player_status.py`             | Injured/suspended/proj + titu% fallback enum  |
| `fetch_sorareinside.py`              | Fallback titu% via Sorareinside si API plante |
| `fetch_gw_scores.py`                 | Scores SO5 matchs joues                       |
| `fetch_fixtures.py`                  | Fixtures 5 ligues (football-data.org)         |
| `MAJ_turbo.sh`                       | Orchestrateur tout-en-un (~90s)               |
| `debug_titu_via_game.py`             | Introspection GraphQL sur un Game             |
| `deglingo-scout-app/public/data/players.json` | Source de verite 1450 joueurs        |

---

**TL;DR** : `game.playerGameScores → PlayerGameScore.anyPlayerGameStats → PlayerGameStats.footballPlayingStatusOdds.starterOddsBasisPoints`. UUID brut. Fragments sur interfaces.
