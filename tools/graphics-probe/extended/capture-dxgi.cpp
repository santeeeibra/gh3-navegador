#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
extern "C" void* __cdecl memset(void* p,int c,size_t n){BYTE* q=(BYTE*)p;while(n--)*q++=(BYTE)c;return p;}
static HANDLE logFile;
static void log(const char* name,HRESULT hr){char s[200];DWORD n;int len=wsprintfA(s,"%s=0x%08lX\r\n",name,(DWORD)hr);WriteFile(logFile,s,len,&n,0);}
#define CHECK(name,expr) hr=(expr);log(name,hr);if(FAILED(hr))ExitProcess(1)
extern "C" void WINAPI captureMain(){
 logFile=CreateFileA("dxgi-capture.log",GENERIC_WRITE,FILE_SHARE_READ,0,CREATE_ALWAYS,0,0);
 char hstr[32];GetEnvironmentVariableA("PROBE_HWND",hstr,32);UINT_PTR h=0;for(char* s=hstr;*s>='0'&&*s<='9';++s)h=h*10+(*s-'0');HWND window=(HWND)h;
 HRESULT hr;ID3D11Device *dev=0;ID3D11DeviceContext* ctx=0;D3D_FEATURE_LEVEL fl;
 CHECK("D3D11CreateDevice",D3D11CreateDevice(0,D3D_DRIVER_TYPE_HARDWARE,0,0,0,0,D3D11_SDK_VERSION,&dev,&fl,&ctx));
 IDXGIDevice* dx=0;CHECK("Query-DXGIDevice",dev->QueryInterface(__uuidof(IDXGIDevice),(void**)&dx));
 IDXGIAdapter* adapter=0;CHECK("GetAdapter",dx->GetAdapter(&adapter));
 IDXGIOutput* output=0;DXGI_OUTPUT_DESC od;HMONITOR wanted=MonitorFromWindow(window,MONITOR_DEFAULTTONEAREST);
 for(UINT index=0;index<8;index++){hr=adapter->EnumOutputs(index,&output);log("EnumOutputs",hr);if(FAILED(hr))break;output->GetDesc(&od);log("Output-left",od.DesktopCoordinates.left);log("Output-top",od.DesktopCoordinates.top);log("Output-attached",od.AttachedToDesktop);if(od.Monitor==wanted&&od.AttachedToDesktop)break;output->Release();output=0;}
 if(!output){log("No-window-monitor",E_FAIL);ExitProcess(4);}
 IDXGIOutput1* out=0;CHECK("Query-Output1",output->QueryInterface(__uuidof(IDXGIOutput1),(void**)&out));
 IDXGIOutputDuplication* dup=0;CHECK("DuplicateOutput",out->DuplicateOutput(dev,&dup));
 DXGI_OUTDUPL_FRAME_INFO info;IDXGIResource* resource=0;
 for(int i=0;i<10;i++){hr=dup->AcquireNextFrame(1000,&info,&resource);log("AcquireNextFrame",hr);if(SUCCEEDED(hr))break;}
 if(FAILED(hr))ExitProcess(2);
 ID3D11Texture2D *frame=0,*staging=0;CHECK("Query-Texture",resource->QueryInterface(__uuidof(ID3D11Texture2D),(void**)&frame));
 D3D11_TEXTURE2D_DESC desc;frame->GetDesc(&desc);desc.Usage=D3D11_USAGE_STAGING;desc.BindFlags=0;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;desc.MiscFlags=0;
 CHECK("Create-Staging",dev->CreateTexture2D(&desc,0,&staging));ctx->CopyResource(staging,frame);
 D3D11_MAPPED_SUBRESOURCE map;CHECK("Map",ctx->Map(staging,0,D3D11_MAP_READ,0,&map));
 POINT pt={0,0};RECT rect;GetClientRect(window,&rect);ClientToScreen(window,&pt);int x=pt.x-od.DesktopCoordinates.left,y=pt.y-od.DesktopCoordinates.top,w=rect.right,ht=rect.bottom;
 if(x<0||y<0||x+w>(int)desc.Width||y+ht>(int)desc.Height){log("crop-out-of-monitor",E_INVALIDARG);ExitProcess(3);}
 BITMAPFILEHEADER fh;BITMAPINFOHEADER ih;memset(&fh,0,sizeof(fh));memset(&ih,0,sizeof(ih));fh.bfType=0x4D42;fh.bfOffBits=sizeof(fh)+sizeof(ih);fh.bfSize=fh.bfOffBits+w*ht*4;ih.biSize=sizeof(ih);ih.biWidth=w;ih.biHeight=-ht;ih.biPlanes=1;ih.biBitCount=32;ih.biSizeImage=w*ht*4;
 HANDLE file=CreateFileA("visible-dxgi.bmp",GENERIC_WRITE,0,0,CREATE_ALWAYS,0,0);DWORD written;WriteFile(file,&fh,sizeof(fh),&written,0);WriteFile(file,&ih,sizeof(ih),&written,0);
 for(int row=0;row<ht;row++)WriteFile(file,(BYTE*)map.pData+(y+row)*map.RowPitch+x*4,w*4,&written,0);CloseHandle(file);
 ctx->Unmap(staging,0);dup->ReleaseFrame();log("complete",S_OK);CloseHandle(logFile);ExitProcess(0);
}

