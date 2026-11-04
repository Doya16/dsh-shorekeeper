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
- `desktop/tools/sign_update.py --key 私钥 清单.json` 用离线密钥生成随 Release 上传的 `清单.json.sig`。缺少该文件的版本不能在桌宠内一键安装。私钥不进入仓库，也不随程序发布。
- npm 包通过 `package.json` 的 `files` 白名单，仅打包 `lib/`、补丁、Logo、语言文件、运行包清单和解压脚本，以及 README、许可和素材说明；不包含 `desktop/` 或账户数据。

发布前应核对完整包的 `BUILD_INFO.json`、SHA-256 清单、插件清单与发布附件一致。源码构建提交与最终插件发布提交可能不同：完整包构建之后才更新其摘要；这两个提交之间不得改变桌宠运行源码。

## npm 发布与源码对应

最终版本号、README、运行包清单和所有发布文件先提交并推送到公开的 `origin/main`。从该提交新建普通 Git clone 发布（保留 `.git/` 目录，不使用源码 ZIP、linked worktree 或已打好的 TGZ 作为发布输入）：

```powershell
git clone --config core.autocrlf=false https://github.com/Doya16/dsh-shorekeeper.git shorekeeper-release
cd shorekeeper-release
# 检出本次已经推送到 main 的完整提交 SHA
git checkout --detach <release-commit>
npm test
npm run verify:publish
npm publish --dry-run
npm publish --access public --registry=https://registry.npmjs.org/
```

`prepublishOnly` 会自动检查：工作区干净、HEAD 与公开 `origin/main` 一致、npm 待打包的每个文件都存在于 HEAD，并且与 Git blob **逐字节一致**。不能只依赖 `git status`：Git 换行归一化可能把含 CRLF 的工作区报告为干净。检查不修改文件，遇到差异就停止发布。`prepare` / `prepack` / `postpack` 等可能在检查后改写内容的钩子也会阻止发布。

本仓库 `.gitattributes` 固定文本文件使用 LF；生成 `runtime-manifest.json` 的脚本也显式写入 LF。不要跳过发布钩子，不要使用 `npm publish 某个.tgz`；直接从 Git 目录发布，让 npm 记录当前提交的 `gitHead`，不手工填写该字段。发布前不要修改或重新生成已提交的文件。

发布后使用真实版本号核验公开 registry，先等待 npm 完成处理，再执行：

```powershell
python tools/verify-npm-release.py <version>
```

该工具核对 npm `gitHead`、下载摘要和实际 TGZ 内每个文件与对应 Git blob 的原始字节，不会忽略换行差异。通过后才在社区申请中注明源码一致性。发布钩子只在发布源码时使用，不在用户安装插件时运行。

SHA-256 校验用于确认下载内容；本地生成的构建记录不能替代独立构建证明，也不承诺不同 Windows/Python 构建环境会产生逐字节相同的 EXE。维护者可按记录中的源码提交和依赖版本自行构建检查。

## v1.2 程序更新包与恢复

构建脚本另外构建两个只依赖 Python 标准库的 `--onefile --windowed` 程序：`desktop/tools/run_bootstrap.py`（根目录友好名称启动器）和 `desktop/tools/run_updater.py`（独立安装助手）。Qt 程序位于 `.programs/<version>/`，根目录 `current-program.json` 选择当前版本，素材及配置仍位于根目录。

`tools/package-runtime.py` 同时生成 `Shorekeeper-Program-Update-v<version>.zip` 及 `Shorekeeper-AutoUpdate-v<version>.json`，插件清单也记录程序包信息。每个文件有大小和 SHA-256，下载后全部校验；仅允许程序路径，不允许覆盖配置、GIF、音频、字体和默认素材。程序包包含完整运行库，不是二进制差分；首次安装仍下载完整包。

安装助手先保留旧版本并备份即将覆盖的程序文件与设置，再写入 `.update-transaction.json`，完整部署新版后原子切换版本指针。新版必须报告匹配进程、版本和随机更新标识的持续健康状态。失败时恢复快照；下次启动会恢复未提交的安装事务、清理已退出进程拥有的下载缓存。个人素材不参与替换或删除。旧安装首次迁入此布局时，原根目录 EXE 也有备份。恢复和下载操作都限制在本桌宠目录中，无需管理员权限。

桌宠可独立更新运行程序；Harness npm 连接插件仍通过插件管理更新。连接协议当前为 1；高版本桌面程序不会被旧 npm 清单降级，协议不兼容的程序更新会被拒绝。
