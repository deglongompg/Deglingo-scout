#!/usr/bin/env python3
"""Explore les champs stats disponibles sur un joueur dans l'API Sorare"""
import requests, json, os, time
from dotenv import load_dotenv
load_dotenv()

URL = "https://api.sorare.com/federation/graphql"
API_KEY = os.getenv("SORARE_API_KEY", "")
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json"}
if API_KEY:
    HEADERS["APIKEY"] = API_KEY

SLUG = "bruno-miguel-borges-fernandes"

Q = f"""query {{ football {{ player(slug: "{SLUG}") {{
    displayName
    l40:  averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
    aa40: averageScore(type: LAST_FORTY_AVERAGE_ALL_AROUND_SCORE)
}}}}}}"""

r = requests.post(URL, json={"query": Q}, headers=HEADERS, timeout=30)
data = r.json()
print(json.dumps(data, indent=2))
