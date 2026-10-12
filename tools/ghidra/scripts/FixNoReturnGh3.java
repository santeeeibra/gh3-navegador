// Corrige el análisis: Ghidra marca __savegprlr/__restgprlr (0x8248EB00-0x8248EC00) y otras como
// "no retorna", y corta el cuerpo de casi todas las funciones. Quita ese atributo, desensambla
// después de cada llamada y recalcula el cuerpo de las funciones de la lista de rexglue.
// Argumento: ruta a functions.txt
import ghidra.app.script.GhidraScript;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.nio.file.*;

public class FixNoReturnGh3 extends GhidraScript {
  @Override
  public void run() throws Exception {
    int nr = 0, dis = 0, body = 0;
    FunctionManager fm = currentProgram.getFunctionManager();
    AddressSet fall = new AddressSet();
    for (Function f : fm.getFunctions(true)) {
      if (!f.hasNoReturn()) continue;
      f.setNoReturn(false);
      nr++;
      for (Reference r : getReferencesTo(f.getEntryPoint())) {
        if (!r.getReferenceType().isCall()) continue;
        Instruction ins = getInstructionAt(r.getFromAddress());
        if (ins == null) continue;
        ins.setFlowOverride(FlowOverride.NONE);
        fall.add(ins.getMaxAddress().next());
      }
    }
    for (AddressRange rg : fall) {
      Address a = rg.getMinAddress();
      if (getInstructionAt(a) == null) {
        new DisassembleCommand(a, null, true).applyTo(currentProgram, monitor);
        dis++;
      }
    }
    for (String line : Files.readAllLines(Paths.get(getScriptArgs()[0]))) {
      line = line.trim();
      if (line.isEmpty()) continue;
      Function f = getFunctionAt(toAddr(Long.parseLong(line, 16)));
      if (f != null && CreateFunctionCmd.fixupFunctionBody(currentProgram, f, monitor)) body++;
    }
    println("FixNoReturnGh3: noreturn quitados=" + nr + " desensamblados=" + dis + " cuerpos=" + body);
  }
}
