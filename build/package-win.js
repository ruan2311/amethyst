// Monta o Amethyst para Windows (x64) sem precisar de Windows nem Wine:
// baixa o Electron oficial, troca o nome/ícone do .exe e copia o app para dentro.
// Uso: node build/package-win.js [pasta de saída]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { downloadArtifact } = require('@electron/get');
const ResEdit = require('resedit');
const PELibrary = require('pe-library');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const electronVersion = require(path.join(root, 'node_modules', 'electron', 'package.json')).version;
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'Amethyst-win32-x64'));

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

(async () => {
  console.log(`Electron ${electronVersion} → ${out}`);
  const zip = await downloadArtifact({ version: electronVersion, platform: 'win32', arch: 'x64', artifactName: 'electron' });

  const tmp = path.join(root, 'dist', '.stage');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('python3', ['-m', 'zipfile', '-e', zip, tmp]);

  fs.renameSync(path.join(tmp, 'electron.exe'), path.join(tmp, 'Amethyst.exe'));
  fs.rmSync(path.join(tmp, 'resources', 'default_app.asar'), { force: true });

  // O app em si: package.json enxuto + src/.
  const app = path.join(tmp, 'resources', 'app');
  copyDir(path.join(root, 'src'), path.join(app, 'src'));
  const { devDependencies, scripts, ...runtimePkg } = pkg;
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(runtimePkg, null, 2));
  fs.copyFileSync(path.join(__dirname, 'LEIA-ME.txt'), path.join(tmp, 'LEIA-ME.txt'));

  // Ícone e informações do .exe (o que aparece em Propriedades → Detalhes).
  const exePath = path.join(tmp, 'Amethyst.exe');
  const exe = PELibrary.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = PELibrary.NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(root, 'src', 'assets', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data));
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const [a, b, c] = pkg.version.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'Amethyst', ProductName: 'Amethyst', CompanyName: 'Amethyst',
    OriginalFilename: 'Amethyst.exe', InternalName: 'Amethyst', LegalCopyright: '',
    FileVersion: pkg.version, ProductVersion: pkg.version
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  copyDir(tmp, out);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Pronto: ' + path.join(out, 'Amethyst.exe'));
})().catch((e) => { console.error(e); process.exit(1); });
