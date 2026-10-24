$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot)
$out=Join-Path $root 'artifacts/graphics-probe/native'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class ProbeCapture {
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int x,y;}
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
}
"@
$p=Start-Process -FilePath "$root/artifacts/graphics-probe/dx9-probe.exe" -WorkingDirectory $out -WindowStyle Normal -PassThru
try {
 Start-Sleep -Seconds 7
 $p.Refresh(); if($p.HasExited){throw "Probe exited before screenshot: $($p.ExitCode)"}
 $h=$p.MainWindowHandle; if($h -eq 0){throw 'No visible probe window'}
 [ProbeCapture]::SetForegroundWindow($h)|Out-Null
 Start-Sleep -Milliseconds 500
 $r=New-Object ProbeCapture+RECT; $pt=New-Object ProbeCapture+POINT
 if(-not [ProbeCapture]::GetClientRect($h,[ref]$r)){throw 'GetClientRect failed'}
 if(-not [ProbeCapture]::ClientToScreen($h,[ref]$pt)){throw 'ClientToScreen failed'}
 $bmp=New-Object System.Drawing.Bitmap ($r.right-$r.left),($r.bottom-$r.top)
 $g=[System.Drawing.Graphics]::FromImage($bmp)
 $g.CopyFromScreen($pt.x,$pt.y,0,0,$bmp.Size)
 $bmp.Save("$out/client-screen.png",[System.Drawing.Imaging.ImageFormat]::Png)
 $dc=$g.GetHdc(); $pw=[ProbeCapture]::PrintWindow($h,$dc,3); $g.ReleaseHdc($dc); $bmp.Save("$out/client-printwindow.png",[System.Drawing.Imaging.ImageFormat]::Png)
 $match=0; $samples=0
 for($y=0;$y -lt $bmp.Height;$y+=8){for($x=0;$x -lt $bmp.Width;$x+=8){$c=$bmp.GetPixel($x,$y);$samples++;if($c.R -eq 32 -and $c.G -eq 96 -and $c.B -eq 160){$match++}}}
 $result=[ordered]@{capture='PrintWindow client with PW_RENDERFULLCONTENT';screenCapture='client-screen.png';printWindowResult=$pw;width=$bmp.Width;height=$bmp.Height;expectedRgb=@(32,96,160);matchingSamples=$match;samples=$samples;allSampledPixelsMatch=($match -eq $samples);pid=$p.Id}
 $g.Dispose();$bmp.Dispose()
 if(-not $p.WaitForExit(20000)){throw 'Native probe timeout'}
 $result.exitCode=$p.ExitCode
 $result | ConvertTo-Json | Set-Content "$out/evidence.json"
 Get-Content "$out/evidence.json"; Get-Content "$out/dx9-probe.log"
} finally {if(-not $p.HasExited){$p.Kill()}}



