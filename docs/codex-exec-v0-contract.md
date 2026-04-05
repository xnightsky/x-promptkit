# codex exec v0 返回契约

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [isolated-context-run-codex-research.md](isolated-context-run-codex-research.md)
  - [clean-room-design.md](clean-room-design.md)
  - [structured-init-design.md](structured-init-design.md)
  - [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - [failure-taxonomy-design.md](failure-taxonomy-design.md)
  - [../TODO.md](../TODO.md)

## 1. 文档目的

本文只回答 `isolated-context-run:codex` 在第一阶段应该返回什么。

本文负责：

- `codex exec` 第一阶段最小返回 JSON
- `result`、`execution`、`evidence`、`failure` 的字段边界
- 哪些字段是 required，哪些字段缺失时只记 warning
- 轻量证据摘要如何替代重型 trace 映射
- `run-exec.mjs` 应产出的业务返回体骨架

本文不负责：

- clean-room 目录布局
- `minimal-seed` 与结构化 `init`
- 完整 trace item 树设计
- `sdk` / `app-server` backend 契约

## 2. 设计目标

`v0` 返回契约的目标是：

- 以最终返回值为主
- 保留最少的宿主级证据
- 支撑 failure taxonomy
- 支撑后续 `recall-eval` 接入
- 不让上层直接依赖 Codex 原始事件 schema

因此，`v0` 明确不做：

- 完整 `thread / turn / item` 深度映射
- 复杂事件模型归一化
- 大而全的 trace envelope

## 3. 顶层结构

`v0` 固定返回一个 JSON 对象，顶层字段为：

- `ok`
- `carrier`
- `backend`
- `result`
- `execution`
- `evidence`
- `failure`

其中：

- `result` 负责最终回答
- `execution` 负责执行状态
- `evidence` 负责最小证据摘要
- `failure` 负责统一失败归因

## 4. 最小返回体

成功时建议返回：

```json
{
  "ok": true,
  "carrier": "isolated-context-run:codex",
  "backend": "exec-json",
  "result": {
    "final_text": "...",
    "refusal": false
  },
  "execution": {
    "thread_id": "...",
    "turn_status": "completed",
    "exit_code": 0
  },
  "evidence": {
    "events_seen": [
      "thread.started",
      "turn.started",
      "turn.completed"
    ],
    "raw_event_log": "artifacts/raw-events.jsonl",
    "stdout": "artifacts/stdout.txt",
    "stderr": "artifacts/stderr.txt",
    "warnings": []
  },
  "failure": null
}
```

失败时建议返回：

```json
{
  "ok": false,
  "carrier": "isolated-context-run:codex",
  "backend": "exec-json",
  "result": {
    "final_text": null,
    "refusal": false
  },
  "execution": {
    "thread_id": null,
    "turn_status": "failed",
    "exit_code": 1
  },
  "evidence": {
    "events_seen": [],
    "raw_event_log": "artifacts/raw-events.jsonl",
    "stdout": "artifacts/stdout.txt",
    "stderr": "artifacts/stderr.txt",
    "warnings": []
  },
  "failure": {
    "kind": "environment_failure",
    "reason": "auth_failed"
  }
}
```

## 5. 字段约定

### 5.1 顶层字段

- `ok`
  - required
  - 布尔值
  - 表示本次执行是否满足成功返回条件

- `carrier`
  - required
  - 固定为 `isolated-context-run:codex`

- `backend`
  - required
  - `v0` 固定为 `exec-json`

### 5.2 `result`

- `final_text`
  - required
  - 成功时为字符串
  - 失败时允许为 `null`

- `refusal`
  - required
  - 布尔值
  - 仅当宿主给出明确 refusal 信号时设为 `true`
  - 不做自然语言猜测

### 5.3 `execution`

- `thread_id`
  - optional
  - 缺失时不直接失败，进入 `evidence.warnings`

- `turn_status`
  - required
  - 枚举：
    - `completed`
    - `failed`
    - `interrupted`
    - `unknown`

- `exit_code`
  - required
  - 子进程退出码

### 5.4 `evidence`

- `events_seen`
  - required
  - 只保留事件类型名数组
  - `v0` 不要求展开 item 级细节

- `raw_event_log`
  - required
  - 指向原始 JSONL 事件日志

- `stdout`
  - required
  - 指向 stdout artifact

- `stderr`
  - required
  - 指向 stderr artifact

- `warnings`
  - required
  - 字符串数组
  - 用于承接“执行成功，但证据不完整”的情况

### 5.5 `failure`

- 成功时必须为 `null`
- 失败时必须存在
- 至少包含：
  - `kind`
  - `reason`
- `reason` 必须使用稳定的 `snake_case` 代码，而不是自由文本句子

## 6. success / failure 判定

### 6.1 成功条件

满足以下条件即可视为 `ok = true`：

- `exit_code = 0`
- 拿到了可接受的 `final_text`
- `turn_status` 不为 `failed`
- 没有命中致命 failure.kind

### 6.2 可接受的缺失

以下字段缺失时，不直接判失败，而是写入 `evidence.warnings`：

- `thread_id` 缺失
- 某些非关键事件未出现
- 出现未知事件类型

建议 warning 名称：

- `missing_thread_id`
- `missing_turn_completed`
- `unknown_event_types_present`

### 6.3 必须判失败的情况

以下情况应返回 `ok = false`：

- CLI 无法执行
- JSONL 完全不可解析
- 没有可接受的最终返回值
- `turn_status = failed`
- 命中明确的 `failure.kind`

## 7. 与 failure taxonomy 的接缝

`v0` 先不做完整 trace 映射，但 failure 归因仍必须稳定。

建议边界：

- 有原始证据但契约字段无法满足：`contract_failure`
- CLI / auth / network / sandbox / approval 层面失败：`environment_failure`
- clean-room 契约未满足：`runner_misconfiguration`
- `codex` 或 backend 不可用：`unavailable`

原则：

- `failure` 负责归类
- `evidence` 负责保留最少证据
- 不要求先构造完整 trace 树

更细的 `reason` 取值见：

- [failure-taxonomy-design.md](failure-taxonomy-design.md)

## 8. 与 artifacts 的关系

`v0` 最小依赖这些 artifacts：

- `artifacts/raw-events.jsonl`
- `artifacts/stdout.txt`
- `artifacts/stderr.txt`
- `artifacts/evidence.json`
- `artifacts/result.json`

其中：

- `result.json` 保存最终返回体
- `evidence.json` 保存 `evidence` 块或等价摘要
- 原始 JSONL 继续作为审计依据保留

## 9. v0 明确不做的事

为控制范围，本文明确不要求：

- 完整 `trace.json`
- 完整 `item` 级结构映射
- 事件顺序重建
- 多 turn 深度语义分析

这些能力如果后续确有需要，再在 `v1+` 扩展，不应阻塞当前阶段落地。
