$ErrorActionPreference='Stop'
Add-Type @"
using System;using System.Runtime.InteropServices;
public class DisplayWake {
 [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
 [DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();
}
"@
"session=$([System.Diagnostics.Process]::GetCurrentProcess().SessionId) console=$([DisplayWake]::WTSGetActiveConsoleSessionId())" | Set-Content 'D:/guitar hero/artifacts/graphics-probe/extended/native-diagnostic/display-state.txt'
$old=[DisplayWake]::SetThreadExecutionState([uint32]2147483650)
try{
 [DisplayWake]::SendMessage([IntPtr]0xFFFF,0x0112,[IntPtr]0xF170,[IntPtr](-1)) | Out-Null
 & 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -NoProfile -ExecutionPolicy Bypass -File 'D:/guitar hero/tools/graphics-probe/extended/capture-native.ps1' -Out 'D:/guitar hero/artifacts/graphics-probe/extended/native-diagnostic/display-awake'
}finally{[DisplayWake]::SetThreadExecutionState($old) | Out-Null}

