# Extrae un conjunto de cabinets MSZIP ENCADENADOS (archivos partidos entre CAB) sin ejecutar el instalador.
# expand.exe y el lector de BottleShip no siguen la continuación; este script sí.
# Uso: python -I cab_span_extract.py <salida> Cab.cab Cab1.cab Cab2.cab
# Escribe cada archivo con su nombre de clave del MSI (File table). Streaming: no carga folders enteros en RAM.
import os, struct, sys, zlib

def read_header(f):
    h = f.read(36)
    sig, _, cb, _, coff, _, vmin, vmaj, nfold, nfile, flags, setid, icab = struct.unpack('<4sIIIIIBBHHHHH', h)
    if sig != b'MSCF': raise ValueError('no es cabinet')
    hres = fres = dres = 0
    if flags & 4:
        hres, fres, dres = struct.unpack('<HBB', f.read(4)); f.read(hres)
    def cstr():
        s = b''
        while (c := f.read(1)) != b'\0': s += c
        return s
    if flags & 1: cstr(); cstr()
    if flags & 2: cstr(); cstr()
    folders = []
    for _ in range(nfold):
        off, nblk, typ = struct.unpack('<IHH', f.read(8)); f.read(fres)
        if typ & 0xf != 1: raise ValueError(f'compresión no soportada {typ}')
        folders.append((off, nblk))
    f.seek(coff); files = []
    for _ in range(nfile):
        size, uoff, ifold, _, _, _ = struct.unpack('<IIHHHH', f.read(16))
        files.append((cstr().decode('latin1'), size, uoff, ifold))
    return flags, folders, files, dres

def main(out, cabs):
    os.makedirs(out, exist_ok=True)
    # Lista lógica de folders: [(cabIndex, folderIndex)...], fusionando el último de un CAB con el primero del siguiente.
    heads = []
    for p in cabs:
        with open(p, 'rb') as f: heads.append(read_header(f))
    logical = []  # cada item: {'parts': [(cab, folder)], 'files': {name: (size, uoff)}}
    for ci, (flags, folders, files, dres) in enumerate(heads):
        mapping = []  # folder de este CAB -> índice lógico
        for fi in range(len(folders)):
            if fi == 0 and (flags & 1) and logical: logical[-1]['parts'].append((ci, fi))
            else: logical.append({'parts': [(ci, fi)], 'files': {}})
            mapping.append(len(logical) - 1)
        for name, size, uoff, ifold in files:
            if ifold == 0xFFFD: L = logical[mapping[0]]  # continúa del CAB anterior
            elif ifold in (0xFFFE, 0xFFFF): L = logical[mapping[-1]]  # sigue en el próximo
            else: L = logical[mapping[ifold]]
            L['files'].setdefault(name, (size, uoff))
    total = 0; nfiles = 0
    handles = [open(p, 'rb') for p in cabs]
    for L in logical:
        files = sorted(L['files'].items(), key=lambda kv: kv[1][1])
        pos = 0; idx = 0; cur = None; prev = b''; pending = b''
        def emit(data):
            nonlocal pos, idx, cur, total, nfiles
            o = 0
            while o < len(data) and idx < len(files):
                name, (size, uoff) = files[idx]
                if pos + o < uoff: o = min(len(data), uoff - pos); continue
                if cur is None: cur = open(os.path.join(out, name), 'wb')
                take = min(len(data) - o, uoff + size - (pos + o))
                cur.write(data[o:o + take]); o += take
                if pos + o >= uoff + size:
                    cur.close(); cur = None; idx += 1; nfiles += 1; total += size
            pos += len(data)
        for ci, fi in L['parts']:
            flags, folders, _, dres = heads[ci]; f = handles[ci]
            off, nblk = folders[fi]; f.seek(off)
            for _ in range(nblk):
                _, cbData, cbUnc = struct.unpack('<IHH', f.read(8)); f.read(dres)
                data = pending + f.read(cbData)
                if cbUnc == 0: pending = data; continue  # bloque partido: sigue en el próximo CAB
                pending = b''
                if data[:2] != b'CK': raise ValueError('bloque MSZIP sin firma CK')
                d = zlib.decompressobj(-15, zdict=prev) if prev else zlib.decompressobj(-15)
                block = d.decompress(data[2:]) + d.flush()
                if len(block) != cbUnc: raise ValueError(f'tamaño de bloque {len(block)} != {cbUnc}')
                prev = block; emit(block)
        if cur is not None: raise ValueError(f'archivo incompleto {files[idx][0]}')
        if idx != len(files): raise ValueError(f'faltan archivos en folder lógico: {[n for n, _ in files[idx:]][:5]}')
    print(f'{nfiles} archivos, {total} bytes en {out}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
