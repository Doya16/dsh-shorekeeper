"""Build the full portable archive and pin its checksum in the market plugin."""
import hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'desktop'))
from shorekeeper_pet.paths import VERSION,PORTABLE_DIRNAME
from shorekeeper_pet.config_io import export_bundle

destination=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root/'release'
destination.mkdir(parents=True,exist_ok=True)
runtime=root/'desktop/dist'/PORTABLE_DIRNAME
settings=json.loads((root/'desktop/defaults/settings.json').read_text('utf8'))
archive=destination/f'Shorekeeper-Windows-v{VERSION}.zip'
warnings=export_bundle(archive,settings,runtime,True)
if warnings:raise RuntimeError(warnings)
digest=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
manifest=dict(version=VERSION,bytes=archive.stat().st_size,sha256=digest,url=f'https://github.com/Doya16/dsh-shorekeeper/releases/download/v{VERSION}/{archive.name}')
(root/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n','utf8')
(destination/f'Shorekeeper-SHA256SUMS-v{VERSION}.txt').write_text(f'{digest}  {archive.name}\n','utf8')
with zipfile.ZipFile(archive) as z:
 names=z.namelist()
 assert not any('shortcut' in n.lower() or '快捷方式' in n for n in names)
 assert not any('.credentials' in n or 'desktop.json' in n or 'runtime.json'==n for n in names)
 print(json.dumps(dict(**manifest,files=len(names),gif=sum(n.endswith('.gif') for n in names),fonts=sum(n.endswith(('.ttf','.otf','.ttc')) for n in names)),ensure_ascii=False))
