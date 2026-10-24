param([switch]$Dxgi,[string]$Exe='D:/guitar hero/artifacts/graphics-probe/dx9-probe.exe',[string]$Out='D:/guitar hero/artifacts/graphics-probe/extended/native-diagnostic')
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @"
using System;using System.Text;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;
public class NativeVisibleCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int l,t,r,b;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int x,y;}
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref Point p);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int z,uint flags);
 [DllImport("dwmapi.dll")] static extern int DwmFlush();
 public static string Capture(IntPtr h,string file){
  bool foreground=SetForegroundWindow(h);bool raised=SetWindowPos(h,new IntPtr(-1),0,0,0,0,3|0x40);
  System.Threading.Thread.Sleep(350);int dwm=DwmFlush();
  Rect r,wr;Point pt=new Point();GetClientRect(h,out r);GetWindowRect(h,out wr);ClientToScreen(h,ref pt);
  uint pid;GetWindowThreadProcessId(h,out pid);StringBuilder title=new StringBuilder(512);GetWindowText(h,title,512);
  int count=0;using(Bitmap bmp=new Bitmap(r.r-r.l,r.b-r.t)){using(Graphics g=Graphics.FromImage(bmp)){g.CopyFromScreen(pt.x,pt.y,0,0,bmp.Size,CopyPixelOperation.SourceCopy);}bmp.Save(file,ImageFormat.Png);for(int y=0;y<bmp.Height;y++)for(int x=0;x<bmp.Width;x++){Color c=bmp.GetPixel(x,y);if(c.R==32&&c.G==96&&c.B==160)count++;}}
  SetWindowPos(h,new IntPtr(-2),0,0,0,0,3|0x10);
  return "hwnd="+h+" pid="+pid+" title="+title+" visible="+IsWindowVisible(h)+" iconic="+IsIconic(h)+" foregroundSuccess="+foreground+" raised="+raised+" foregroundHwnd="+GetForegroundWindow()+" origin="+pt.x+","+pt.y+" size="+(r.r-r.l)+","+(r.b-r.t)+" window="+wr.l+","+wr.t+","+wr.r+","+wr.b+" dwm="+dwm+" bluePixels="+count;
 }
}
"@
$p=Start-Process -FilePath $Exe -WorkingDirectory $Out -WindowStyle Normal -PassThru
try {
 Start-Sleep -Seconds 3
 for($i=0;$i -lt 3;$i++){
  $p.Refresh();if($p.HasExited){throw "Exited before visible capture: $($p.ExitCode)"}
  [NativeVisibleCapture]::Capture($p.MainWindowHandle,"$Out/visible-$i.png") | Tee-Object -FilePath "$Out/capture-$i.txt"
    if($Dxgi -and $i -eq 1){
   $env:PROBE_HWND=$p.MainWindowHandle.ToInt64().ToString()
   $cap=Start-Process -FilePath 'D:/guitar hero/artifacts/graphics-probe/extended/capture-dxgi.exe' -WorkingDirectory $Out -WindowStyle Hidden -Wait -PassThru
   "dxgiExit=$($cap.ExitCode)" | Set-Content "$Out/dxgi-exit.txt"
   Remove-Item Env:PROBE_HWND
  }
  Start-Sleep -Seconds 2
 }
 if(-not $p.WaitForExit(20000)){throw 'Probe timeout'}
 "exitCode=$($p.ExitCode) session=$($p.SessionId)" | Set-Content "$Out/process.txt"
} finally {if(-not $p.HasExited){$p.Kill()}}




