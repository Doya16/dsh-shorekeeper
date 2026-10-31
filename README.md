# 守岸人桌宠 · DeepSeek Harness 完整版插件

让守岸人陪你使用 DeepSeek Harness：跟随任务换表情，用你挑选的语音和字幕回应，把 GIF、字体、音频和配置一起带到新电脑。

[下载与版本](https://github.com/Doya16/dsh-shorekeeper/releases/latest) · [原独立安装版](https://github.com/Doya16/shorekeeper-deepseek-pet) · [测试记录](docs/VALIDATION.md) · [数据与运行说明](docs/SECURITY.md)

本项目是独立发布的 **Harness 市场完整版**，基于守岸人 DeepSeek 桌宠 v0.5.1，保留完整桌面功能，去掉创建桌面快捷方式。原独立版仓库和版本继续保留。

适用于 **Windows 10/11 x64 上的本机 Harness**。内置 **三套 83 个 GIF、40 个音频、54 组语音字幕配对和两款字体**，无需安装 Python。桌宠可放在桌面任意位置；远程服务器、macOS 和 Linux 不在本版支持范围。

## 开始使用

1. 安装并登录 [DeepSeek Harness](https://www.deepseek.com/harness/)。本版验证环境为 **0.2.1-rc.5**。
2. 在 Harness 安装并启用 `dsh-shorekeeper`。
3. 点击窗口右下角 **守岸人桌宠 → 下载并安装完整版**。首次下载约 213 MiB，可选自动、GitHub 或镜像加速。
4. 点击 **启动桌宠**。右键桌宠 → **设置…**，或从插件入口点击 **打开完整设置**。

社区收录需由市场维护者审核，提交申请不代表已在市场上线。审核前可从本项目 Release 下载 `dsh-shorekeeper-1.1.0.tgz`，通过 Harness 插件安装入口安装；也可使用 CLI：

```powershell
dsh plugin --profile desktop add C:\Downloads\dsh-shorekeeper-1.1.0.tgz
```

安装后启用插件即可，无需另外安装旧版的连接插件。若同时运行原独立版，可能出现两只桌宠；按需要关闭其中一只。

![完整设置与实时大小预览](docs/images/full-settings.png)

## 完整自定义

| 想做什么 | 在哪里操作 |
| --- | --- |
| 为每个动作选择 GIF、动态 WebP 或图片 | 设置 → 交互工作室 → GIF 素材 |
| 添加自己的表情并预览 | 导入图片，或打开素材目录 → 放入文件 → 刷新素材 |
| 调整循环、速度、单次播放与下一状态 | 交互工作室 → 播放与切换 |
| 同一动作随机播放多条音频，每条单独配字幕 | 交互工作室 → 语音与配对气泡 |
| 气泡只使用音频对应的字幕 | 气泡与字体 → 自定义音频+字幕 |
| 思考每轮只播一次；待机每次、每次启动一次或偶尔播报 | 交互工作室 → 语音触发频率 |
| 字体、字号、气泡宽度、底栏大小与实时预览 | 设置 → 字体与大小 |
| 静音、锁定淡化、小锁大小、托盘图标 | 设置 → 桌面与声音 |
| 保存、导入、导出素材和完整便携包 | 设置 → 保存与迁移 |
| 随 Harness 启动、退出；选择跟随的会话 | 设置 → 连接 DeepSeek |
| 启动检查更新、手动检查、选择网络来源 | 设置 → 版本与更新 |

支持 GIF、动画 WebP、PNG、JPG/JPEG、静态 WebP；音频支持 WAV、MP3、OGG、FLAC、M4A、AAC；字体支持 TTF、OTF、TTC。同名 UTF-8 TXT 可随音频导入为台词。不添加音频也能使用。

![GIF 素材与交互工作室](docs/images/full-studio.png)

![多语音与逐条配对字幕](docs/images/paired-voices.png)

## 任务与桌面互动

- 思考、查阅、编辑、执行、等待回应、完成、报错和暂停有各自的动画。
- 多个会话分别完成时排队提醒，另一个任务仍在运行也不会漏掉。
- 单击、双击、拖动、放下、悬停和投喂可以分别绑定表情、语音与气泡。
- 语音完整播完，任务过程中的状态切换不会反复触发任务开始语音。
- Ctrl + 滚轮缩放；拖动气泡或余额框左右边缘调整尺寸，之后随桌宠等比例缩放。
- 鼠标移到角色上显示小锁。锁定后角色区域点击穿透；悬停角色或余额框时，两者按设置一起淡化，余额框仍可点击刷新。
- **安静陪伴（静音）** 立即停止并暂停声音，取消后恢复。
- 余额框显示账户充值和赠送余额合计；点击显示 **刷新中…**，失败时保留最近读数。

## 保存、迁移与更新

设置自动保存。请在 **设置 → 保存与迁移** 导出：

- **配置与素材包**：GIF、图片、全部音频、配对字幕、字体和设置。
- **Windows 便携完整包**：上述内容加运行程序，可在新电脑解压使用。

原独立版导出的 ZIP 可以直接导入。换电脑后安装并登录 Harness、启用本插件，再导入自己的配置包。账号登录和聊天记录不会进入桌宠导出包。

插件下载的完整桌宠与个人素材保存在 Harness 数据目录的 `shorekeeper-market/app` 中，位于插件安装目录之外。**升级或卸载插件不会删除这份配置**。更新完整程序时会保留个人设置、GIF、音频、字体和导出文件，并留下上一份程序目录供恢复。

插件和完整程序分别显示版本。安装新版插件后，入口会提示匹配的完整程序更新；点击更新即可。桌宠内的更新检查也指向本项目。不会覆盖原独立版安装目录。

自动下载先尝试 GitHub，失败后尝试 [GH-Proxy](https://gh-proxy.org/)；也可手动固定来源。下载完成后校验固定 SHA-256，不一致时不会安装。

![完整保存与迁移功能](docs/images/save-and-migrate.png)

## 素材来源与感谢

表情包来自 [鸣潮表情包站](https://emoji.wuwa.games/)。表情包众筹 QQ 群：**1079834905**。

感谢所有为该项目表情包众筹投资的守岸人厨子们。

程序代码采用 [MIT](LICENSE)；角色、表情包、语音与字体遵循各自的许可，详见 [素材说明](CREDITS.txt) 和 [第三方说明](desktop/THIRD_PARTY.txt)。

## 开发与验证

```powershell
npm test
python -m pip install -r desktop/tools/requirements-build.txt
cd desktop
python -m unittest discover -s tests
cd ..
python desktop/tools/build_portable.py
python tools/package-runtime.py
npm pack
```

`desktop/` 是完整版源代码和默认素材；`lib/` 是 Harness 连接与启动入口。上游版本记录在 [UPSTREAM.json](desktop/UPSTREAM.json)。构建出的程序和 ZIP 不提交到 Git，发布为 Release 附件。
