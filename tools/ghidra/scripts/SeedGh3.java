// Prescript: bloques de memoria según las secciones del PE de la XEX (imagen en memoria)
// y funciones iniciales desde la lista de rexglue (artifacts/ghidra/functions.txt).
// Argumento: ruta a functions.txt
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.mem.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import java.nio.file.*;
import java.util.*;

public class SeedGh3 extends GhidraScript {
  @Override
  public void run() throws Exception {
    Memory mem = currentProgram.getMemory();
    MemoryBlock blk = mem.getBlocks()[0];
    Address base = blk.getStart();
    // Partir el bloque único según las secciones del PE.
    byte[] hdr = new byte[0x1000];
    blk.getBytes(base, hdr);
    java.nio.ByteBuffer bb = java.nio.ByteBuffer.wrap(hdr).order(java.nio.ByteOrder.LITTLE_ENDIAN);
    int pe = bb.getInt(0x3c);
    int ns = bb.getShort(pe + 6) & 0xffff, oh = bb.getShort(pe + 20) & 0xffff;
    int s = pe + 24 + oh;
    List<long[]> secs = new ArrayList<>();
    List<String> names = new ArrayList<>();
    for (int i = 0; i < ns; i++, s += 40) {
      String n = new String(hdr, s, 8, "latin1").replace("\0", "");
      long va = bb.getInt(s + 12) & 0xffffffffL;
      long fl = bb.getInt(s + 36) & 0xffffffffL;
      secs.add(new long[] {va, fl});
      names.add(n);
    }
    for (int i = secs.size() - 1; i >= 0; i--) {
      Address a = base.add(secs.get(i)[0]);
      MemoryBlock b = mem.getBlock(a);
      if (b == null) continue;
      if (!b.getStart().equals(a)) { mem.split(b, a); b = mem.getBlock(a); }
      b.setName(names.get(i));
      long fl = secs.get(i)[1];
      b.setRead(true);
      b.setWrite((fl & 0x80000000L) != 0);
      b.setExecute((fl & 0x20000000L) != 0);
    }
    mem.getBlock(base).setName("HEADER");
    Path list = Paths.get(getScriptArgs()[0]);
    int ok = 0, bad = 0;
    for (String line : Files.readAllLines(list)) {
      line = line.trim();
      if (line.isEmpty()) continue;
      Address a = toAddr(Long.parseLong(line, 16));
      new DisassembleCommand(a, null, true).applyTo(currentProgram, monitor);
      if (getFunctionAt(a) == null) {
        if (new CreateFunctionCmd(a).applyTo(currentProgram, monitor)) ok++; else bad++;
      }
    }
    println("SeedGh3: secciones=" + ns + " funciones ok=" + ok + " fallidas=" + bad);
  }
}
