import sys, numpy as np
from scipy.signal import resample_poly, fftconvolve
def rd(p):
    d=np.fromfile(p,dtype='<i2',offset=44).astype(np.float32).reshape(-1,2).mean(1); return resample_poly(d,1,12)
A=rd(sys.argv[1]); B=rd(sys.argv[2]); fs=4000; a0=float(sys.argv[3]); off=float(sys.argv[4]); span=float(sys.argv[5]); W=2.0
for k in range(int(span/W)):
    t=a0+k*W; q=A[int(t*fs):int((t+W)*fs)]
    s=int((t+off-1.0)*fs); w=B[s:s+len(q)+2*fs]
    if len(w)<len(q)+2*fs: break
    q=(q-q.mean())/(q.std()+1e-9); c=fftconvolve(w,q[::-1],mode='valid')
    e=np.sqrt(np.maximum(fftconvolve(w**2,np.ones(len(q)),'valid')-fftconvolve(w,np.ones(len(q)),'valid')**2/len(q),1e-9))
    r=c/(e*np.sqrt(len(q))); j=int(np.argmax(r))
    print(f'web {t:.0f}s  r={r[j]:.2f}  corrimiento={(j/fs-1.0)*1000:+.0f} ms')
