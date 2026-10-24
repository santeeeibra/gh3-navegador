# Claude 2026-10-16 (paso 4, memoria iPhone): traduce direcciones de msedge.dll (perfil de memoria nativa de Edge) a nombres de función
# con dbghelp y el PDB público ya bajado. Entrada: archivo con una dirección por línea (hex); salida: "dirección<TAB>función+desplazamiento".
param([string]$Entrada, [string]$Salida, [string]$Dll, [string]$Base, [string]$Pdb)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text; using System.IO;
public static class Simb {
  [DllImport("dbghelp.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool SymInitializeW(IntPtr h, string path, bool inv);
  [DllImport("dbghelp.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern ulong SymLoadModuleExW(IntPtr h, IntPtr f, string img, string mod, ulong b, uint sz, IntPtr d, uint fl);
  [DllImport("dbghelp.dll", SetLastError=true)] static extern uint SymSetOptions(uint o);
  [DllImport("dbghelp.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool SymFromAddrW(IntPtr h, ulong a, out ulong disp, IntPtr info);
  public static string Run(string inp, string outp, string dll, ulong b, string pdbDir) {
    IntPtr h = (IntPtr)0x1234; SymSetOptions(0x2 | 0x4 | 0x40000);
    if (!SymInitializeW(h, pdbDir, false)) return "init " + Marshal.GetLastWin32Error();
    ulong r = SymLoadModuleExW(h, IntPtr.Zero, dll, null, b, 354766848, IntPtr.Zero, 0); if (r == 0) return "load " + Marshal.GetLastWin32Error();
    int max = 1024; IntPtr info = Marshal.AllocHGlobal(88 + max * 2); var sb = new StringBuilder(); int ok = 0;
    foreach (var l in File.ReadAllLines(inp)) { var s = l.Trim(); if (s.Length == 0) continue; ulong a = Convert.ToUInt64(s.Replace("0x", ""), 16);
      for (int i = 0; i < 88; i++) Marshal.WriteByte(info, i, 0); Marshal.WriteInt32(info, 0, 88); Marshal.WriteInt32(info, 80, max); ulong d;
      if (SymFromAddrW(h, a, out d, info)) { int n = Marshal.ReadInt32(info, 76); sb.Append(s + "\t" + Marshal.PtrToStringUni(info + 84, n) + "+" + d.ToString("x") + "\n"); ok++; } else sb.Append(s + "\t?\n"); }
    File.WriteAllText(outp, sb.ToString()); return "ok " + ok;
  }
}
"@
[Simb]::Run($Entrada, $Salida, $Dll, [Convert]::ToUInt64($Base.Replace('0x',''), 16), $Pdb)
