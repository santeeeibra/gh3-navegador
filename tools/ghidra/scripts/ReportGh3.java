// Informe estático: para cada dirección pedida escribe decompilado C, llamadores, llamados
// y referencias (incluidas de datos = punteros a función). Solo lectura del programa.
// Argumentos: <dir-salida> <dir1+dir2+...> [profundidad-llamadores]
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.util.*;

public class ReportGh3 extends GhidraScript {
  @Override
  public void run() throws Exception {
    String[] a = getScriptArgs();
    File out = new File(a[0]);
    out.mkdirs();
    int depth = a.length > 2 ? Integer.parseInt(a[2]) : 2;
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    PrintWriter idx = new PrintWriter(new FileWriter(new File(out, "index.txt"), true));
    for (String s : a[1].split("[,+]")) {  // cmd.exe parte por comas: usar '+'
      Address ad = toAddr(Long.parseLong(s.replace("0x", ""), 16));
      Function f = getFunctionContaining(ad);
      idx.println("== " + s + " func=" + (f == null ? "none" : f.getEntryPoint()));
      for (Reference r : getReferencesTo(ad)) {
        Function rf = getFunctionContaining(r.getFromAddress());
        idx.println("  ref " + r.getReferenceType() + " from " + r.getFromAddress() + " in " + (rf == null ? "-" : rf.getEntryPoint()));
      }
      if (f == null) continue;
      callers(idx, f, depth, "  ", new HashSet<>());
      idx.print("  callees:");
      for (Function c : f.getCalledFunctions(monitor)) idx.print(" " + c.getEntryPoint());
      idx.println();
      DecompileResults r = di.decompileFunction(f, 120, monitor);
      try (PrintWriter w = new PrintWriter(new FileWriter(new File(out, f.getEntryPoint() + ".c")))) {
        w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : ("// error: " + r.getErrorMessage()));
      }
    }
    idx.close();
  }

  void callers(PrintWriter w, Function f, int d, String ind, Set<Function> seen) {
    if (d == 0 || !seen.add(f)) return;
    for (Function c : f.getCallingFunctions(monitor)) {
      w.println(ind + "<- " + c.getEntryPoint());
      callers(w, c, d - 1, ind + "  ", seen);
    }
  }
}
