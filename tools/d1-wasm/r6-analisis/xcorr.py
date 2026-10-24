import sys, numpy as np
from scipy.signal import resample_poly, fftconvolve
def rd(p):
    d=np.fromfile(p,dtype='<i2',offset=44).astype(np.float32).reshape(-1,2).mean(1)
    return resample_poly(d,1,12)  # 4 kHz
N=rd(sys.argv[1]); W=rd(sys.argv[2]); fs=4000
for t in [float(x) for x in sys.argv[3].split(',')]:
    q=N[int(t*fs):int((t+4)*fs)]; q=(q-q.mean())/(q.std()+1e-9)
    c=fftconvolve(W,q[::-1],mode='valid')
    e=np.sqrt(np.maximum(fftconvolve(W**2,np.ones(len(q)),mode='valid')-fftconvolve(W,np.ones(len(q)),mode='valid')**2/len(q),1e-9))
    r=c/(e*np.sqrt(len(q))); k=int(np.argmax(r))
    print(f'nativo {t:.0f}s -> web {k/fs:.2f}s r={r[k]:.3f}')
