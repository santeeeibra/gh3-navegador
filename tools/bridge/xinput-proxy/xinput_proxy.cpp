// Intermediaria de xinput1_4.dll para el puente de streaming.
// - Pasa tal cual las llamadas a la xinput1_4.dll real de Windows (tus mandos siguen funcionando).
// - Al mando 0 le suma el mando virtual que llega por UDP desde 127.0.0.1:5183 (botones del navegador).
// Solo vive en la carpeta de la copia del juego; borrar esta DLL la desactiva.
#include <winsock2.h>
#include <windows.h>
#include <atomic>
#pragma comment(lib, "ws2_32.lib")

struct XPad { WORD buttons; BYTE lt, rt; SHORT lx, ly, rx, ry; };
struct XState { DWORD packet; WORD buttons; BYTE lt, rt; SHORT lx, ly, rx, ry; };
struct XCaps { BYTE type, sub; WORD flags; XPad gp; WORD vl, vr; };
static_assert(sizeof(XState)==16 && sizeof(XCaps)==20, "tamanos XInput");  // XINPUT_CAPABILITIES
struct Pkt { WORD buttons; BYTE lt, rt; SHORT lx, ly, rx, ry; };

static HMODULE g_real;
static decltype(&::GetTickCount) dummy_;
typedef DWORD (WINAPI *PFN_State)(DWORD, void*);
typedef DWORD (WINAPI *PFN_Caps)(DWORD, DWORD, void*);
typedef DWORD (WINAPI *PFN_Set)(DWORD, void*);
typedef void  (WINAPI *PFN_Enable)(BOOL);
typedef DWORD (WINAPI *PFN_Key)(DWORD, DWORD, void*);
typedef DWORD (WINAPI *PFN_Batt)(DWORD, BYTE, void*);
static PFN_State r_state, r_stateEx; static PFN_Caps r_caps; static PFN_Set r_set; static PFN_Enable r_enable; static PFN_Key r_key; static PFN_Batt r_batt;

static Pkt g_pkt{};                      // protegido por g_lock
static SRWLOCK g_lock = SRWLOCK_INIT;
static std::atomic<DWORD> g_last{0};
static std::atomic<DWORD> g_num{0};
static INIT_ONCE g_once = INIT_ONCE_STATIC_INIT;


static DWORD WINAPI Escuchar(LPVOID) {
  WSADATA w; WSAStartup(MAKEWORD(2, 2), &w);
  SOCKET s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  sockaddr_in a{}; a.sin_family = AF_INET; a.sin_port = htons(5183); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(s, (sockaddr*)&a, sizeof a) != 0) return 1;
  char buf[64];
  for (;;) {
    int n = recv(s, buf, sizeof buf, 0);
    if (n == (int)sizeof(Pkt)) { Pkt p; memcpy(&p, buf, sizeof p); AcquireSRWLockExclusive(&g_lock); g_pkt = p; ReleaseSRWLockExclusive(&g_lock); g_last = GetTickCount(); g_num++; }
    else if (n < 0) return 2;
  }
}

static BOOL CALLBACK Init(PINIT_ONCE, PVOID, PVOID*) {
  wchar_t sys[MAX_PATH]; GetSystemDirectoryW(sys, MAX_PATH); lstrcatW(sys, L"\\xinput1_4.dll");
  g_real = LoadLibraryW(sys);
  if (g_real) {
    r_state = (PFN_State)GetProcAddress(g_real, "XInputGetState");
    r_stateEx = (PFN_State)GetProcAddress(g_real, (LPCSTR)100);
    r_caps = (PFN_Caps)GetProcAddress(g_real, "XInputGetCapabilities");
    r_set = (PFN_Set)GetProcAddress(g_real, "XInputSetState");
    r_enable = (PFN_Enable)GetProcAddress(g_real, "XInputEnable");
    r_key = (PFN_Key)GetProcAddress(g_real, "XInputGetKeystroke");
    r_batt = (PFN_Batt)GetProcAddress(g_real, "XInputGetBatteryInformation");
  }
  CreateThread(nullptr, 0, Escuchar, nullptr, 0, nullptr);
  return TRUE;
}
static void init() { InitOnceExecuteOnce(&g_once, Init, nullptr, nullptr); }

static Pkt virtualActual() {
  AcquireSRWLockShared(&g_lock); Pkt p = g_pkt; ReleaseSRWLockShared(&g_lock);
  if (GetTickCount() - g_last.load() > 3000) p = Pkt{};   // sin señal: soltar todo
  return p;
}
static SHORT mayor(SHORT a, SHORT b) { return abs((int)a) >= abs((int)b) ? a : b; }

static DWORD mezclar(DWORD user, XState* s, PFN_State real) {
  DWORD rc = ERROR_DEVICE_NOT_CONNECTED;
  if (real) rc = real(user, s);
  if (user != 0) return rc;
  Pkt v = virtualActual();
  if (rc != ERROR_SUCCESS) { *s = XState{}; }
  s->buttons |= v.buttons; s->lt = max(s->lt, v.lt); s->rt = max(s->rt, v.rt);
  s->lx = mayor(s->lx, v.lx); s->ly = mayor(s->ly, v.ly); s->rx = mayor(s->rx, v.rx); s->ry = mayor(s->ry, v.ry);
  s->packet += g_num.load();
  return ERROR_SUCCESS;
}

extern "C" {
DWORD WINAPI XInputGetState(DWORD u, XState* s) { init(); return mezclar(u, s, r_state); }
DWORD WINAPI XInputGetStateEx(DWORD u, XState* s) { init(); return mezclar(u, s, r_stateEx ? r_stateEx : r_state); }
DWORD WINAPI XInputGetCapabilities(DWORD u, DWORD f, XCaps* c) {
  init(); DWORD rc = r_caps ? r_caps(u, f, c) : ERROR_DEVICE_NOT_CONNECTED;
  if (u == 0 && rc != ERROR_SUCCESS) {
    *c = XCaps{}; c->type = 1; c->sub = 1; c->gp.buttons = 0xF3FF; c->gp.lt = c->gp.rt = 255;
    c->gp.lx = c->gp.ly = c->gp.rx = c->gp.ry = (SHORT)-64; rc = ERROR_SUCCESS;
  }
  return rc;
}
DWORD WINAPI XInputSetState(DWORD u, void* v) { init(); return r_set ? r_set(u, v) : ERROR_SUCCESS; }
void WINAPI XInputEnable(BOOL e) { init(); if (r_enable) r_enable(e); }
DWORD WINAPI XInputGetKeystroke(DWORD u, DWORD r, void* k) { init(); return r_key ? r_key(u, r, k) : ERROR_EMPTY; }
DWORD WINAPI XInputGetBatteryInformation(DWORD u, BYTE t, void* b) { init(); return r_batt ? r_batt(u, t, b) : ERROR_DEVICE_NOT_CONNECTED; }
}
BOOL WINAPI DllMain(HINSTANCE, DWORD, LPVOID) { return TRUE; }
