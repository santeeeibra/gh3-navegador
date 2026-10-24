import sys, numpy as np
from scipy.signal import resample_poly
def rd(p):
    d=np.fromfile(p,dtype='<i2',offset=44).astype(np.float32).reshape(-1,2).mean(1); return resample_poly(d,1,12)
A=rd(sys.argv[1]); B=rd(sys.argv[2]); fs=4000; a0=float(sys.argv[3]); b0=float(sys.argv[4])
best=None
for lag in range(-400,401):  # ±0.1 s refine
    q=A[int(a0*fs):int((a0+4)*fs)]; w=B[int(b0*fs)+lag:int(b0*fs)+lag+len(q)]
    r=np.corrcoef(q,w)[0,1]
    if best is None or r>best[0]: best=(r,lag)
print('refine',best[0],best[1]/fs)
off=b0+best[1]/fs-a0
for dt in range(-30,31,5):
    q=A[int((a0+dt)*fs):int((a0+dt+4)*fs)]; w=B[int((a0+dt+off)*fs):int((a0+dt+off)*fs)+len(q)]
    if len(w)==len(q) and len(q): print(f'web {a0+dt:.0f}s ~ nativo {a0+dt+off:.1f}s r={np.corrcoef(q,w)[0,1]:.3f}')
