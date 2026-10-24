"""Curated original asset previews; no recreation of gameplay or image content."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('artifacts/original-textures')
global_rows = json.loads((root/'global-preview/manifest.json').read_text())
axel_rows = json.loads((root/'axel-preview/manifest.json').read_text())
package = json.loads((root/'global/pak-manifest-named.json').read_text())
notes = [r for r in global_rows if r['success'] and '0014_' in r['source']]
selected = []
sheet = Image.new('RGB', (1000,730), '#282828')
draw = ImageDraw.Draw(sheet)
draw.text((20,15), 'TEXTURAS ORIGINALES EXTRAIDAS DE TU COPIA DE GH3', fill='white')
draw.text((20,42), 'Notas: verde, rojo, amarillo, azul y naranja', fill='white')

def asset(row, label, box):
    path = Path(row['rgba']).with_suffix('.png')
    im = Image.open(path)
    im.thumbnail((box[2],box[3]))
    sheet.paste(im,(box[0]+(box[2]-im.width)//2,box[1]),im)
    selected.append(dict(label=label, png=str(path.resolve()), textureSource=row['source'],
                         rgbaSha256=row['rgbaSha256'], width=row['width'],height=row['height']))

for i, (index,color) in enumerate([(6,'Verde'),(41,'Rojo'),(47,'Amarillo'),(34,'Azul'),(25,'Naranja')]):
    asset(notes[index], f'Nota {color}', (20+i*192,70,175,80))
    draw.text((65+i*192,153), color, fill='white')
draw.text((20,190), 'Variantes con estrellas / animaciones almacenadas en una imagen', fill='white')
for i,index in enumerate([13,43,18,64,59]):
    asset(notes[index], 'Atlas de estrellas', (20+i*192,214,175,130))
draw.text((20,375), 'Autopista de Axel', fill='white')
axel = next(r for r in axel_rows if r['success'] and '_001_ED67BBE0' in r['rgba'])
asset(axel,'Axel_1 highway', (20,400,155,305))
draw.text((220,375), 'Piezas del puntaje y multiplicador', fill='white')
for index, label, box in [(512,'Contador',(210,410,235,125)),
                         (529,'Marco del puntaje',(490,410,200,125)),
                         (518,'Indicador de rock',(750,410,200,125)),
                         (544,'Multiplicador 2',(290,560,110,125)),
                         (546,'Multiplicador 3',(450,560,110,125)),
                         (547,'Multiplicador 4',(610,560,110,125)),
                         (550,'Multiplicador 8',(770,560,110,125))]:
    row = next(r for r in global_rows if r['success'] and Path(r['source']).name.startswith(f'{index:04d}_'))
    asset(row,label,box)
sheet.save(root/'notas-autopista-puntaje.png')
(root/'gameplay-selected.json').write_text(json.dumps(selected,indent=2))
print(len(selected),'original assets selected')
