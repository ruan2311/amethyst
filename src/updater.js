// Atualizações pela página de Releases do GitHub (ruan2311/amethyst), como no Onix.
// Procura uma versão nova ao abrir e a cada 6 h, baixa o Amethyst-win64.zip, confere o SHA-256
// publicado pelo GitHub e só instala quando a pessoa confirma: o Amethyst fecha, um script do
// Windows troca os arquivos da pasta do programa e abre o Amethyst de novo.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { spawn } = require('child_process');

const API = 'https://api.github.com/repos/ruan2311/amethyst/releases/latest';
const ASSET = 'Amethyst-win64.zip';
const TAG = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-[a-z0-9.]{1,20})?$/;
const DIGEST = /^sha256:([0-9a-f]{64})$/;
const DOWNLOAD = /^https:\/\/github\.com\/ruan2311\/amethyst\/releases\/download\/[A-Za-z0-9._-]{1,40}\/Amethyst-win64\.zip$/;
// Hosts por onde o download passa (github.com redireciona para o armazenamento de arquivos).
const DOWNLOAD_HOST = /^(github\.com|(release-assets|objects)\.githubusercontent\.com)$/;
const CHECK_MS = 6 * 60 * 60 * 1000;
const MAX_ZIP = 700 * 1024 * 1024;

const nums = (v) => { const m = TAG.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; };
function newer(a, b) {
  const x = nums(a), y = nums(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

function create({ userData, log, onChange, getAuto }) {
  const dir = path.join(userData, 'update');
  const zip = path.join(dir, ASSET);
  const infoFile = path.join(dir, 'update.json');
  fs.mkdirSync(dir, { recursive: true });

  // state: none (em dia), checking, available, downloading, ready, installing, error
  const S = { state: 'none', latest: null, url: null, sha256: null, notes: '', progress: 0, error: '', checked: 0 };
  try { Object.assign(S, JSON.parse(fs.readFileSync(infoFile, 'utf8')), { state: 'none', progress: 0, error: '' }); } catch { /* nada pendente */ }
  const current = () => app.getVersion();
  const save = () => fsp.writeFile(infoFile, JSON.stringify({ latest: S.latest, url: S.url, sha256: S.sha256, notes: S.notes, checked: S.checked })).catch(() => {});
  const set = (patch) => { Object.assign(S, patch); onChange(status()); };
  const status = () => ({ state: S.state, current: current(), latest: S.latest, notes: S.notes, progress: S.progress, error: S.error, checked: S.checked, canInstall: canInstall(), auto: getAuto() });

  async function sha256Of(file) {
    const h = crypto.createHash('sha256');
    await new Promise((ok, bad) => fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', ok).on('error', bad));
    return h.digest('hex');
  }
  function forget() {
    S.latest = S.url = S.sha256 = null; S.notes = '';
    fs.rmSync(zip, { force: true });
    save();
  }

  // Ao abrir: a versão já baixada continua valendo se ainda for mais nova e o arquivo bater.
  async function restore() {
    if (S.latest && newer(S.latest, current()) && S.url) {
      const ok = fs.existsSync(zip) && S.sha256 && (await sha256Of(zip).catch(() => '')) === S.sha256;
      set({ state: ok ? 'ready' : 'available' });
    } else forget();
  }

  async function check(manual) {
    if (S.state === 'checking' || S.state === 'downloading' || S.state === 'installing') return status();
    const before = S.state;
    set({ state: 'checking', error: '' });
    try {
      const res = await fetch(API, { headers: { 'User-Agent': 'Amethyst/' + current(), Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error('GitHub respondeu ' + res.status);
      const rel = await res.json();
      S.checked = Date.now();
      const tag = String(rel.tag_name || '');
      if (rel.draft || rel.prerelease || !nums(tag) || !newer(tag, current())) {
        forget();
        set({ state: 'none' });
        return status();
      }
      const asset = (rel.assets || []).find((a) => a.name === ASSET);
      const sha = asset && DIGEST.exec(asset.digest || '');
      if (!asset || !DOWNLOAD.test(asset.browser_download_url) || !sha || asset.size > MAX_ZIP) throw new Error('Release sem o arquivo do Windows conferido');
      const latest = tag.replace(/^v/, '');
      if (latest !== S.latest || sha[1] !== S.sha256) fs.rmSync(zip, { force: true });
      Object.assign(S, { latest, url: asset.browser_download_url, sha256: sha[1], notes: String(rel.body || '').slice(0, 6000) });
      save();
      const ready = fs.existsSync(zip) && (await sha256Of(zip)) === S.sha256;
      set({ state: ready ? 'ready' : 'available' });
      if (!ready && getAuto() && !manual) download();
    } catch (e) {
      log('[atualização]', e.message || e);
      // Na verificação automática, um erro (ex.: sem internet) não muda nada na tela.
      if (manual) set({ state: 'error', error: 'Não deu para procurar agora. Confira a internet e tente de novo.' });
      else set({ state: before === 'available' || before === 'ready' ? before : 'none' });
    }
    return status();
  }

  async function download() {
    if (S.state !== 'available' && S.state !== 'error') return status();
    if (!S.url) return check(true);
    set({ state: 'downloading', progress: 0, error: '' });
    const tmp = zip + '.part';
    try {
      const res = await fetch(S.url, { headers: { 'User-Agent': 'Amethyst/' + current() } });
      if (!res.ok || !DOWNLOAD_HOST.test(new URL(res.url).hostname)) throw new Error('download recusado (' + res.status + ')');
      const total = +res.headers.get('content-length') || 0;
      if (total > MAX_ZIP) throw new Error('arquivo grande demais');
      const h = crypto.createHash('sha256');
      const out = fs.createWriteStream(tmp);
      let got = 0, lastPct = -1;
      for await (const chunk of res.body) {
        got += chunk.length;
        if (got > MAX_ZIP) throw new Error('arquivo grande demais');
        h.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        const pct = total ? Math.floor((got / total) * 100) : 0;
        if (pct !== lastPct) { lastPct = pct; set({ progress: pct }); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      if (h.digest('hex') !== S.sha256) throw new Error('o arquivo baixado não confere com o do GitHub');
      await fsp.rename(tmp, zip);
      set({ state: 'ready', progress: 100 });
    } catch (e) {
      log('[atualização]', e.message || e);
      fs.rmSync(tmp, { force: true });
      set({ state: 'error', error: 'O download falhou: ' + (e.message || e) });
    }
    return status();
  }

  // Só o Amethyst.exe instalado pelo zip pode se atualizar (no modo de desenvolvimento, não).
  const installDir = () => path.dirname(process.execPath);
  function canInstall() {
    if (!app.isPackaged || process.platform !== 'win32') return false;
    try { return JSON.parse(fs.readFileSync(path.join(installDir(), 'resources', 'app', 'package.json'), 'utf8')).name === 'amethyst'; } catch { return false; }
  }

  async function install(relaunchArgs = []) {
    if (S.state !== 'ready' || !canInstall()) return status();
    if ((await sha256Of(zip)) !== S.sha256) { set({ state: 'available' }); return status(); }
    set({ state: 'installing' });
    const script = path.join(dir, 'aplicar.ps1');
    // Espera o Amethyst fechar, descompacta, troca a pasta resources\app e copia o resto por cima
    // (sem apagar nada fora de resources\app), e abre o Amethyst de novo.
    await fsp.writeFile(script, `param([string]$Zip, [string]$Dest, [int]$ProcId, [string]$RunArgs)
$ErrorActionPreference = 'Stop'
$log = Join-Path (Split-Path $Zip) 'aplicar.log'
function Log($m) { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format s), $m) }
try {
  Log "inicio: $Dest"
  try { Wait-Process -Id $ProcId -Timeout 60 } catch { }
  Start-Sleep -Milliseconds 800
  $tmp = Join-Path $env:TEMP ("amethyst-update-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $tar = Join-Path $env:SystemRoot 'System32\\tar.exe'
  if (Test-Path $tar) { & $tar -xf $Zip -C $tmp } else { Expand-Archive -Path $Zip -DestinationPath $tmp -Force }
  $src = Join-Path $tmp 'Amethyst'
  if (-not (Test-Path (Join-Path $src 'Amethyst.exe'))) { throw 'zip sem Amethyst.exe' }
  $app = Join-Path $Dest 'resources\\app'
  if (Test-Path $app) { Remove-Item -Path $app -Recurse -Force }
  & robocopy $src $Dest /E /R:10 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou ($LASTEXITCODE)" }
  Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $Zip -Force -ErrorAction SilentlyContinue
  Log 'ok'
} catch { Log ("erro: " + $_) }
$exe = Join-Path $Dest 'Amethyst.exe'
if ($RunArgs) { Start-Process -FilePath $exe -ArgumentList $RunArgs } else { Start-Process -FilePath $exe }
`, 'utf8');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
      '-Zip', zip, '-Dest', installDir(), '-ProcId', String(process.pid), '-RunArgs', relaunchArgs.join(' ')];
    spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    log('[atualização] instalando a', S.latest);
    setTimeout(() => app.quit(), 300);
    return status();
  }

  // Automático: confere logo depois de abrir e a cada 6 h.
  let timer = null;
  function start() {
    restore().then(() => {
      setTimeout(() => check(false), 15000);
      timer = setInterval(() => { if (getAuto()) check(false); }, CHECK_MS);
    });
  }

  return { status, check, download, install, start, stop: () => clearInterval(timer), newer };
}

module.exports = { create, newer };
