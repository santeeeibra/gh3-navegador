@echo off
rem Aplica nombres de la base de conocimiento al proyecto Ghidra (escribe en artifacts\ghidra\proj).
rem Uso: tools\ghidra\apply-kb.cmd <names.tsv>
setlocal
for %%I in ("%~dp0..\..") do set "R=%%~fI"
set "G=%R%\artifacts\ghidra"
set "JAVA_HOME=%R%\toolchain\jdk\jdk-21.0.12.1+1"
set "APPDATA=%G%\home"
set "LOCALAPPDATA=%G%\home"
set "USERPROFILE=%G%\home"
<nul call "%R%\toolchain\ghidra\ghidra_12.1.4_PUBLIC\support\analyzeHeadless.bat" "%G%\proj" gh3 -process default-dd2ca1ab.pe -noanalysis -scriptPath "%R%\tools\ghidra\scripts" -postScript ApplyKbGh3.java "%~1" > "%G%\logs\apply-kb.out" 2>&1
endlocal
