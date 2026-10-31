# Windows 完整程序构建

本仓库的 `desktop/` 包含 Windows 桌宠源码、默认 GIF、音频和字体。Harness 插件包仅包含连接、下载与启动入口；安装插件时不需要下载整份桌面源码素材。

## 环境与命令

使用 Windows 10/11 x64、Python 3.12 x64 和 Git。从公开源码提交检出后，在仓库根目录执行：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r desktop/tools/requirements-build.txt
Push-Location desktop
..\.venv\Scripts\python.exe -m unittest discover -s tests
Pop-Location
npm test
.venv\Scripts\python.exe desktop/tools/build_portable.py
.venv\Scripts\python.exe tools/package-runtime.py
npm pack
```

界面测试使用临时配置；在桌面会话中执行，不应同时运行另一份同目录桌宠。

依赖版本固定在 `desktop/requirements.txt` 和 `desktop/tools/requirements-build.txt`。PyInstaller 使用 `--onedir --windowed`，入口是 `desktop/tools/run_pet.py`；构建脚本会收窄构建 PATH，避免其他开发工具的同名 DLL 混入。素材与字体按各自许可分发，见 `CREDITS.txt` 与 `desktop/THIRD_PARTY.txt`。

## 输出与验证

- `desktop/dist/守岸人DeepSeek桌宠/`：EXE、运行库、素材和默认配置。`--onedir` 程序依赖同目录运行库，不能只复制 EXE。
- `BUILD_INFO.json`：源码提交、源码是否有未提交改动、Python/平台和构建依赖版本。发布使用干净的源码提交；完整便携导出也保留此记录。
- 构建末尾自动执行 `desktop/tools/verify_portable.py`，在只有 Windows 系统路径的环境中运行 EXE 的 `--verify-package`，检查完整设置、字体、音频解码、动画、额度反馈与迁移相关控件。失败时不进入发布步骤。
- `tools/package-runtime.py` 生成 `release/Shorekeeper-Windows-v版本.zip`、SHA-256 清单，并把版本、字节数和摘要写入插件的 `runtime-manifest.json`。
- npm 包通过 `package.json` 的 `files` 白名单，仅打包 `lib/`、补丁、Logo、语言文件、运行包清单和解压脚本，以及 README、许可和素材说明；不包含 `desktop/` 或账户数据。

发布前应核对完整包的 `BUILD_INFO.json`、SHA-256 清单、插件清单与发布附件一致。源码构建提交与最终插件发布提交可能不同：完整包构建之后才更新其摘要；这两个提交之间不得改变桌宠运行源码。

SHA-256 校验用于确认下载内容；本地生成的构建记录不能替代独立构建证明，也不承诺不同 Windows/Python 构建环境会产生逐字节相同的 EXE。维护者可按记录中的源码提交和依赖版本自行构建检查。
