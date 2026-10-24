"""PNG export and paged contact sheets for an extracted texture collection."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(sys.argv[1])
rows = json.loads((root/'manifest.json').read_text())
valid = [r for r in rows if r['success']]
for page in range(0, len(valid), 80):
    batch = valid[page:page+80]
    sheet = Image.new('RGB', (144*8, 126*((len(batch)+7)//8)), '#303030')
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(batch):
        path = Path(row['rgba'])
        image = Image.frombytes('RGBA', (row['width'],row['height']), path.read_bytes())
        image.save(path.with_suffix('.png'))
        image.thumbnail((136,98))
        x, y = i%8*144, i//8*126
        sheet.paste(image, (x+(144-image.width)//2,y), image)
        draw.text((x+4,y+100), path.name.split('_')[0], fill='white')
        draw.text((x+4,y+112), f"{row['width']}x{row['height']}", fill='white')
    sheet.save(root/f'pagina-{page//80+1:02d}.png')
print(f'{len(valid)} PNG; {(len(valid)+79)//80} contact sheets')
