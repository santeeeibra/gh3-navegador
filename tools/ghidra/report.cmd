@echo off
rem Informe Ghidra (solo lectura) sobre el proyecto artifacts\ghidra\proj\gh3.
rem Uso: tools\ghidra\report.cmd <carpeta-salida> <dir1+dir2+...> [profundidad]
rem Configuracion de Ghidra/Java redirigida a artifacts\ghidra\home (nada fuera del proyecto).
setlocal
for %%I in ("%~dp0..\..") do set "R=%%~fI"
set "G=%R%\artifacts\ghidra"
set "JAVA_HOME=%R%\toolchain\jdk\jdk-21.0.12.1+1"
set "APPDATA=%G%\home"
set "LOCALAPPDATA=%G%\home"
set "USERPROFILE=%G%\home"
<nul call "%R%\toolchain\ghidra\ghidra_12.1.4_PUBLIC\support\analyzeHeadless.bat" "%G%\proj" gh3 -process default-dd2ca1ab.pe -noanalysis -readOnly -scriptPath "%R%\tools\ghidra\scripts" -postScript ReportGh3.java "%~1" %2 %3 > "%~1.log" 2>&1
endlocal
