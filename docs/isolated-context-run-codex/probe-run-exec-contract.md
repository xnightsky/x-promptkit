# probe / run-exec 契约

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [research.md](research.md)
  - [clean-room-design.md](clean-room-design.md)
  - [exec-v0-contract.md](exec-v0-contract.md)
  - [structured-init-design.md](structured-init-design.md)
  - [failure-taxonomy.md](failure-taxonomy.md)
  - [../../TODO.md](../../TODO.md)

## 1. 文档目的

本文只回答方案 A 下 `probe.mjs` 与 `run-exec.mjs` 应该如何对外暴露。

本文负责：

- 为什么选择方案 A
- 两个脚本各自的职责边界
- 请求 JSON、stdout JSON、脚本退出码规则
- 与 clean-room、`codex-exec-v0-contract` 的接缝

本文不负责：

- clean-room 目录布局
- `minimal-seed` 与结构化 `init`
- 完整 trace 树设计
- 认证策略本身

认证策略约束：

- Codex 自身如何解析、存储和使用认证态，视为宿主能力
- 本仓库 runner 不额外设计一套 auth 策略
- 脚本只负责透传已准备好的环境并记录可观测失败

失败归因约束：

- `kind` 走主分类
- `reason` 必须使用稳定的 `snake_case` 代码
- 具体代码表由 [failure-taxonomy.md](failure-taxonomy.md) 约束

## 2. 方案选择

第一阶段固定采用方案 A：

- `probe.mjs`
- `run-exec.mjs`

不采用：

- 单文件多子命令
- 主要靠环境变量驱动的隐式接口

原因：

- 与仓库现有脚本风格更一致
- 窄职责更容易测试
- 后续更容易被 `recall-eval` 或其他 harness 独立调用

## 3. 统一规则

### 3.1 输入方式

两个脚本统一支持：

- `--input <path>`
- 如果未传 `--input`，则从 stdin 读取 JSON

不支持：

- 仅靠环境变量拼装业务请求
- 位置参数式的半结构化输入

### 3.2 输出方式

两个脚本统一：

- 向 stdout 输出一份 JSON
- 不输出 markdown
- 不依赖 stderr 传业务结果

### 3.3 脚本退出码

脚本退出码只表达“脚本自身是否成功处理了请求”，不表达业务成功。

建议规则：

- `0`
  - 请求被正常处理
  - 即使业务结果是 `available=false` 或 `ok=false`，脚本也应退出 `0`
- `1`
  - 输入 JSON 不合法
  - 缺少 required 字段
  - 脚本内部异常

换句话说：

- `codex` 子进程是否成功，写进 JSON
- `probe` 是否可用，写进 JSON
- 脚本退出码只用于调用方识别“这个脚本自己坏没坏”

## 4. `probe.mjs`

### 4.1 职责

`probe.mjs` 只负责：

- 检查 `codex` 命令是否存在
- 检查 `exec` 与 `--json` 能力是否可用
- 收集最低限度的宿主事实
- 以结构化 JSON 返回探测结果

`probe.mjs` 不负责：

- 创建 clean-room
- 写执行 artifacts
- 启动真实任务
- 产出 `codex-exec-v0-contract`

### 4.2 请求 JSON

建议最小请求：

```json
{
  "backend": "exec-json",
  "codex_command": "codex"
}
```

字段约定：

- `backend`
  - required
  - `v0` 仅允许 `exec-json`

- `codex_command`
  - optional
  - 默认为 `codex`
  - 必须是非空字符串

校验顺序：

1. 输入 JSON 可解析
2. `backend` 存在且受支持
3. `codex_command` 若存在，则必须为非空字符串
4. 其余未知字段先忽略，不报错

### 4.3 stdout JSON

建议最小输出：

```json
{
  "ok": true,
  "backend": "exec-json",
  "available": true,
  "facts": {
    "codex_command": "codex",
    "codex_version": "x.y.z",
    "exec_supported": true,
    "json_supported": true
  },
  "failure": null
}
```

不可用时：

```json
{
  "ok": true,
  "backend": "exec-json",
  "available": false,
  "facts": {
    "codex_command": "codex",
    "codex_version": null,
    "exec_supported": false,
    "json_supported": false
  },
  "failure": {
    "kind": "unavailable",
    "reason": "codex_command_missing"
  }
}
```

字段约定：

- `ok`
  - required
  - 表示脚本成功处理了探测请求

- `available`
  - required
  - 表示当前 backend 是否可用

- `facts`
  - required
  - 只放宿主事实，不放业务推断

- `failure`
  - `available=true` 时为 `null`
  - `available=false` 时必须存在

## 5. `run-exec.mjs`

### 5.1 职责

`run-exec.mjs` 只负责：

- 读取结构化请求
- 在调用方准备好的工作目录与环境中执行一次 `codex exec --json`
- 落 `artifacts/`
- 输出符合 [exec-v0-contract.md](exec-v0-contract.md) 的业务返回体

`run-exec.mjs` 不负责：

- 解释 `minimal-seed`
- 决定 auth 策略
- 做完整 trace 树归一化

### 5.2 请求 JSON

建议最小请求：

```json
{
  "backend": "exec-json",
  "codex_command": "codex",
  "task": {
    "prompt": "..."
  },
  "working_directory": "workspace",
  "artifacts_dir": "artifacts",
  "env": {
    "HOME": "...",
    "CODEX_HOME": "...",
    "PWD": "...",
    "TMPDIR": "...",
    "XDG_CONFIG_HOME": "...",
    "XDG_CACHE_HOME": "...",
    "XDG_STATE_HOME": "..."
  },
  "extra_args": []
}
```

字段约定：

- `backend`
  - required
  - `v0` 固定为 `exec-json`

- `codex_command`
  - optional
  - 默认为 `codex`
  - 必须是非空字符串

- `task.prompt`
  - required
  - 单次执行的 prompt
  - 必须是非空字符串

- `working_directory`
  - required
  - `codex exec` 实际运行目录
  - 必须是非空字符串

- `artifacts_dir`
  - required
  - 本次执行应写入的 artifact 目录
  - 必须是非空字符串

- `env`
  - required
  - 调用方已经准备好的环境变量映射
  - 表示最终环境映射，不是 patch
  - `run-exec.mjs` 只消费，不负责推导或补默认值
  - 至少必须包含：
    - `HOME`
    - `CODEX_HOME`
    - `PWD`
    - `TMPDIR`
    - `XDG_CONFIG_HOME`
    - `XDG_CACHE_HOME`
    - `XDG_STATE_HOME`

- `extra_args`
  - optional
  - 附加给 `codex exec` 的受控参数数组
  - 必须是数组，不允许整段 shell 字符串
  - 元素必须全部为字符串
  - 不允许覆盖核心行为参数，例如 `--json` 或 prompt 本体

### 5.3 请求校验顺序

`run-exec.mjs` 的请求校验顺序固定为：

1. 输入 JSON 可解析
2. 顶层 required 字段存在
3. 类型校验
4. `backend` 值校验
5. `env` 必需键校验
6. `extra_args` 安全校验
7. `working_directory` / `artifacts_dir` 的存在性与可写性检查
8. 全部通过后才真正执行 `codex exec`

### 5.4 请求非法时的处理

以下情况不进入业务 `failure`，而是脚本直接退出 `1`：

- 缺少 required 字段
- 字段类型错误
- `env` 缺少最小必需键
- `extra_args` 不是字符串数组
- `extra_args` 试图覆盖核心行为参数
- `working_directory` 或 `artifacts_dir` 不满足脚本前置要求

### 5.5 stdout JSON

`run-exec.mjs` 的 stdout 必须直接符合 [exec-v0-contract.md](exec-v0-contract.md)。

也就是说：

- 成功时输出 `ok=true` 的业务返回 JSON
- 业务失败时输出 `ok=false` 的业务返回 JSON
- 只有脚本自身请求不合法或内部异常时，才不保证输出该契约并退出非零

## 6. 与 artifacts 的关系

### 6.1 `probe.mjs`

`probe.mjs` 默认不要求写 artifact。

如果调用方需要持久化 probe 结果，由调用方自己把 stdout JSON 落盘。

### 6.2 `run-exec.mjs`

`run-exec.mjs` 必须负责写入：

- `artifacts/raw-events.jsonl`
- `artifacts/stdout.txt`
- `artifacts/stderr.txt`
- `artifacts/evidence.json`
- `artifacts/result.json`

其中：

- `result.json` 与 stdout JSON 应保持一致
- `evidence.json` 对应返回体中的 `evidence`

## 7. 与其他文档的接缝

- clean-room 负责准备 `working_directory`、`artifacts_dir` 与 `env`
- 结构化 init 负责构造 `workspace/`
- `run-exec.mjs` 只消费这些前置结果
- 最终业务返回体由 `exec-v0-contract.md` 约束

## 8. failure 与退出码的边界

建议固定一条硬规则：

- 业务失败进入 stdout JSON 的 `failure`
- 脚本异常进入进程退出码

示例：

- `codex` 不存在
  - `probe.mjs`：stdout JSON `available=false`，退出 `0`
- `codex exec` 认证失败
  - `run-exec.mjs`：stdout JSON `ok=false`，`failure.kind=environment_failure`，退出 `0`
- `--input` 指向不存在文件
  - 脚本退出 `1`
- stdin JSON 解析失败
  - 脚本退出 `1`
- `extra_args` 命中禁止参数
  - 脚本退出 `1`

## 9. v0 明确不做的事

为控制范围，本文明确不要求：

- `probe.mjs` 写复杂宿主画像
- `run-exec.mjs` 接收多轮任务
- 脚本层自己管理认证生命周期
- 用脚本退出码表达业务失败
