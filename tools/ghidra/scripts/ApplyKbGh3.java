// Aplica nombres de la base de conocimiento (tools/re) al proyecto Ghidra.
// Argumento: <names.tsv> con columnas kind, addr, name, comment (generado por tools/re/re.mjs).
// kind=func: crea la función si falta y la renombra; kind=global: etiqueta. Comentario de placa opcional.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

public class ApplyKbGh3 extends GhidraScript {
  @Override
  public void run() throws Exception {
    int fn = 0, gl = 0, created = 0, bad = 0;
    for (String line : Files.readAllLines(Paths.get(getScriptArgs()[0]), StandardCharsets.UTF_8)) {
      String[] c = line.split("\t", -1);
      if (c.length < 3 || c[0].equals("kind")) continue;
      Address ad = toAddr(Long.parseLong(c[1], 16));
      String name = c[2].replaceAll("[^A-Za-z0-9_]", "_");
      String comment = c.length > 3 ? c[3] : "";
      try {
        if (c[0].equals("func")) {
          Function f = getFunctionAt(ad);
          if (f == null) { f = createFunction(ad, name); created++; }
          if (f == null) { bad++; continue; }
          f.setName(name, SourceType.USER_DEFINED);
          if (!comment.isEmpty()) f.setComment(comment);
          fn++;
        } else {
          createLabel(ad, name, true, SourceType.USER_DEFINED);
          if (!comment.isEmpty()) setPlateComment(ad, comment);
          gl++;
        }
      } catch (Exception e) {
        bad++;
        println("fallo " + c[1] + " " + name + ": " + e.getMessage());
      }
    }
    println("ApplyKbGh3: funciones " + fn + " (creadas " + created + "), globales " + gl + ", fallos " + bad);
  }
}
