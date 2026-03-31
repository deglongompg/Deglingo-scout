#!/usr/bin/env python3
import json

with open("deglingo-scout-app/public/data/players.json", encoding="utf-8") as f:
    players = json.load(f)

names = ["yamal", "olise", "kane", "pedri", "vitinha", "bruno fernandes", "schlotterbeck", "magalh", "grimaldo"]

for q in names:
    hits = [p for p in players if q.lower() in p.get("name","").lower()]
    for p in hits:
        print(f"{p['name']:<30} slug={p.get('slug','?'):<45} l5={p.get('l5')} l10={p.get('l10')} l40={p.get('l40')}")
    if not hits:
        print(f"NOT FOUND: {q}")
    print()
