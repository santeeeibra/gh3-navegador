"""Save decoded RGBA as PNG, plus a labeled local contact sheet. Requires Pillow."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
rows = json.loads((root / 'manifest.json').read_text())
tiles = []
for row in rows:
    if not row['success']:
        continue
    image = Image.frombytes('RGBA', (row['width'], row['height']), Path(row['rgba']).read_bytes())
    image.save(Path(row['rgba']).with_suffix('.png'))
    thumb = image.copy()
    thumb.thumbnail((420, 245))
    tile = Image.new('RGB', (440, 290), '#282828')
    tile.paste(thumb, ((440-thumb.width)//2, 8), thumb)
    draw = ImageDraw.Draw(tile)
    draw.text((10, 255), Path(row['source']).name, fill='white')
    draw.text((10, 274), f"{row['width']} x {row['height']}", fill='white')
    tiles.append(tile)
sheet = Image.new('RGB', (440*3, 290*((len(tiles)+2)//3)), '#161616')
for i, tile in enumerate(tiles):
    sheet.paste(tile, ((i%3)*440, (i//3)*290))
sheet.save(root / 'texturas-originales.png')
print(f'{len(tiles)} PNG; contact sheet: {root / "texturas-originales.png"}')
