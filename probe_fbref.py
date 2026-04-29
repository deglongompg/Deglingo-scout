"""Test theanalyst.com scrape pour MLS xG/PPDA."""
from seleniumbase import SB
from bs4 import BeautifulSoup

URL = "https://theanalyst.com/competition/mls/stats"
with SB(uc=True, headless=True) as sb:
    sb.uc_open_with_reconnect(URL, 5)
    html = sb.get_page_source()
    print(f"HTML size: {len(html)}")

# Cherche les tables et data
soup = BeautifulSoup(html, "lxml")
tables = soup.find_all("table")
print(f"Tables: {len(tables)}")
for i, t in enumerate(tables[:5]):
    print(f"\n--- Table {i} ({len(t.find_all('tr'))} rows) ---")
    headers = t.find_all("th")
    if headers:
        print("Headers:", [h.get_text(strip=True) for h in headers[:15]])
    # Premier row
    first_row = t.find("tbody")
    if first_row:
        first_row = first_row.find("tr")
        if first_row:
            cells = first_row.find_all(["td", "th"])
            vals = [c.get_text(strip=True) for c in cells]
            print("First row:", vals[:15])

# Cherche aussi des div avec data-stat ou similar
links_mls = soup.find_all("a", href=lambda h: h and "/competition/mls/" in h)
print(f"\nLinks MLS sub-pages: {len(set(a['href'] for a in links_mls))}")
for l in list(set(a['href'] for a in links_mls))[:10]:
    print(f"  - {l}")
