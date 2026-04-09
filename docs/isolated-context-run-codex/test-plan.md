# codex runner 测试方案

- 状态：专项设计草案
- 日期：2026-04-05
- 相关文档：
  - [research.md](research.md)
  - [probe-run-exec-contract.md](probe-run-exec-contract.md)
  - [exec-v0-contract.md](exec-v0-contract.md)
  - [failure-taxonomy.md](failure-taxonomy.md)
  - [clean-room-design.md](clean-room-design.md)
  - [../../TODO.md](../../TODO.md)

## 1. 文档目的

本文回答 `probe.mjs`、`run-exec.mjs` 与 `clean-room workspace_mode` 在当前阶段如何测试。

本文负责：

- 测试分层
- fake `codex` 基线
- fixture 目录建议
- 每层最小覆盖点
- 正式真实测试门槛

本文不负责：

- `recall-eval` 真实宿主验证
- `sdk` / `app-server` 的测试设计

## 2. 测试分层

延续仓库现有测试风格，`codex runner` 采用三层：

1. `unit`
2. `cli`
3. `harness`

除 `unit / cli / harness` 外，再补一层显式 token 宿主测试：

4. `token`

## 3. fake `codex` 基线

第一阶段统一采用：

- fake `codex` 可执行文件注入 `PATH`

不采用：

- 直接 mock `child_process`
- 真实 Codex 作为日常测试依赖

原因：

- 更接近实际 CLI 契约
- 不把测试绑死到实现细节
- 便于覆盖 `probe.mjs` 与 `run-exec.mjs` 的黑盒行为

## 4. 建议的测试文件

建议新增：

- `tests/codex-runner.lib.test.mjs`
- `tests/codex-runner.probe.test.mjs`
- `tests/codex-runner.run-exec.test.mjs`
- `integration-tests/codex-runner.harness.test.mjs`
- `integration-tests/codex-runner.token.test.mjs`

职责划分：

- `lib.test`
  - 纯函数和 schema 校验
- `probe.test`
  - `probe.mjs` 黑盒 CLI
- `run-exec.test`
  - `run-exec.mjs` 黑盒 CLI
- `harness.test`
  - artifact 落盘与工作目录接线
- `token.test`
  - 真实 Codex 宿主 + `tmp HOME` + `workspace-link` + 完整 skills 挂载的显式 token 阻塞验证

## 5. 建议的 fixture 布局

建议新增：

- `tests/fixtures/codex-runner/fake-bin/`
- `tests/fixtures/codex-runner/requests/`
- `tests/fixtures/codex-runner/events/`

约定：

- `fake-bin/codex`
  - 单个 fake 可执行文件
- `requests/`
  - 合法与非法请求 JSON
- `events/`
  - 各类 JSONL fixture 或坏数据样本

## 6. fake `codex` 最小行为集

第一阶段只要求覆盖下面 5 种模式：

- `probe_ok`
- `probe_missing`
- `run_ok`
- `run_auth_failed`
- `run_bad_jsonl`

说明：

- `probe_ok`
  - `codex --version` 正常
  - `exec --json` 能力可探测
- `probe_missing`
  - `PATH` 中没有 `codex`
- `run_ok`
  - 返回可解析 JSONL
  - 有最终文本
  - 进程退出 `0`
- `run_auth_failed`
  - 返回可观测的认证失败
  - 应归到 `environment_failure/auth_failed`
- `run_bad_jsonl`
  - 产出坏 JSONL 或缺最终结果
  - 应归到 `contract_failure/jsonl_unparseable` 或 `missing_final_text`

建议通过环境变量切模式，例如：

- `CODEX_FIXTURE_MODE=probe_ok`
- `CODEX_FIXTURE_MODE=run_ok`

这样无需维护多份 fake 二进制。

## 7. `unit` 层最小覆盖

至少覆盖：

- `probe.mjs` request schema 校验
- `run-exec.mjs` request schema 校验
- `env` 必需键校验
- `extra_args` 非法输入校验
- `failure.kind/reason` 归类辅助逻辑
- `evidence.warnings` 归类辅助逻辑

重点断言：

- 非法 request 不进入业务 `failure`
- `unsupported_extra_args` 不应作为业务 failure reason 存在

## 8. `cli` 层最小覆盖

### 8.1 `probe.mjs`

至少覆盖：

- stdin JSON 输入
- `--input` 文件输入
- `probe_ok`
- `probe_missing`
- 非法 JSON 导致退出码 `1`

重点断言：

- `probe_missing` 时 stdout 仍为 JSON
- `probe_missing` 时退出码仍为 `0`
- `failure.kind/reason` 符合文档约定

### 8.2 `run-exec.mjs`

至少覆盖：

- stdin JSON 输入
- `--input` 文件输入
- `run_ok`
- `run_auth_failed`
- `run_bad_jsonl`
- 缺 `task.prompt`
- 缺 `env` 必需键
- 非法 `extra_args`

重点断言：

- 业务失败时 stdout 仍符合 `codex-exec-v0-contract`
- 业务失败时退出码仍为 `0`
- 请求非法时退出码为 `1`

## 9. `harness` 层最小覆盖

至少覆盖：

- `run_ok` 后 artifact 全部存在
- `run_auth_failed` 后仍有最小 artifact
- `result.json` 与 stdout JSON 一致
- `evidence.json` 与返回体中的 `evidence` 一致
- `workspace-link` 默认成功
- `workspace-link` 写穿透行为
- 默认链从 `workspace-link` 降级到 `git-worktree`
- 显式 `workspace-link` 不允许静默降级

第一阶段最小 artifact 断言：

- `raw-events.jsonl`
- `stdout.txt`
- `stderr.txt`
- `evidence.json`
- `result.json`

## 10. 与现有 npm scripts 的接缝

建议后续实现时按现有风格新增：

- `test:codex-unit`
- `test:codex-cli`
- `iitest:codex-harness`
- `iitest:token:codex`
- `iitest:token:recall`

仓库级官方分类只有两层：`test:*` 属于单元测试，`iitest:*` 属于集成测试；其中 `cli` 归单元测试，`harness` 归普通集成测试，`token` 归显式消耗真实 AI token 的集成测试。

`iitest:token:codex` 属于正式阻塞测试，不是 smoke。

## 11. 显式 token 宿主测试

当前阶段要求两条真实测试同时通过：

1. 真实 Codex CLI 在 `tmp HOME + workspace-link` 下完成一次可归一化运行
2. 真实 Codex CLI 在挂载完整 `isolated-context-run` / `isolated-context-run:codex` skills 视图后，仍能在 linked workspace 中稳定完成运行

这两条测试共同证明：

- 默认 `workspace-link` 没有破坏真实 Codex 宿主执行
- 完整 skill 资产与 linked workspace 共存时不会破坏 runner 行为

在 `recall-eval` reopen 阶段，还要额外通过：

3. `iitest:token:recall` 在真实 Codex 宿主下覆盖 should-trigger、should-not-trigger、broken queue refusal 三类 case，并同时验证最终回答与 trace / artifact 证据

## 12. v0 明确不做的事

第一阶段明确不要求：

- mock `child_process` 作为主基线
- 完整多 turn 语义测试
- `sdk` / `app-server` 的测试复用

`v0` 先保证 `probe.mjs` / `run-exec.mjs` 的 CLI 契约、artifact 落盘、`workspace-link` 默认链与真实宿主阻塞验证不漂移。
