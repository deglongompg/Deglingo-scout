# find_slugs.py
# Cherche les bons slugs pour les joueurs manquants
# Lance: python3 find_slugs.py

import requests, json, time

URL = "https://api.sorare.com/federation/graphql"
H = {"Content-Type": "application/json"}

def q(query, variables=None):
    for attempt in range(3):
        try:
            r = requests.post(URL, json={"query": query, "variables": variables or {}}, headers=H, timeout=30)
            data = r.json()
            if "errors" in data and "rate" in str(data).lower():
                time.sleep(30)
                continue
            return data
        except:
            time.sleep(5)
    return {}

# Get PSG activePlayers to find Pacho, Hernandez, Marquinhos, Beraldo
print("=== PSG ===")
data = q("""
query { football { club(slug: "psg-paris") {
    activePlayers(first: 50) { nodes { slug displayName position } }
}}}
""")
try:
    players = data["data"]["football"]["club"]["activePlayers"]["nodes"]
    for p in sorted(players, key=lambda x: x["displayName"]):
        flag = ""
        for name in ["pacho", "hernandez", "marquinhos", "beraldo", "timber", "nwaneri"]:
            if name in p["displayName"].lower() or name in p["slug"]:
                flag = " *** WANTED ***"
        print(f"  {p['displayName']:25s} | {p['position']:10s} | {p['slug']}{flag}")
except Exception as e:
    print(f"  Error: {e}")

time.sleep(2)

# Get LILLE for Ngoy
print("\n=== LILLE ===")
data = q("""
query { football { club(slug: "lille-villeneuve-d-ascq") {
    activePlayers(first: 50) { nodes { slug displayName position } }
}}}
""")
try:
    players = data["data"]["football"]["club"]["activePlayers"]["nodes"]
    for p in players:
        flag = ""
        for name in ["ngoy", "timber"]:
            if name in p["displayName"].lower() or name in p["slug"]:
                flag = " *** WANTED ***"
        if flag:
            print(f"  {p['displayName']:25s} | {p['position']:10s} | {p['slug']}{flag}")
except Exception as e:
    print(f"  Error: {e}")

time.sleep(2)

# Get OM for Timber
print("\n=== OM ===")
data = q("""
query { football { club(slug: "olympique-marseille-marseille") {
    activePlayers(first: 50) { nodes { slug displayName position } }
}}}
""")
try:
    players = data["data"]["football"]["club"]["activePlayers"]["nodes"]
    for p in players:
        flag = ""
        for name in ["timber", "nwaneri", "kondogbia"]:
            if name in p["displayName"].lower() or name in p["slug"]:
                flag = " *** WANTED ***"
        if flag:
            print(f"  {p['displayName']:25s} | {p['position']:10s} | {p['slug']}{flag}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== DONE ===")
print("Copie les slugs WANTED et relance patch_missing_players.py avec les bons slugs")
