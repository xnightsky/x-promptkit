# Codex 子代理接入 MiniMax M2.7 参考手册

> 这份文档用于 skill 内部参考，基于早期工作区手册整理，并已更新到当前 `installer + loader + vendored codex-bridge` 实现。

## 背景与结论

- Codex 子代理可以接入第三方模型。
- 当前这套接入的关键不是让 Codex 直连 MiniMax，而是让 Codex 面向 `Responses API`，再由本地 `codex-bridge` 转到 MiniMax 的 Anthropic 兼容接口。
- 当前 skill 实现已经把 `codex-bridge` 代码 vendoring 到 installer skill 内，安装时不再执行 `git clone`。

推荐链路：

```text
Codex
  └─ provider: minimax_bridge
       └─ http://127.0.0.1:54187
            └─ codex-bridge
                 └─ https://api.minimaxi.com/anthropic
                      └─ MiniMax-M2.7
```

职责分工：

- 主代理：保持现有默认配置不变。
- 子代理：单独切到 `minimax_bridge` provider，并指定 `model = "MiniMax-M2.7"`。
- installer skill：把 vendored `codex-bridge` 同步到 `~/codex-bridge`，写入配置和 `.env`。
- loader skill：在真正调用 `minimax_worker` 前启动并校验本地 bridge。

## 当前实现与目录

相关 skill 目录：

- installer: `skills/codex-bridge-minimax-worker-installer`
- loader: `skills/codex-bridge-minimax-worker-loader`

vendored bridge 源码位于：

```text
skills/codex-bridge-minimax-worker-installer/vendor/codex-bridge
```

运行时 bridge 目录仍然是：

```text
~/codex-bridge
```

这意味着：

- 运行目录不变，所以 loader 和清理逻辑不需要换路径。
- 安装来源已经改成 skill 内 vendored source，不依赖网络 clone。
- 上游来源和版权信息保留在 vendored 目录中的 `README.md`、`README_zh.md` 和 `UPSTREAM.md`。

## 安装流程

通过 installer skill 安装或更新时，需要提供：

- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`，默认 `MiniMax-M2.7`
- `ANTHROPIC_BASE_URL`，默认 `https://api.minimaxi.com/anthropic`

脚本入口：

```bash
ANTHROPIC_AUTH_TOKEN='...' \
ANTHROPIC_MODEL='MiniMax-M2.7' \
ANTHROPIC_BASE_URL='https://api.minimaxi.com/anthropic' \
./scripts/install-or-update.sh
```

安装器会做这些事：

1. 停掉旧的本地 bridge 进程（如果有）
2. 将 vendored `codex-bridge` 同步到 `~/codex-bridge`
3. installer 直接把 `~/codex-bridge` 物化为 Node 项目并执行 `npm install`
4. 写入或更新 `~/codex-bridge/.env`
5. 在 `~/.codex/config.toml` 里维护 `minimax_bridge` provider 和 `minimax_worker` agent block
6. 写入 `~/.codex/agents/minimax-worker.toml`

## 运行流程

真正使用 `minimax_worker` 前，先走 loader skill。

脚本入口：

```bash
./scripts/minimax-provider-start.sh
```

loader 会检查：

- `~/codex-bridge` 是否存在
- `~/codex-bridge/.env` 是否存在且包含必需变量
- `~/codex-bridge/package.json` 是否存在
- 本地 `http://127.0.0.1:54187/openapi.json` 是否健康

如果还没启动，它会在后台拉起：

```bash
node main.mjs --host 127.0.0.1 --port 54187
```

如果本次会话启动了 bridge，它会提醒用户该进程会持续运行，直到手动停止：

```bash
kill "$(cat ~/codex-bridge/bridge.pid)" && rm -f ~/codex-bridge/bridge.pid
```

## Codex 配置落点

installer 会在 `~/.codex/config.toml` 中维护：

```toml
[model_providers.minimax_bridge]
name = "MiniMax via codex-bridge"
base_url = "http://127.0.0.1:54187"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 4
stream_max_retries = 10
stream_idle_timeout_ms = 300000

[agents.minimax_worker]
description = "Coding worker backed by MiniMax M2.7 via codex-bridge"
config_file = "./agents/minimax-worker.toml"
```

并写入 `~/.codex/agents/minimax-worker.toml`：

```toml
name = "minimax_worker"
description = "Coding worker backed by MiniMax M2.7 via codex-bridge"
developer_instructions = """
You are a focused implementation subagent.
Prefer concrete code changes, concise reasoning, and explicit failure reporting.
Keep unrelated files untouched.
"""
model_provider = "minimax_bridge"
model = "MiniMax-M2.7"
model_reasoning_effort = "medium"
```

注意点：

- 不要改用户已有的顶层默认 `model_provider` 和 `model`。
- 子代理配置文件要使用 `developer_instructions`，不要退回旧字段。

## 验证顺序

推荐按这个顺序验证：

### 1. 验证安装完成

确认这些文件存在：

- `~/codex-bridge/main.mjs`
- `~/codex-bridge/.env`
- `~/.codex/agents/minimax-worker.toml`

### 2. 验证 bridge 已启动

```bash
./scripts/minimax-provider-start.sh
curl --noproxy '*' -fsS http://127.0.0.1:54187/openapi.json >/dev/null && echo "bridge up"
```

### 3. 验证 Codex 默认主代理未被改动

确认 `~/.codex/config.toml` 顶层原默认配置仍然保留。

### 4. 验证 `minimax_worker` 被识别

在 Codex 中发一个明确要求子代理执行的任务，确认角色可调起。

### 5. 验证文本任务和工具调用

先跑纯文本任务，再跑需要搜索文件或执行命令的任务，确认整条链路是通的：

```text
Codex -> responses -> codex-bridge -> Anthropic messages -> MiniMax -> tool_use/tool_result -> Codex
```

## 常见问题

### 1. installer 成功，但 loader 启动失败

优先检查：

- `~/codex-bridge/.env` 是否缺少必需变量
- `~/codex-bridge/package.json` 是否存在
- `~/codex-bridge/main.mjs` 是否存在

### 2. bridge 健康检查失败

优先检查：

- 端口是否是 `127.0.0.1:54187`
- 旧 bridge 进程是否残留
- installer 自带的 `mjs` 运行时同步是否已完成

### 3. 子代理文件存在，但角色没有出现

优先检查：

- `~/.codex/agents/minimax-worker.toml` 是否存在
- `config_file = "./agents/minimax-worker.toml"` 是否正确
- 是否使用了 `developer_instructions`

### 4. API Key 正确，但上游仍报错

优先检查：

- `.env` 中的 `ANTHROPIC_BASE_URL`
- `.env` 中的 `ANTHROPIC_MODEL`
- 子代理文件中的 `model`

## 与原始手册的差异

相较于工作区原始文档，这份参考手册已更新为当前实现：

- 删除了运行时 `git clone` 步骤
- 端口从 `8000` 更新为 `54187`
- 安装职责归 installer skill
- 启动职责归 loader skill
- 明确了 vendored source 和运行目录的关系
