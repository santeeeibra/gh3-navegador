#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d9.h>
#if PROBE_CASE == 3
#include "gradient-bytecode.h"
#include "vertex-bytecode.h"
#endif
static HANDLE logFile;
static DWORD started;
static void record(const char* stage, DWORD value) {
 char line[256]; DWORD written;
 int n=wsprintfA(line,"t=%lu stage=%s result=0x%08lX\r\n",GetTickCount()-started,stage,value);
 OutputDebugStringA(line);
 if(logFile!=INVALID_HANDLE_VALUE){WriteFile(logFile,line,n,&written,0);FlushFileBuffers(logFile);}
}
static LRESULT CALLBACK wndproc(HWND w,UINT m,WPARAM a,LPARAM b){
 if(m==WM_CLOSE){DestroyWindow(w);return 0;}
 if(m==WM_DESTROY){PostQuitMessage(0);return 0;}
 return DefWindowProcA(w,m,a,b);
}
extern "C" void* __cdecl memset(void* p,int c,size_t n){unsigned char* q=(unsigned char*)p;while(n--)*q++=(unsigned char)c;return p;}
static void captureTarget(IDirect3DDevice9* dev){
 IDirect3DSurface9 *back=0,*copy=0;D3DSURFACE_DESC desc;D3DLOCKED_RECT locked;
 HRESULT hr=dev->GetBackBuffer(0,0,D3DBACKBUFFER_TYPE_MONO,&back);record("capture-GetBackBuffer",hr);if(FAILED(hr))return;
 hr=back->GetDesc(&desc);record("capture-GetDesc",hr);
 hr=dev->CreateOffscreenPlainSurface(desc.Width,desc.Height,desc.Format,D3DPOOL_SYSTEMMEM,&copy,0);record("capture-CreateSurface",hr);
 if(SUCCEEDED(hr)){hr=dev->GetRenderTargetData(back,copy);record("capture-GetRenderTargetData",hr);
  if(SUCCEEDED(hr)){hr=copy->LockRect(&locked,0,D3DLOCK_READONLY);record("capture-LockRect",hr);
   if(SUCCEEDED(hr)){
    HANDLE file=CreateFileA("render-target.bmp",GENERIC_WRITE,0,0,CREATE_ALWAYS,0,0);record("capture-file",file==INVALID_HANDLE_VALUE?GetLastError():0);
    if(file!=INVALID_HANDLE_VALUE){
     BITMAPFILEHEADER fh;BITMAPINFOHEADER ih;memset(&fh,0,sizeof(fh));memset(&ih,0,sizeof(ih));
     fh.bfType=0x4D42;fh.bfOffBits=sizeof(fh)+sizeof(ih);fh.bfSize=fh.bfOffBits+desc.Width*desc.Height*4;
     ih.biSize=sizeof(ih);ih.biWidth=desc.Width;ih.biHeight=-(LONG)desc.Height;ih.biPlanes=1;ih.biBitCount=32;ih.biSizeImage=desc.Width*desc.Height*4;
     DWORD written;WriteFile(file,&fh,sizeof(fh),&written,0);WriteFile(file,&ih,sizeof(ih),&written,0);
     for(UINT y=0;y<desc.Height;y++)WriteFile(file,(BYTE*)locked.pBits+y*locked.Pitch,desc.Width*4,&written,0);
     CloseHandle(file);
    }copy->UnlockRect();
   }
  }copy->Release();
 }back->Release();
}
struct ColorVertex{float x,y,z,rhw;DWORD color;};
struct TextureVertex{float x,y,z,rhw;DWORD color;float u,v;};
static IDirect3DTexture9* texture=0;
static IDirect3DPixelShader9* shader=0;
static IDirect3DVertexShader9* vertexShader=0;static IDirect3DVertexDeclaration9* declaration=0;
static HRESULT checked(const char* stage,HRESULT hr){record(stage,hr);return hr;}
static bool setup(IDirect3DDevice9* d){
 if(FAILED(checked("SetRenderState-CULL_NONE",d->SetRenderState(D3DRS_CULLMODE,D3DCULL_NONE))))return false;
 if(FAILED(checked("SetRenderState-lighting-off",d->SetRenderState(D3DRS_LIGHTING,FALSE))))return false;
#if PROBE_CASE == 1
 return SUCCEEDED(checked("SetFVF-XYZRHW-DIFFUSE",d->SetFVF(D3DFVF_XYZRHW|D3DFVF_DIFFUSE)));
#elif PROBE_CASE == 2 || PROBE_CASE == 3
#if PROBE_CASE == 2
 if(FAILED(checked("SetFVF-XYZRHW-DIFFUSE-TEX1",d->SetFVF(D3DFVF_XYZRHW|D3DFVF_DIFFUSE|D3DFVF_TEX1))))return false;
#endif
#if PROBE_CASE == 2
 if(FAILED(checked("CreateTexture-8x8-A8R8G8B8-MANAGED",d->CreateTexture(8,8,1,0,D3DFMT_A8R8G8B8,D3DPOOL_MANAGED,&texture,0))))return false;
 D3DLOCKED_RECT lock;if(FAILED(checked("Texture-LockRect",texture->LockRect(0,&lock,0,0))))return false;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++)((DWORD*)((BYTE*)lock.pBits+y*lock.Pitch))[x]=((x+y)&1)?D3DCOLOR_XRGB(255,210,32):D3DCOLOR_XRGB(200,32,80);
 if(FAILED(checked("Texture-UnlockRect",texture->UnlockRect(0))))return false;
 if(FAILED(checked("SetTexture",d->SetTexture(0,texture))))return false;
 if(FAILED(checked("TextureStage-COLOROP-select",d->SetTextureStageState(0,D3DTSS_COLOROP,D3DTOP_SELECTARG1))))return false;
 if(FAILED(checked("TextureStage-COLORARG1-texture",d->SetTextureStageState(0,D3DTSS_COLORARG1,D3DTA_TEXTURE))))return false;
 if(FAILED(checked("Sampler-MIN-point",d->SetSamplerState(0,D3DSAMP_MINFILTER,D3DTEXF_POINT))))return false;
 if(FAILED(checked("Sampler-MAG-point",d->SetSamplerState(0,D3DSAMP_MAGFILTER,D3DTEXF_POINT))))return false;
 if(FAILED(checked("Sampler-U-clamp",d->SetSamplerState(0,D3DSAMP_ADDRESSU,D3DTADDRESS_CLAMP))))return false;
 if(FAILED(checked("Sampler-V-clamp",d->SetSamplerState(0,D3DSAMP_ADDRESSV,D3DTADDRESS_CLAMP))))return false;
#else
  D3DVERTEXELEMENT9 elems[]={{0,0,D3DDECLTYPE_FLOAT4,D3DDECLMETHOD_DEFAULT,D3DDECLUSAGE_POSITION,0},{0,16,D3DDECLTYPE_FLOAT2,D3DDECLMETHOD_DEFAULT,D3DDECLUSAGE_TEXCOORD,0},D3DDECL_END()};
 if(FAILED(checked("CreateVertexDeclaration",d->CreateVertexDeclaration(elems,&declaration))))return false;
 if(FAILED(checked("SetVertexDeclaration",d->SetVertexDeclaration(declaration))))return false;
 if(FAILED(checked("CreateVertexShader-vs2",d->CreateVertexShader((const DWORD*)vertexBytecode,&vertexShader))))return false;
 if(FAILED(checked("SetVertexShader",d->SetVertexShader(vertexShader))))return false;
 if(FAILED(checked("CreatePixelShader-ps2",d->CreatePixelShader((const DWORD*)gradientBytecode,&shader))))return false;
 if(FAILED(checked("SetPixelShader",d->SetPixelShader(shader))))return false;
#endif
 return true;
#else
 return true;
#endif
}
static HRESULT draw(IDirect3DDevice9* d,bool first){
 HRESULT hr=d->BeginScene();if(first||FAILED(hr))record("BeginScene",hr);if(FAILED(hr))return hr;
#if PROBE_CASE == 1
 ColorVertex v[]={{320,80,0,1,0xFFFF0000},{100,400,0,1,0xFF00FF00},{540,400,0,1,0xFF0000FF}};
 hr=d->DrawPrimitiveUP(D3DPT_TRIANGLELIST,1,v,sizeof(ColorVertex));
#elif PROBE_CASE == 2
 TextureVertex v[]={{80,80,0,1,0xFFFFFFFF,0,0},{560,80,0,1,0xFFFFFFFF,1,0},{80,400,0,1,0xFFFFFFFF,0,1},{560,400,0,1,0xFFFFFFFF,1,1}};
 hr=d->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP,2,v,sizeof(TextureVertex));
#elif PROBE_CASE == 3
 struct ShaderVertex{float x,y,z,w,u,v;};
 ShaderVertex v[]={{-.75f,2.f/3.f,0,1,0,0},{.75f,2.f/3.f,0,1,1,0},{-.75f,-2.f/3.f,0,1,0,1},{.75f,-2.f/3.f,0,1,1,1}};
 hr=d->DrawPrimitiveUP(D3DPT_TRIANGLESTRIP,2,v,sizeof(ShaderVertex));
#else
 hr=S_OK;
#endif
 if(first||FAILED(hr))record("DrawPrimitiveUP",hr);
 HRESULT end=d->EndScene();if(first||FAILED(end))record("EndScene",end);return FAILED(hr)?hr:end;
}
extern "C" void WINAPI probeMain(){
 started=GetTickCount();
 logFile=CreateFileA("dx9-probe.log",GENERIC_WRITE,FILE_SHARE_READ,0,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,0);
 record("log-open",logFile==INVALID_HANDLE_VALUE?GetLastError():0);
 record("start-x86-640x480-rgb32-96-160-duration15000",0);
 WNDCLASSA wc; memset(&wc,0,sizeof(wc));
 wc.lpfnWndProc=wndproc;wc.hInstance=GetModuleHandleA(0);wc.lpszClassName="IndependentDX9Probe";wc.hCursor=LoadCursorA(0,IDC_ARROW);
#if PROBE_CASE == 4
 wc.hbrBackground=CreateSolidBrush(RGB(32,96,160));
#endif
 if(!RegisterClassA(&wc)){record("RegisterClass-failed",GetLastError());ExitProcess(1);}record("RegisterClass",0);
 RECT r={0,0,640,480};DWORD style=WS_OVERLAPPED|WS_CAPTION|WS_SYSMENU|WS_MINIMIZEBOX;
 if(!AdjustWindowRect(&r,style,FALSE)){record("AdjustWindowRect-failed",GetLastError());ExitProcess(2);}
 HWND w=CreateWindowExA(0,wc.lpszClassName,PROBE_TITLE,style,40,40,r.right-r.left,r.bottom-r.top,0,0,wc.hInstance,0);
 if(!w){record("CreateWindow-failed",GetLastError());ExitProcess(3);}record("CreateWindow-client640x480",0);ShowWindow(w,SW_SHOWNORMAL);ShowWindow(w,SW_SHOW);UpdateWindow(w);
 #if PROBE_CASE == 4
 DWORD until=GetTickCount();while(GetTickCount()-until<15000){MSG m;while(PeekMessageA(&m,0,0,0,PM_REMOVE)){TranslateMessage(&m);DispatchMessageA(&m);}Sleep(16);}DestroyWindow(w);record("gdi-control-exit",0);ExitProcess(0);
#endif
 IDirect3D9* d=Direct3DCreate9(D3D_SDK_VERSION);
 if(!d){record("Direct3DCreate9-NULL",GetLastError());DestroyWindow(w);ExitProcess(4);}record("Direct3DCreate9",0);
 D3DPRESENT_PARAMETERS pp;memset(&pp,0,sizeof(pp));pp.BackBufferWidth=640;pp.BackBufferHeight=480;pp.BackBufferFormat=D3DFMT_UNKNOWN;pp.BackBufferCount=1;pp.SwapEffect=D3DSWAPEFFECT_DISCARD;pp.hDeviceWindow=w;pp.Windowed=TRUE;pp.PresentationInterval=D3DPRESENT_INTERVAL_IMMEDIATE;
 IDirect3DDevice9* dev=0;
 HRESULT hr=d->CreateDevice(D3DADAPTER_DEFAULT,D3DDEVTYPE_HAL,w,D3DCREATE_SOFTWARE_VERTEXPROCESSING,&pp,&dev);record("CreateDevice-HAL-softwareVertexProcessing",hr);
 if(FAILED(hr)||!dev){d->Release();DestroyWindow(w);ExitProcess(5);}
 if(!setup(dev)){record("setup-failed",1);ExitProcess(9);}
 char captureFlag[8];BOOL captureEnabled=GetEnvironmentVariableA("DX9_CAPTURE",captureFlag,sizeof(captureFlag))>0;
 DWORD loopStart=GetTickCount(),frames=0,next=0;BOOL quit=FALSE;DWORD exitCode=0;
 while(GetTickCount()-loopStart<15000&&!quit){
  MSG msg;while(PeekMessageA(&msg,0,0,0,PM_REMOVE)){if(msg.message==WM_QUIT)quit=TRUE;TranslateMessage(&msg);DispatchMessageA(&msg);}if(quit)break;
  hr=dev->Clear(0,0,D3DCLEAR_TARGET,D3DCOLOR_XRGB(32,96,160),1.0f,0);
  if(FAILED(hr)||frames==0)record("Clear",hr);if(FAILED(hr)){exitCode=6;break;}
  hr=draw(dev,frames==0);if(FAILED(hr)){exitCode=10;break;}
  if(frames==0&&captureEnabled)captureTarget(dev);
  hr=dev->Present(0,0,0,0);if(FAILED(hr)||frames==0)record("Present",hr);if(FAILED(hr)){exitCode=7;break;}
  ++frames;if(GetTickCount()-loopStart>=next){record("presented-frame-count",frames);next+=1000;}Sleep(16);
 }
 record("render-elapsed-ms",GetTickCount()-loopStart);record("final-frame-count",frames);
 if(quit){record("closed-before-duration",1);exitCode=8;}
 if(texture){record("Texture-Release",texture->Release());}if(shader){record("Shader-Release",shader->Release());}
 if(vertexShader)record("VertexShader-Release",vertexShader->Release());if(declaration)record("Declaration-Release",declaration->Release());
 record("Device-Release",dev->Release());record("D3D9-Release",d->Release());if(IsWindow(w))DestroyWindow(w);
 record("exit-code",exitCode);if(logFile!=INVALID_HANDLE_VALUE)CloseHandle(logFile);ExitProcess(exitCode);
}
extern "C" { int _fltused=0; }







