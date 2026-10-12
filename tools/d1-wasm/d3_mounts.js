// Paso D3 (--pre-js): monta carpetas del host en el sistema de archivos de Emscripten (NODEFS),
// porque las rutas de Windows con letra de unidad no son absolutas para std::filesystem.
//   GH3_GAME -> /game (carpeta del juego), GH3_DATA -> /data (usuario y caché)
Module['preRun'] = Module['preRun'] || [];
Module['preRun'].push(function () {
  if (process.env.G1_CP_WAIT) ENV.G1_CP_WAIT = process.env.G1_CP_WAIT;  // R2c: política de espera del CP
  for (const k of ['G1_R3A_YIELD', 'G1_R3A_CHECK']) if (process.env[k]) ENV[k] = process.env[k];  // R3a: solo prueba
  for (const k of ['G1_CP_ASYNC', 'G1_R3B_BUDGET_US', 'G1_R3B_BUDGET_PKTS', 'G1_R3B_FAKE_PENDING']) if (process.env[k]) ENV[k] = process.env[k];  // R3b
  for (const k of ['G1_R5SNAP', 'G1_R5SNAP_SELECT', 'G1_R5SNAP_TEST', 'G1_R5SNAP_MAX', 'G1_R5SNAP_CONSUMER']) if (process.env[k]) ENV[k] = process.env[k];  // R5snap (apagado por defecto)
  for (const k of ['G1_R5FRAME', 'G1_R5FRAME_MAX', 'G1_R5FRAME_OUT', 'G1_R5LIVE', 'G1_R5LIVE_CONSUMER', 'G1_R5LIVE_MAX']) if (process.env[k]) ENV[k] = process.env[k];  // R5F (apagado por defecto)
  for (const k of ['G1_AUDIO_TAP', 'G1_AUDIO_WAV', 'G1_WAITMULTI', 'G1_XMA_DUMP']) if (process.env[k]) ENV[k] = process.env[k];  // R6 (apagado por defecto)
  const readonly = (node) => node?.mount?.mountpoint === '/game';
  const deny = (node) => { if (readonly(node)) throw new FS.ErrnoError(69); }; // EROFS
  for (const op of ['setattr', 'mknod', 'unlink', 'rmdir', 'symlink']) {
    const original = NODEFS.node_ops[op];
    NODEFS.node_ops[op] = function(node, ...args) { deny(node); return original(node, ...args); };
  }
  const rename = NODEFS.node_ops.rename;
  NODEFS.node_ops.rename = function(node, dir, name) { deny(node); deny(dir); return rename(node, dir, name); };
  const open = NODEFS.stream_ops.open;
  NODEFS.stream_ops.open = function(stream) {
    if (readonly(stream.node) && ((stream.flags & 3) !== 0 || (stream.flags & (64 | 512 | 1024)))) deny(stream.node);
    return open(stream);
  };
  for (const op of ['write', 'msync']) {
    const original = NODEFS.stream_ops[op];
    NODEFS.stream_ops[op] = function(stream, ...args) { deny(stream.node); return original(stream, ...args); };
  }
  for (const [envName, mountPoint] of [['GH3_GAME', '/game'], ['GH3_DATA', '/data']]) {
    const root = process.env[envName];
    if (!root) throw new Error('falta la variable ' + envName);
    FS.mkdir(mountPoint);
    FS.mount(NODEFS, { root }, mountPoint);
  }
});
// R2: CPU total del proceso (todos los hilos), para comparar políticas de espera.
if (typeof ENVIRONMENT_IS_PTHREAD === 'undefined' || !ENVIRONMENT_IS_PTHREAD) {
  const r2Wall = process.hrtime.bigint();
  process.on('exit', () => {
    const u = process.cpuUsage(), wall = Number(process.hrtime.bigint() - r2Wall) / 1e9;
    process.stderr.write('[cpu] ' + JSON.stringify({ userS: u.user / 1e6, systemS: u.system / 1e6, wallS: wall, cores: (u.user + u.system) / 1e6 / wall }) + '\n');
  });
}
