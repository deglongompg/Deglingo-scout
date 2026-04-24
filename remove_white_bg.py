"""Flood-fill white bg to transparent from the 4 corners, preserve interior whites."""
from PIL import Image
from collections import deque

SRC = "deglingo-scout-app/public/bundes.png"
DST = "deglingo-scout-app/public/bundes.png"
THRESH = 240  # pixels with R,G,B >= THRESH considered "white-ish"

img = Image.open(SRC).convert("RGBA")
w, h = img.size
pixels = img.load()
print(f"Size: {w}x{h}")

visited = [[False] * h for _ in range(w)]
q = deque()

# Seed from the 4 edges
for x in range(w):
    for y in (0, h - 1):
        r, g, b, a = pixels[x, y]
        if a > 0 and r >= THRESH and g >= THRESH and b >= THRESH:
            q.append((x, y))
            visited[x][y] = True
for y in range(h):
    for x in (0, w - 1):
        r, g, b, a = pixels[x, y]
        if a > 0 and r >= THRESH and g >= THRESH and b >= THRESH:
            q.append((x, y))
            visited[x][y] = True

count = 0
while q:
    x, y = q.popleft()
    r, g, b, a = pixels[x, y]
    if a > 0 and r >= THRESH and g >= THRESH and b >= THRESH:
        pixels[x, y] = (0, 0, 0, 0)
        count += 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                visited[nx][ny] = True
                q.append((nx, ny))

print(f"Pixels made transparent: {count}")

# Second pass : black BUNDESLIGA text -> white (visible on dark chip bg)
black_count = 0
for x in range(w):
    for y in range(h):
        r, g, b, a = pixels[x, y]
        if a > 0 and r < 80 and g < 80 and b < 80:
            pixels[x, y] = (255, 255, 255, a)
            black_count += 1
print(f"Black->white pixels: {black_count}")

img.save(DST, "PNG")
print(f"Saved: {DST}")
