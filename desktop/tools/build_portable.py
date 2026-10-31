"""Build the Windows x64 runtime from the checked-out public source.

From the repository root, with Python 3.12 x64 on Windows:
    python -m pip install -r desktop/tools/requirements-build.txt
    python desktop/tools/build_portable.py
    python tools/package-runtime.py

PyInstaller bundles tools/run_pet.py and the shorekeeper_pet package. Assets,
fonts and defaults are copied from this checkout. The last step tests the EXE
with a system-only PATH. BUILD_INFO.json records the source and dependency
versions; it is a build record, not an independent attestation. See docs/BUILD.md.
"""
import os,pathlib,subprocess,sys,shutil,json,platform,importlib.metadata
sys.stdout.reconfigure(encoding='utf8')
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root))
from shorekeeper_pet.paths import APP_NAME,PORTABLE_DIRNAME,VERSION
source_revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
source_dirty=bool(subprocess.check_output(['git','status','--porcelain','--untracked-files=no','--','.'],cwd=root,text=True).strip())
args=[sys.executable,'-m','PyInstaller','--clean','--noconfirm','--onedir','--windowed','--name',APP_NAME,'--icon',str(root/'resources/icons/app.ico'),'--version-file',str(root/'tools/windows_version.txt'),'--paths',str(root),'--distpath',str(root/'dist'),'--workpath',str(root/'build'),'--specpath',str(root/'build')]
for module in ('pandas','scipy','matplotlib','tkinter','PySide6.QtWebEngineCore','PySide6.QtQml'): args+=['--exclude-module',module]
args+=[str(root/'tools/run_pet.py')]
# Do not let unrelated developer tools supply DLLs with system-library names.
# In particular, Poppler's ICU exports versioned symbols incompatible with Qt.
env=os.environ.copy()
windows=pathlib.Path(env.get('SystemRoot','C:/Windows'))
env['PATH']=os.pathsep.join(map(str,(windows/'System32',windows,pathlib.Path(sys.executable).parent)))
subprocess.run(args,cwd=root,env=env,check=True)
dest=root/'dist'/APP_NAME
named=root/'dist'/PORTABLE_DIRNAME
if named.exists():
    assert named.resolve().parent==(root/'dist').resolve()
    shutil.rmtree(named)
dest.rename(named); dest=named
for folder in ('assets','fonts','licenses','defaults','resources'):
    if (root/folder).is_dir(): shutil.copytree(root/folder,dest/folder,dirs_exist_ok=True)
(dest/'audio').mkdir(exist_ok=True)
for name in ('README.md','MIGRATION.txt','THIRD_PARTY.txt','requirements.txt','LICENSE'): shutil.copy2(root/name,dest/name)
shutil.copytree(root/'shorekeeper_pet',dest/'shorekeeper_pet',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
if (root/'docs').exists(): shutil.copytree(root/'docs',dest/'docs')
(dest/'tools').mkdir()
for name in ('run_pet.py',): shutil.copy2(root/'tools'/name,dest/'tools'/name)
build_info=dict(version=VERSION,repository='https://github.com/Doya16/dsh-shorekeeper',
    source_commit=source_revision,source_dirty=source_dirty,python=platform.python_version(),
    system=platform.system(),architecture=platform.machine(),
    dependencies={name:importlib.metadata.version(name) for name in
        ('PyInstaller','PySide6','Pillow','soundfile','cffi','numpy','imageio-ffmpeg')})
(dest/'BUILD_INFO.json').write_text(json.dumps(build_info,indent=2)+'\n',encoding='utf8')
subprocess.run([sys.executable,str(root/'tools/verify_portable.py'),str(dest)],cwd=root,check=True)
print('Built '+str(dest))
