# Lee CFHEADER/CFFOLDER/CFFILE de cabinets (sin descomprimir). Uso: python -I cab_headers.py a.cab ...
import struct, sys, json
for p in sys.argv[1:]:
    with open(p, 'rb') as f: b = f.read(8 << 20)
    sig, _, cb, _, coff, _, vmin, vmaj, nfold, nfile, flags, setid, icab = struct.unpack_from('<4sIIIIIBBHHHHH', b, 0)
    o = 36; hres = fres = dres = 0
    if flags & 4: hres, fres, dres = struct.unpack_from('<HBB', b, o); o += 4 + hres
    names = []
    for bit in (1, 2):
        if flags & bit:
            for _ in range(2):
                e = b.index(b'\0', o); names.append(b[o:e].decode('latin1')); o = e + 1
    folders = []
    for i in range(nfold):
        off, nblk, typ = struct.unpack_from('<IHH', b, o); o += 8 + fres; folders.append({'dataOff': off, 'blocks': nblk, 'type': typ & 0xf, 'lzxWindow': (typ >> 8) & 0x1f})
    files = []; o = coff
    for i in range(nfile):
        size, uoff, ifold, date, time, attr = struct.unpack_from('<IIHHHH', b, o); o += 16
        e = b.index(b'\0', o); name = b[o:e].decode('latin1'); o = e + 1
        files.append({'name': name, 'size': size, 'uoff': uoff, 'folder': ifold})
    print(json.dumps({'path': p, 'cbCabinet': cb, 'flags': flags, 'iCabinet': icab, 'links': names, 'folders': folders, 'nfile': nfile,
                      'first': files[:2], 'last': files[-2:], 'continued': [f for f in files if f['folder'] >= 0xFFFD]}))
