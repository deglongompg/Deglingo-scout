"""Probe Sorare federation : trouve slugs Belgique + Pays-Bas + nombre clubs."""
import requests, os, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from dotenv import load_dotenv
load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "APIKEY": KEY}

# Test slugs candidats
candidates = [
    "jupiler-pro-league-be",
    "jupiler-pro-league",
    "belgian-pro-league",
    "pro-league-be",
    "eredivisie-nl",
    "eredivisie",
    "dutch-eredivisie",
]

for slug in candidates:
    q = """query($s: String!) { football { competition(slug: $s) { displayName slug clubs(first: 30) { nodes { slug name } } } } }"""
    r = requests.post(URL, json={"query": q, "variables": {"s": slug}}, headers=HEADERS, timeout=20)
    d = r.json()
    comp = ((d.get("data") or {}).get("football") or {}).get("competition")
    if comp:
        clubs = comp.get("clubs", {}).get("nodes", [])
        print(f"\n[OK] slug={slug:35s} displayName={comp.get('displayName')}  clubs={len(clubs)}")
        for c in clubs[:5]:
            print(f"     - {c.get('slug'):35s} {c.get('name')}")
    else:
        print(f"[KO] slug={slug:35s}  (not found)")

# Liste TOUTES les ligues Sorare (pour voir d'autres slugs dispos)
print("\n=== Sorare allCompetitions (premiere page) ===")
q = """query { football { allCompetitions(first: 50) { nodes { slug displayName } } } }"""
r = requests.post(URL, json={"query": q}, headers=HEADERS, timeout=20)
d = r.json()
nodes = ((d.get("data") or {}).get("football") or {}).get("allCompetitions", {}).get("nodes", [])
print(f"Total: {len(nodes)}")
for n in nodes:
    print(f"  {n.get('slug'):40s} {n.get('displayName')}")
