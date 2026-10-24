# Runs INSIDE RenderDoc's bundled Python: qrenderdoc.exe --python rdoc_extract.py
# Parameters come from env vars (qrenderdoc has no script argv):
#   GPUCAP_EXE, GPUCAP_ARGS, GPUCAP_OUT (dir), GPUCAP_FRAME (default 1)
#   or GPUCAP_RDC=<existing .rdc> to only extract.
# Output: <out>/rdoc/frame.rdc, draw-<n>.rgba (raw target bytes after each draw,
# in action order), rdoc-state.json (per-action pipeline state), rdoc.log.
import os, sys, json, time, traceback
import renderdoc as rd

OUT = os.environ['GPUCAP_OUT']
DIR = os.path.join(OUT, 'rdoc')
os.makedirs(DIR, exist_ok=True)
LOG = open(os.path.join(DIR, 'rdoc.log'), 'w')
def log(*a):
    LOG.write(' '.join(str(x) for x in a) + '\n'); LOG.flush()

def capture():
    exe = os.environ['GPUCAP_EXE']; args = os.environ.get('GPUCAP_ARGS', '')
    frame = int(os.environ.get('GPUCAP_FRAME', '1'))
    opts = rd.CaptureOptions()
    opts.delayForDebugger = 3          # time to connect and queue the frame
    opts.refAllResources = True
    res = rd.ExecuteAndInject(exe, os.path.dirname(exe), args, [], os.path.join(DIR, 'frame'), opts, False)
    log('inject', res.result, res.ident)
    if res.ident == 0: raise RuntimeError('inject failed: %s' % res.result)
    tc = None
    for _ in range(50):
        tc = rd.CreateTargetControl('', res.ident, 'gpu-capture', True)
        if tc: break
        time.sleep(0.1)
    if not tc: raise RuntimeError('no target control')
    log('target', tc.GetTarget(), tc.GetAPI(), tc.GetPID())
    with open(os.path.join(DIR, 'target-pid.txt'), 'w') as f: f.write(str(tc.GetPID()))
    tc.QueueCapture(frame, 1)
    path = None; t0 = time.time()
    while time.time() - t0 < 60:
        msg = tc.ReceiveMessage(None)
        if msg.type == rd.TargetControlMessageType.NewCapture:
            path = msg.newCapture.path; log('newcapture', path, msg.newCapture.frameNumber); break
        if msg.type == rd.TargetControlMessageType.Disconnected:
            log('disconnected before capture'); break
        if msg.type == rd.TargetControlMessageType.RegisterAPI:
            log('api', msg.apiUse.name)
    tc.Shutdown()
    if not path: raise RuntimeError('frame %d not captured' % frame)
    return path

def flatten(actions, out):
    for a in actions:
        out.append(a)
        flatten(a.children, out)
    return out

def extract(path):
    cap = rd.OpenCaptureFile()
    st = cap.OpenFile(path, '', None)
    if not st.OK(): raise RuntimeError('open %s' % st.Message())
    st, ctl = cap.OpenCapture(rd.ReplayOptions(), None)
    if not st.OK(): raise RuntimeError('replay %s' % st.Message())
    props = ctl.GetAPIProperties()
    textures = {t.resourceId: t for t in ctl.GetTextures()}
    names = {r.resourceId: r.name for r in ctl.GetResources()}
    report = {'capture': path, 'api': str(props.pipelineType), 'actions': []}
    draws = [a for a in flatten(ctl.GetRootActions(), []) if a.flags & rd.ActionFlags.Drawcall]
    selected = set(int(v) for v in os.environ.get("GPUCAP_DRAW_INDICES", "").split(",") if v)
    for i, a in enumerate(draws):
        if selected and i not in selected: continue
        ctl.SetFrameEvent(a.eventId, True)
        ps = ctl.GetPipelineState()
        outs = [o for o in ps.GetOutputTargets() if o.resource != rd.ResourceId.Null()]
        rec = {'index': i, 'eventId': a.eventId, 'name': a.GetName(ctl.GetStructuredFile()),
               'numIndices': a.numIndices, 'topology': str(ps.GetPrimitiveTopology())}
        try:
            vp = ps.GetViewport(0); rec['viewport'] = [vp.x, vp.y, vp.width, vp.height, vp.minDepth, vp.maxDepth]
            sc = ps.GetScissor(0); rec['scissor'] = [sc.x, sc.y, sc.width, sc.height]
        except Exception as e: rec['viewportError'] = str(e)
        try:
            rec['blends'] = [{'enabled': b.enabled, 'color': [str(b.colorBlend.source), str(b.colorBlend.destination), str(b.colorBlend.operation)],
                              'alpha': [str(b.alphaBlend.source), str(b.alphaBlend.destination), str(b.alphaBlend.operation)], 'writeMask': b.writeMask}
                             for b in ps.GetColorBlends()[:1]]
        except Exception as e: rec['blendError'] = str(e)
        rec['shaders'] = {}
        for stage in (rd.ShaderStage.Vertex, rd.ShaderStage.Pixel):
            sid = ps.GetShader(stage)
            rec['shaders'][str(stage)] = names.get(sid, str(sid))
        ro = []
        try:
            for used in ps.GetReadOnlyResources(rd.ShaderStage.Pixel, True):
                rid = used.descriptor.resource
                if rid != rd.ResourceId.Null():
                    t = textures.get(rid)
                    ro.append({'name': names.get(rid, str(rid)), 'format': t.format.Name() if t else None,
                               'size': [t.width, t.height] if t else None})
        except Exception as e: rec['readOnlyError'] = str(e)
        rec['pixelReadOnly'] = ro
        if outs:
            tid = outs[0].resource; t = textures[tid]
            rec['target'] = {'name': names.get(tid, str(tid)), 'format': t.format.Name(), 'size': [t.width, t.height]}
            data = ctl.GetTextureData(tid, rd.Subresource(0, 0, 0))
            rec['targetBytes'] = len(data)
            with open(os.path.join(DIR, 'draw-%03d.rgba' % i), 'wb') as f: f.write(bytes(data))
        report['actions'].append(rec)
        log('draw', i, a.eventId, rec.get('target'))
    report['drawCount'] = len(draws)
    with open(os.path.join(DIR, 'rdoc-state.json'), 'w') as f: json.dump(report, f, indent=1)
    ctl.Shutdown(); cap.Shutdown()

code = 0
try:
    path = os.environ.get('GPUCAP_RDC') or capture()
    extract(path)
    log('OK')
except Exception:
    log(traceback.format_exc()); code = 1
LOG.close()
os._exit(code)
