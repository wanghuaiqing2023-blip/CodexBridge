# CodexBridge 用户使用手册

本文面向日常使用者，说明如何安装、启动、连接微信、配合 Codex App 使用，以及出现问题时如何排查。

## 1. CodexBridge 是什么

CodexBridge 的核心作用是：

- 让微信消息进入本机 Codex 运行环境。
- 让 Codex 的进度、最终回答、审批请求、文件输出等结果回到微信。
- 在微信里提供一组适合聊天环境的 slash commands，例如 `/status`、`/new`、`/threads`、`/open`、`/back`、`/permissions`、`/allow`、`/stop`。

当前主路径是：

```text
微信
  -> CodexBridge weixin:serve
  -> Codex CLI / Codex app-server
  -> OpenAI / Codex backend
  -> CodexBridge
  -> 微信
```

CodexBridge 不是替代 Codex App。更准确地说，它是一个桥接层：微信负责输入和接收回复，Codex App / Codex CLI 负责真正运行 agent。

## 2. 重要概念

### Codex App

Codex App 是桌面端 Codex。它保存登录状态、Codex 配置、线程记录，并提供本地图形界面。

CodexBridge 依赖本机 Codex 能正常工作。最常见的前提是：

- Codex App 已安装。
- Codex App 已登录。
- 本机存在 Codex auth 文件，例如 Windows 下通常是：

```text
C:\Users\<你的用户名>\.codex\auth.json
```

### Codex CLI / app-server

CodexBridge 运行任务时，会启动或连接 Codex 的本地能力。实际使用时需要确保 `codex` 可执行文件能被启动。

在 Windows 上，如果系统里有多个 `codex.exe`，建议显式设置：

```powershell
$env:CODEX_REAL_BIN = 'C:\Users\<你的用户名>\AppData\Local\OpenAI\Codex\bin\<版本>\codex.exe'
```

如果不确定路径，可先尝试：

```powershell
where codex
Get-Command codex
```

### Weixin scope

Weixin scope 可以理解为“当前微信聊天入口”。目前典型使用方式是你本人和 bot 的一个私聊窗口。

CodexBridge 会把这个 scope 绑定到一个当前 foreground thread。你在微信里发送普通消息，默认都发给当前 foreground thread。

### Foreground thread 和 background thread

- foreground thread：当前微信聊天正在操作的主 thread。
- background thread：之前还在运行、但已被 `/new`、`/open`、`/back` 等切换到后台的 thread。

普通消息总是发给 foreground thread。后台 thread 完成、失败或中断时，CodexBridge 会发后台通知。

### State directory

CodexBridge 自己的运行状态默认放在：

```text
~/.codexbridge
```

Windows 通常是：

```text
C:\Users\<你的用户名>\.codexbridge
```

常见子目录：

```text
~/.codexbridge\weixin\accounts\       # 微信账号状态
~/.codexbridge\runtime\               # bridge session、settings、lock 等运行状态
~/.codexbridge\logs\                  # 服务日志
~/.codexbridge\weixin\login\          # 登录二维码图片
```

## 3. 安装前提

### Node.js

项目要求 Node.js 24 或更高版本。

检查：

```powershell
node --version
npm --version
```

### 安装依赖

在仓库根目录执行：

```powershell
cd C:\Users\27605\CodexBridge
npm install
```

### Codex App 登录

先确保 Codex App 本身能正常使用。建议打开 Codex App，确认：

- 已登录。
- 能正常创建或打开 thread。
- 能向模型发送消息并收到回复。

也可以检查 auth 文件：

```powershell
Test-Path C:\Users\27605\.codex\auth.json
```

### Codex CLI 可执行性

检查：

```powershell
codex --version
where codex
```

如果 `codex --version` 报 `Access is denied`，不要使用 WindowsApps 里的受限路径，改用 Codex App 释放到用户目录下的真实可执行文件，并设置：

```powershell
$env:CODEX_REAL_BIN = 'C:\Users\27605\AppData\Local\OpenAI\Codex\bin\<版本>\codex.exe'
```

## 4. 首次登录微信

在仓库根目录执行：

```powershell
npm run weixin:login
```

命令会输出：

- 二维码文本
- 二维码图片路径
- 登录状态

二维码图片通常保存到：

```text
C:\Users\27605\.codexbridge\weixin\login\
```

扫码确认后，账号状态会保存到：

```text
C:\Users\27605\.codexbridge\weixin\accounts\
```

注意：`weixin:login` 只负责登录和保存账号状态，不会启动长期服务。要让微信消息被处理，必须启动 `weixin:serve`。

## 5. 启动微信服务

最常用启动命令：

```powershell
cd C:\Users\27605\CodexBridge
npm run weixin:serve -- --cwd C:\Users\27605\CodexBridge
```

`--cwd` 表示新 thread 默认工作目录。你可以设置成任何你希望 Codex 默认工作的项目目录，例如：

```powershell
npm run weixin:serve -- --cwd D:\Projects\MyApp
```

启动后应该看到类似输出：

```text
启动 WeChat bridge
state_dir: C:\Users\27605\.codexbridge
default_provider_profile: openai-default
serve_lock: C:\Users\27605\.codexbridge\runtime\weixin-serve.lock
default_cwd: C:\Users\27605\CodexBridge
native_api_enabled: true
native_api_base_url: http://127.0.0.1:43182
```

此时到微信发送：

```text
/status
```

如果能收到回复，说明主链路已经通。

## 6. 推荐启动方式：PowerShell 示例

Windows 下建议显式指定环境变量：

```powershell
cd C:\Users\27605\CodexBridge

$env:CODEXBRIDGE_DEBUG_WEIXIN = '1'
$env:CODEX_REAL_BIN = 'C:\Users\27605\AppData\Local\OpenAI\Codex\bin\<版本>\codex.exe'

npm run weixin:serve -- --cwd C:\Users\27605\CodexBridge
```

## 7. 防止重复启动

同一个微信账号不要同时运行多个 `weixin:serve`。

CodexBridge 会使用 lock 文件：

```text
C:\Users\27605\.codexbridge\runtime\weixin-serve.lock
```

查看当前 lock：

```powershell
Get-Content C:\Users\27605\.codexbridge\runtime\weixin-serve.lock
```

如果服务异常退出但 lock 残留，重新启动时会检查 lock 里的 PID。如果 PID 已不存在，CodexBridge 会自动清理旧 lock。

## 8. 和 Codex App 如何配合使用

### 推荐理解

Codex App 和 CodexBridge 共享本机 Codex 运行环境，但它们不是同一个 UI 状态。

微信端启动的 thread 会在 Codex 的本地 session/thread 存储中留下记录；Codex App 可能能看到这些 thread，但 Codex App 的界面状态不一定实时跟随微信端正在运行的 foreground/background 状态。

因此：

- 微信端当前操作哪个 thread，以 `/status` 为准。
- Codex App 图形界面当前打开哪个 thread，以 Codex App 自己显示为准。
- 两边可以看到同一批底层 thread，但前台绑定、后台运行状态是 CodexBridge 自己管理的。

### 日常协作方式

推荐流程：

1. 在 Codex App 中保持登录状态正常。
2. 用 CodexBridge `weixin:serve` 启动微信服务。
3. 在微信里用 `/status` 确认当前绑定。
4. 需要新任务时用 `/new`。
5. 需要回到旧任务时用 `/threads` 和 `/open <序号>`。
6. 需要在最近两个前台 thread 之间切换时用 `/back`。

### `/threads` 和 Codex App thread 列表

`/threads` 显示 provider-global thread 列表，也就是 Codex app-server 能列出的 thread，而不只是当前微信 scope 创建的 thread。

这意味着：

- 你在 Codex App 中创建的 thread，可能会出现在微信 `/threads` 中。
- 你在微信中创建的 thread，也可能出现在 Codex App 中。
- `/open <序号>` 可以把当前微信 scope 绑定到列表中的某个 thread。

## 9. 微信端常用命令

### 查看帮助

```text
/helps
/helps threads
/helps permissions
```

### 查看当前状态

```text
/status
/st
```

重点看：

- 当前 bridge session
- 当前 Codex thread
- cwd
- provider profile
- foreground/background 运行状态
- permissions / approval reviewer

### 创建新 thread

```text
/new
```

指定工作目录：

```text
/new C:\Users\27605\CodexBridge
```

如果当前 foreground 正在运行，`/new` 会把旧 foreground 转入 background，并创建新的 foreground thread。

### 查看和打开 thread

```text
/threads
/th
/open 2
/o 2
/peek 2
/rename 2 微信桥接排障
```

推荐用 `/threads` 列表里的序号，不推荐手动复制很长的 thread id。

### 最近两个 foreground 间切换

```text
/back
```

`/back` 只在最近两个 foreground thread 之间来回切换，不维护完整历史栈。

示例：

```text
当前 A
/new -> 当前 B，A 成为上一个 foreground
/back -> 当前 A
/back -> 当前 B
```

### 停止任务

停止当前 foreground：

```text
/stop
```

停止后台任务：

```text
/status
/threads stop <target>
```

其中 `<target>` 使用 `/status` 或相关命令显示的后台任务目标标识。

### 审批

查看权限模式：

```text
/permissions
/perm
```

切换常用权限模式：

```text
/permissions default
/permissions read-only
/permissions auto
/permissions full-access
```

手动审批：

```text
/allow 1
/deny 1
```

后台审批：

```text
/threads allow <target>
```

说明：

- `auto` 表示使用 Codex app-server 的 automatic approval reviewer。
- `auto` 不等于 `full-access`。
- `auto` 仍可能拒绝、超时或中断。
- `full-access` 风险更高，应谨慎使用。

### Plan mode

```text
/plan
/plan on
/plan off
```

开启后，下一轮应进入 Codex 原生 planning/collaboration mode。微信端是否真正拦截写文件，取决于 Bridge 是否正确把模式传给 Codex app-server，以及 Codex core 是否按该模式约束 mutating tools。

### 模型和 provider

```text
/models
/model
/model 1
/model default
/provider
```

### 重试和重连

```text
/retry
/reconnect
/restart
```

- `/retry`：重试上一轮失败或中断的任务。
- `/reconnect`：当 Codex app-server 或登录状态异常时尝试重连。
- `/restart`：请求 bridge 侧重启，具体效果取决于服务管理方式。

## 10. 后台任务使用建议

推荐用法：

1. 发起一个长任务。
2. 任务运行中发送 `/new` 创建新 foreground。
3. 旧任务进入 background。
4. 用 `/status` 查看后台运行项。
5. 后台完成后，微信会收到简短通知。
6. 需要查看或继续时，用 `/threads` 和 `/open`。

注意：

- 后台普通 progress 默认不持续刷屏。
- 后台完成、失败、中断会通知。
- 进程重启后，内存里的后台运行状态不会恢复；这是当前设计边界。

## 11. 长期运行：Windows 计划任务

如果不想一直开着 PowerShell，可以安装 Windows Scheduled Task：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\service\install-windows-task.ps1
```

查看状态：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\service\status-windows-task.ps1
```

重启服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\service\restart-windows-task.ps1
```

查看日志：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\service\logs-windows-task.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\service\logs-windows-task.ps1 -Follow
```

环境文件位置：

```text
%APPDATA%\codexbridge\weixin.service.env
```

日志目录：

```text
%USERPROFILE%\.codexbridge\logs\
```

## 12. 长期运行：Linux systemd user service

安装：

```bash
bash ./scripts/service/install-systemd-user.sh
```

查看状态：

```bash
bash ./scripts/service/status-systemd-user.sh
```

重启：

```bash
bash ./scripts/service/restart-systemd-user.sh
```

看日志：

```bash
bash ./scripts/service/logs-systemd-user.sh
bash ./scripts/service/logs-systemd-user.sh --follow
```

环境文件：

```text
~/.config/codexbridge/weixin.service.env
```

## 13. 长期运行：macOS launchd

安装：

```bash
bash ./scripts/service/install-launchd-user.sh
```

查看状态：

```bash
bash ./scripts/service/status-launchd-user.sh
```

重启：

```bash
bash ./scripts/service/restart-launchd-user.sh
```

看日志：

```bash
bash ./scripts/service/logs-launchd-user.sh
bash ./scripts/service/logs-launchd-user.sh --follow
```

## 14. 日志和排障

### 微信完全无回复

检查服务是否还在：

```powershell
Get-Content C:\Users\27605\.codexbridge\runtime\weixin-serve.lock
Get-Process -Name node,powershell,codex -ErrorAction SilentlyContinue
```

看日志：

```powershell
Get-Content C:\Users\27605\.codexbridge\logs\weixin-serve-current.out.log -Tail 80
Get-Content C:\Users\27605\.codexbridge\logs\weixin-serve-current.err.log -Tail 120
```

如果日志里持续出现：

```text
getupdates status 200
```

说明微信轮询链路还活着。

### `weixin:serve` 无法启动

常见原因：

- 已有另一个 `weixin:serve` 在跑。
- lock 文件指向的 PID 仍存在。
- Codex CLI 路径不可执行。
- `~/.codex/auth.json` 不存在或失效。

检查 lock：

```powershell
Get-Content C:\Users\27605\.codexbridge\runtime\weixin-serve.lock
```

检查 Codex：

```powershell
codex --version
where codex
```

### Codex App 正常，但微信任务无法访问 LLM

先看错误是否指向：

```text
https://chatgpt.com/backend-api/codex/responses
```

如果是，通常是 Codex 后端网络问题。检查：

```powershell
Resolve-DnsName chatgpt.com
Test-NetConnection chatgpt.com -Port 443
```

如果使用 VPN 或代理，确认当前 shell 里的代理变量是否符合预期：

```powershell
foreach ($name in 'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy') {
  $v = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ($null -ne $v) { Write-Output "$name=$v" }
}
```

如果看到：

```text
HTTP_PROXY=http://127.0.0.1:9
HTTPS_PROXY=http://127.0.0.1:9
ALL_PROXY=http://127.0.0.1:9
```

这通常是沙箱用的黑洞代理，不是可用代理。如果长期服务是从 Codex sandbox 或异常 shell 中启动的，应避免把这类变量继承给 `weixin:serve`：

```powershell
$env:HTTP_PROXY = $null
$env:HTTPS_PROXY = $null
$env:ALL_PROXY = $null
$env:http_proxy = $null
$env:https_proxy = $null
$env:all_proxy = $null
```

### GitHub push 失败

先检查：

```powershell
Resolve-DnsName github.com
Test-NetConnection github.com -Port 443
git ls-remote https://github.com/<owner>/<repo>.git HEAD
```

如果 `Test-NetConnection` 失败，说明当前网络无法连通 GitHub 443。

如果 Git 明确显示：

```text
via 127.0.0.1
```

说明 Git 正在走代理。确认代理端口是否真实可用。

### 微信重复消息

已知并已修复的主要路径是 preview/final 重叠导致的重复发送。若再次出现，应保留：

- 微信截图
- 大概时间点
- 对应日志尾部

重点查：

```text
final_delivery_begin
final_delivery_attempt
final_delivery_decision
send_text
messageId
```

### 自动审批超时

`/permissions auto` 使用 Codex 原生 auto-review。对于小操作通常能快速通过；对于超大上下文、大文档提交、完整文件 payload，可能 90 秒内没有返回。

这类情况建议：

- 临时切回 `/permissions default`。
- 拆小任务。
- 对 Git commit / push 这类明确授权动作，使用手动审批。

## 15. 推荐 smoke test

服务启动后，按顺序在微信发送：

```text
/status
/helps
/permissions
/new
请用一句话说明当前工作目录是什么
/threads
/back
```

如果要测试后台：

```text
/new
请持续工作 3 分钟，分阶段分析 CodexBridge 的前后台 thread 设计，并最后总结
/new
/status
```

预期：

- 旧任务被转入后台。
- 新 thread 成为 foreground。
- `/status` 能看到当前 foreground 和后台任务信息。
- 后台完成时有通知。

## 16. 常用文件位置速查

```text
仓库目录:
C:\Users\27605\CodexBridge

CodexBridge state:
C:\Users\27605\.codexbridge

微信账号:
C:\Users\27605\.codexbridge\weixin\accounts

服务 lock:
C:\Users\27605\.codexbridge\runtime\weixin-serve.lock

服务日志:
C:\Users\27605\.codexbridge\logs

Codex auth:
C:\Users\27605\.codex\auth.json

Codex sessions:
C:\Users\27605\.codex\sessions
```

## 17. 日常使用建议

- 每次服务启动后先发 `/status`。
- 大任务开始前确认 cwd 是否正确。
- 不确定当前在哪个 thread 时，用 `/status`。
- 想找旧任务时，用 `/threads`，再 `/open <序号>`。
- 想快速在最近两个任务之间切换，用 `/back`。
- 运行中要切新任务，用 `/new`，不要直接覆盖当前任务。
- 有审批时优先用 `/allow 1` 或 `/deny 1`。
- 后台任务失控时，用 `/status` 找 target，再 `/threads stop <target>`。
- 不要同时启动多个 `weixin:serve` 处理同一个微信账号。
