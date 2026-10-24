# Claude 2026-10-15 (paso 4, memoria iPhone): mapa de memoria de un proceso (el renderer del juego) leído desde Windows,
# sin que el proceso colabore. Suma, por clase de región, lo comprometido y lo RESIDENTE (páginas en RAM: QueryWorkingSetEx).
# Clases: codigo (ejecutable = JIT de V8, código del wasm compilado), wasm (la reserva gigante de la memoria compartida del juego),
# imagen (DLL/EXE), mapeada (archivos/compartida), privada (montículos de V8/Blink/malloc, pilas...).
param([int]$ProcId)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Collections.Generic;
public static class MemMapa {
  [StructLayout(LayoutKind.Sequential)] public struct MBI { public IntPtr BaseAddress, AllocationBase; public uint AllocationProtect; public ushort PartitionId; public IntPtr RegionSize; public uint State, Protect, Type; }
  [StructLayout(LayoutKind.Sequential)] public struct WSX { public IntPtr VirtualAddress; public IntPtr Attr; }
  [DllImport("kernel32")] static extern IntPtr OpenProcess(uint a, bool i, int p);
  [DllImport("kernel32")] static extern IntPtr VirtualQueryEx(IntPtr h, IntPtr a, out MBI m, IntPtr l);
  [DllImport("psapi")] static extern bool QueryWorkingSetEx(IntPtr h, [In, Out] WSX[] b, int cb);
  [DllImport("kernel32")] static extern bool CloseHandle(IntPtr h);
  public static string Run(int pid) {
    IntPtr h = OpenProcess(0x0400 | 0x0010, false, pid); if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess " + Marshal.GetLastWin32Error() + "\"}";
    // Comprometido por reserva (AllocationBase): la memoria wasm del juego es la que más tiene comprometido (~1,8 GB).
    var res = new Dictionary<long, long>(); var regs = new List<MBI>(); long a = 0; MBI m;
    while (VirtualQueryEx(h, (IntPtr)a, out m, (IntPtr)Marshal.SizeOf(typeof(MBI))) != IntPtr.Zero) {
      long sz = (long)m.RegionSize; if (m.State == 0x1000) { long ab = (long)m.AllocationBase; res[ab] = (res.ContainsKey(ab) ? res[ab] : 0) + sz; }
      if (m.State == 0x1000) regs.Add(m); a = (long)m.BaseAddress + sz; if (a <= 0) break; }
    long wasmBase = 0, max = 0; foreach (var kv in res) if (kv.Value > max) { max = kv.Value; wasmBase = kv.Key; }
    var com = new Dictionary<string, long>(); var resi = new Dictionary<string, long>(); var porBase = new Dictionary<long, long>(); var wasmTramo = new SortedDictionary<long, long>();
    foreach (var r in regs) {
      bool exec = (r.Protect & 0xF0) != 0; string c = r.Type == 0x1000000 ? "imagen" : exec ? "codigo" : (long)r.AllocationBase == wasmBase ? "wasm" : r.Type == 0x40000 ? "mapeada" : "privada";
      long sz = (long)r.RegionSize, pages = sz / 4096; com[c] = (com.ContainsKey(c) ? com[c] : 0) + sz; long n = 0;
      for (long off = 0; off < pages; off += 65536) { int k = (int)Math.Min(65536, pages - off); var b = new WSX[k];
        for (int i = 0; i < k; i++) b[i].VirtualAddress = (IntPtr)((long)r.BaseAddress + (off + i) * 4096);
        if (QueryWorkingSetEx(h, b, k * Marshal.SizeOf(typeof(WSX)))) for (int i = 0; i < k; i++) if (((long)b[i].Attr & 1) != 0 && ((long)b[i].Attr & 0x8000) == 0) n++; }
      resi[c] = (resi.ContainsKey(c) ? resi[c] : 0) + n * 4096;
      if (c == "wasm") for (long off = 0; off < pages; off += 65536) { int k = (int)Math.Min(65536, pages - off); var b2 = new WSX[k];
        for (int i = 0; i < k; i++) b2[i].VirtualAddress = (IntPtr)((long)r.BaseAddress + (off + i) * 4096);
        if (QueryWorkingSetEx(h, b2, k * Marshal.SizeOf(typeof(WSX)))) for (int i = 0; i < k; i++) if (((long)b2[i].Attr & 1) != 0) { long o = ((long)b2[i].VirtualAddress - wasmBase) >> 20; wasmTramo[o] = (wasmTramo.ContainsKey(o) ? wasmTramo[o] : 0) + 4096; } }
      if (c == "privada") { long ab = (long)r.AllocationBase; porBase[ab] = (porBase.ContainsKey(ab) ? porBase[ab] : 0) + n * 4096; } }
    // Reservas privadas por tamaño residente: muchos bloques parecidos = uno por hilo; pocos grandes = un dueño.
    var tam = new Dictionary<long, int[]>(); foreach (var kv in porBase) { long mb = kv.Value >> 20; long cubo = mb < 1 ? 0 : mb < 4 ? 1 : mb < 16 ? 4 : mb < 64 ? 16 : mb < 256 ? 64 : 256; if (!tam.ContainsKey(cubo)) tam[cubo] = new int[2]; tam[cubo][0]++; tam[cubo][1] += (int)mb; }
    CloseHandle(h);
    var s = new System.Text.StringBuilder("{\"wasmComprometidaMB\":" + (max >> 20) + ",\"clases\":{");
    bool first = true; foreach (var kv in com) { if (!first) s.Append(","); first = false; s.Append("\"" + kv.Key + "\":{\"comprometidaMB\":" + (kv.Value >> 20) + ",\"residentePrivadaMB\":" + ((resi.ContainsKey(kv.Key) ? resi[kv.Key] : 0) >> 20) + "}"); }
    var top = new List<KeyValuePair<long, long>>(porBase); top.Sort((x, y) => y.Value.CompareTo(x.Value));
    s.Append("},\"privadaMayores\":["); for (int i = 0; i < Math.Min(12, top.Count); i++) { if (i > 0) s.Append(","); s.Append("[\"" + top[i].Key.ToString("X") + "\"," + (top[i].Value >> 20) + "," + (res.ContainsKey(top[i].Key) ? res[top[i].Key] >> 20 : 0) + "]"); }
    s.Append("],\"wasmResidentePor1MB_KB\":["); first = true; long maxT = 0; foreach (var kv in wasmTramo) maxT = Math.Max(maxT, kv.Key); for (long t = 0; t <= maxT; t++) { if (t > 0) s.Append(","); s.Append(wasmTramo.ContainsKey(t) ? wasmTramo[t] >> 10 : 0); }
    s.Append("],\"privadaPorBloque\":{"); first = true; foreach (var kv in tam) { if (!first) s.Append(","); first = false; s.Append("\"desde" + kv.Key + "MB\":{\"bloques\":" + kv.Value[0] + ",\"MB\":" + kv.Value[1] + "}"); }
    return s.Append("}}").ToString();
  }
}
"@
[MemMapa]::Run($ProcId)
