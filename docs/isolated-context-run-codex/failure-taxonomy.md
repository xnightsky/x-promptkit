# failure taxonomy 设计

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [research.md](research.md)
  - [exec-v0-contract.md](exec-v0-contract.md)
  - [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - [clean-room-design.md](clean-room-design.md)
  - [../../TODO.md](../../TODO.md)

## 1. 文档目的

本文只回答 `isolated-context-run:codex` 的失败如何归因。

本文负责：

- `failure.kind` 的主分类边界
- `failure.reason` 的稳定代码表
- `probe.mjs` 与 `run-exec.mjs` 各自该落到哪类失败
- 哪些情况只记 warning，不应判失败

本文不负责：

- 认证策略本身
- 完整 trace 树建模
- 插件或 skills 的完整设计

## 2. 基本规则

失败对象最少包含：

```json
{
  "kind": "environment_failure",
  "reason": "auth_failed"
}
```

规则：

- `kind` 是稳定主分类
- `reason` 是稳定 `snake_case` 代码
- 不使用自由文本句子作为 `reason`
- 需要额外上下文时，允许实现层追加可选 `detail`

建议可选扩展：

```json
{
  "kind": "environment_failure",
  "reason": "auth_failed",
  "detail": "codex exec returned unauthorized"
}
```

其中：

- `detail` 仅用于调试和日志
- 上层逻辑不得依赖 `detail` 做判定

## 3. 主分类边界

固定主分类：

- `unavailable`
- `environment_failure`
- `contract_failure`
- `runner_misconfiguration`

### 3.1 `unavailable`

定义：

- 宿主命令或目标 backend 根本不可用

原则：

- “没这个能力”才叫 `unavailable`
- 不是“能力存在但运行失败”

### 3.2 `environment_failure`

定义：

- 宿主能力存在，但执行环境导致本次运行失败

原则：

- auth、network、provider、sandbox、approval 都归这里
- `codex exec` 启动后返回失败，也优先看这里

### 3.3 `contract_failure`

定义：

- 原始执行过程有证据，但无法满足仓库对返回契约的最低要求

原则：

- 这是“归一化契约没法成立”
- 不是宿主环境脏，也不是脚本自己炸了

### 3.4 `runner_misconfiguration`

定义：

- 本仓库 runner 自己没有满足前置契约

原则：

- clean-room 不成立
- 请求参数不符合业务前提
- artifact 目录或工作目录与预期不匹配

## 4. `probe.mjs` reason 表

`probe.mjs` 只允许落这几类 reason：

### 4.1 `unavailable`

- `codex_command_missing`
- `exec_subcommand_unavailable`
- `json_flag_unavailable`
- `backend_not_supported`

### 4.2 `environment_failure`

- `version_probe_failed`
- `capability_probe_failed`

说明：

- `probe.mjs` 不负责真实任务执行，因此它的 `environment_failure` 应很少
- 一般只在探测命令本身异常时出现

## 5. `run-exec.mjs` reason 表

### 5.1 `unavailable`

- `codex_command_missing`
- `backend_not_supported`

### 5.2 `environment_failure`

- `auth_failed`
- `network_failed`
- `provider_failed`
- `sandbox_denied`
- `approval_denied`
- `approval_pending`
- `process_spawn_failed`
- `process_exit_nonzero`
- `empty_response`
- `raw_event_log_missing`

说明：

- auth 具体如何处理由 Codex 自己决定
- runner 只在可观测结果上归到 `auth_failed`

### 5.3 `contract_failure`

- `jsonl_unparseable`
- `missing_final_text`
- `missing_failure_payload`
- `invalid_turn_status`
- `result_contract_unsatisfied`

说明：

- 有原始证据，但无法拼出 `codex-exec-v0-contract`
- 归这里而不是 `environment_failure`

### 5.4 `runner_misconfiguration`

- `missing_working_directory`
- `missing_artifacts_dir`
- `artifacts_dir_unwritable`
- `invalid_request_payload`
- `clean_room_not_satisfied`

说明：

- 这些问题说明是 runner 或调用方前置条件没准备好
- 不应甩锅给 Codex 宿主

## 6. warning 与 failure 的边界

以下情况默认只记 `evidence.warnings`，不判失败：

- `thread_id` 缺失
- 出现未知事件类型
- 少量非关键事件缺失
- 隐式默认的 `workspace-link` 创建失败后已成功降级到 `git-worktree`

建议 warning 代码：

- `missing_thread_id`
- `missing_turn_completed`
- `unknown_event_types_present`
- `workspace_link_create_failed_fell_back`

补充规则：

- 显式 `workspace_mode=workspace-link` 创建失败，应归到 `runner_misconfiguration/clean_room_not_satisfied`
- 只有隐式默认链才允许把 `workspace-link` 创建失败降级成 warning

只有当这些问题导致 `codex-exec-v0-contract` 无法成立时，才升级为：

- `contract_failure.result_contract_unsatisfied`

## 7. 判定优先级

同一次运行同时出现多个异常时，按下面优先级归类：

1. `runner_misconfiguration`
2. `unavailable`
3. `environment_failure`
4. `contract_failure`

解释：

- 如果 runner 前置就没准备好，优先归 runner
- 如果目标能力根本不存在，优先归 unavailable
- 如果宿主运行失败，优先归 environment
- 只有宿主跑了且证据存在，但契约无法归一化时，才归 contract

## 8. 与脚本退出码的关系

脚本退出码不表达这些业务失败。

固定规则：

- 业务失败：stdout JSON 中 `ok=false` + `failure.kind/reason`
- 脚本退出非零：只表示脚本自身没处理好请求

示例：

- `codex` 命令不存在
  - stdout JSON：`kind=unavailable` / `reason=codex_command_missing`
  - 进程退出码：`0`

- `codex exec` 返回认证失败
  - stdout JSON：`kind=environment_failure` / `reason=auth_failed`
  - 进程退出码：`0`

- 请求 JSON 缺 `task.prompt`
  - 不进入业务 failure
  - 脚本退出码：`1`
- `extra_args` 包含禁止参数
  - 不进入业务 failure
  - 脚本退出码：`1`

## 9. v0 明确不做的事

本文明确不做：

- 更细的 provider 子分类
- 错误文案国际化
- 多层嵌套 failure 对象
- 依据自然语言错误消息做复杂推断

`v0` 只追求稳定、够用、可编码的归因表。
