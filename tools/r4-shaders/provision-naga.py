"""Provision pinned Naga with serial downloads and offline Cargo.

No rustup, global PATH changes, or Cargo network access. Run from any directory.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / 'toolchain/r4-downloads'
INSTALL = ROOT / 'toolchain/r4-rust'
SOURCES = ROOT / 'toolchain/r4-naga'
VERSION = '30.0.0'
TARGET = 'x86_64-pc-windows-msvc'
DOWNLOADS.mkdir(parents=True, exist_ok=True)
SOURCES.mkdir(parents=True, exist_ok=True)
records = []

def fetch(url, filename, expected=None):
    path = DOWNLOADS / filename
    if not path.exists() or (expected and hashlib.sha256(path.read_bytes()).hexdigest() != expected):
        subprocess.run(['curl.exe', '--location',
                        '--fail', '--silent', '--show-error', '--output', str(path), url], check=True)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected and digest != expected:
        raise RuntimeError(f'Checksum mismatch: {filename}')
    records.append({'url': url, 'file': filename, 'bytes': path.stat().st_size,
                    'sha256': digest, 'verifiedAgainstManifest': bool(expected)})
    print(f'{filename}: {path.stat().st_size} bytes, sha256 {digest}', flush=True)
    return path

manifest_path = DOWNLOADS / 'channel-rust-stable.toml'
manifest = tomllib.loads(manifest_path.read_text(encoding='utf-8'))
for component in ['rustc', 'cargo', 'rust-std']:
    package = manifest['pkg'][component]['target'][TARGET]
    archive = fetch(package['xz_url'], package['xz_url'].rsplit('/', 1)[1], package['xz_hash'])
    with tarfile.open(archive) as tar:
        tar.extractall(DOWNLOADS / 'unpacked', filter='data')
        top = tar.getnames()[0].split('/')[0]
    component_path = DOWNLOADS / 'unpacked' / top / (f'rust-std-{TARGET}' if component == 'rust-std' else component)
    shutil.copytree(component_path, INSTALL, dirs_exist_ok=True)

crate = fetch(f'https://crates.io/api/v1/crates/naga-cli/{VERSION}/download', f'naga-cli-{VERSION}.crate')
with tarfile.open(crate) as tar:
    tar.extractall(SOURCES, filter='data')
project = SOURCES / f'naga-cli-{VERSION}'
lock = tomllib.loads((project / 'Cargo.lock').read_text(encoding='utf-8'))
vendor = SOURCES / 'vendor'
vendor.mkdir(exist_ok=True)
for package in lock['package']:
    if 'source' not in package:
        continue
    if not package['source'].startswith('registry+'):
        raise RuntimeError(f'Unsupported nonregistry source: {package["source"]}')
    name, version = package['name'], package['version']
    filename = f'{name}-{version}.crate'
    archive = fetch(f'https://static.crates.io/crates/{name}/{filename}', filename, package['checksum'])
    with tarfile.open(archive) as tar:
        tar.extractall(vendor, filter='data')
    directory = vendor / f'{name}-{version}'
    files = {str(p.relative_to(directory)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in directory.rglob('*') if p.is_file() and p.name != '.cargo-checksum.json'}
    (directory / '.cargo-checksum.json').write_text(json.dumps({'files': files, 'package': package['checksum']}), encoding='utf-8')

(project / '.cargo').mkdir(exist_ok=True)
(project / '.cargo/config.toml').write_text(
    '[source.crates-io]\nreplace-with = "vendored-sources"\n'
    '[source.vendored-sources]\ndirectory = "../vendor"\n'
    '[net]\noffline = true\n', encoding='utf-8')
report = {'nagaCli': VERSION, 'rustManifestDate': manifest['date'], 'target': TARGET,
          'downloadLimitBytesPerSecond': None, 'serialDownloads': True, 'files': records}
(ROOT / 'artifacts/r4-shaders/toolchain-downloads.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('Ready for offline build:', project, flush=True)
