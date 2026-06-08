# Changelog

本文件记录仓库级版本发布，不记录每一条普通提交。版本采用 SemVer 风格，git tag 采用 `vX.Y.Z`。

## v0.6.0

provider 矩阵 v2、skill-trigger 模式、carrier 下线。

### Added

- provider 矩阵 v2 格式：map + camelCase，对齐 pi models.json 结构。
- model-runner headers 透传（伪装 UA、注入 beta flag），字段 key 统一为 apiKey。
- 共享 CLI 模块（--provider --model --verbose --help）。
- run.models 支持 `provider/model` 语法，多 model provider 歧义拒绝。
- skill-trigger 模式：白名单 shell agent，模型自主选择并执行命令。
- scoreTriggerCase：trigger.must_run/must_not_run + 输出双轨评分。
- available_skills 目录 + SKILL.md frontmatter 自动解析 name/description。
- v1→v2 迁移脚本。

### Changed

- `skills-def/recall-eval/scripts/` 拆分为 `lib/`（库模块）+ `scripts/`（CLI 入口）。
- evaluateQueueTarget 导出，接受 provider 参数，return 结构化结果。
- 集成测试 import evaluateQueueTarget，跑真实 .recall/queue.yaml 全链路。
- prompt-context 发现池支持 {name, desc, path} 对象。
- queue.yaml reject_missing_medium must_include 简化为 [medium]。

### Removed

- `isolated-context-run:subagent` carrier 机制全量下线。
- `skills-def/isolated-context-run-subagent/` 与 `integration-tests/isolated-context-run-subagent/`。
- 队列 schema 中 carrier 不再为必填字段，报告不再输出 Carrier 节。

## v0.5.0

`skills/` → `skills-def/` 目录重命名。

### Changed

- 技能定义目录由 `skills/` 重命名为 `skills-def/`，与仓库约定（`skills-def/` 为 skill 定义目录，`skills/` 保留给运行时挂载）对齐。
- 所有引用路径（lint、fixture、文档）同步更新。

## v0.4.0

recall-eval 契约 schema 化与 dynamic agent 重构。

### Added

- recall queue 契约新增 `context` 块，队列校验全面 schema 化。
- `_shared` 新增类 JSON Schema 子集校验器与 context 层结构定义。
- recall-replay 跨平台临时目录沙箱，发现类用例在不同操作系统上无差异通过。
- model-client 家目录路径展开，覆盖 Windows 兼容场景。
- 文档约定与写作规范（读 docs / 写 docs / 规则红线）落入 AGENTS.md 与 docs。

### Changed

- recall-eval 执行链路由 carrier 模型全面重构为 dynamic agent。
- 消耗真实 token 的集成测试统一 `*.token.ittest.mjs` 命名，空集改为 SKIP。
- 仓库约定正文收敛至 AGENTS.md 单一权威，README 只保留指引。

### Removed

- 已迁移至 pi-pua-x 的 PUA 失效单测。

### Fixed

- 根队列 canary 断言被 YAML 解析为数组的问题。
- source_ref 解析改为从队列文件位置向上查找仓库根。
- replay-matrix apikey 解析，请求中正确携带授权头。

## v0.3.0

PUA 扩展迁出与 recall harness 减法。

### Added

- recall-evaluator provider-matrix replay harness。
- replay matrix 文件多位置发现：cwd、repo root、skill dir、home dir。

### Changed

- recall-replay 仓库根发现规则修正，补简体中文/BDD 注释与 DeepSeek 示例。

### Removed

- PUA 扩展迁移至独立仓库 `xnightsky/pi-pua-x`，本仓库不再承载其实现。
- recall-evaluator 整套 fixture harness 减法：iitest-lib、run-iitest 入口与全部 test.yaml/real-host/task-memory fixture。
- `--live` 本地落盘（.tmp/recall-runs / --runs-dir / result.json）。

## v0.2.0

skill 载体扩展与 codex-bridge runtime 化。

### Added

- `claude-p-watch` skill：watched `claude -p` 执行与覆盖说明。
- codex-bridge MiniMax worker loader skill：可配置 bridge host/port、54187 启动校验、detached 启动。
- `codex-kimi-worker-installer` skill：no-bridge OpenAI-wire 直连，三维 action 模型与 direnv key 接线。
- PUA 适配器扩展：可见能力快照、子 agent 继承、input/tool_call/compact/turn_end 四个 enforcement hooks。
- lint 扩展：syntax 检查覆盖 `skills-def/`、`runtime/`、`integration-tests/`；`lint:repo` 新增 vendor-source 一致性检查。

### Changed

- codex-bridge 移除 Kimi 集成，runtime 提取到 `runtime/codex-bridge/`。
- opencode-run-with-superpowers 合并为 opencode-run 的 superpowers 前缀模式。
- repo walk 与 tracking 排除 `.claude/` 与 `__pycache__`。

### Fixed

- codex bridge 在 54187 上的启动校验收紧。
- sync-codex-bridge-runtime 排除 `__pycache__`。

## v0.1.0

首个正式基线版本。

### Added

- `isolated-context-run` frontdoor 与 `isolated-context-run:codex` 子层能力，覆盖 clean-room、workspace-link、git-worktree 与结构化执行归一化。
- Codex child skill loading、`SKILLS.fallback.md` 兼容挂载、真实宿主 token 集成测试入口。
- recall queue 解析、`recall-evaluator` runtime、target-local queue 发现与对应的 unit/integration 覆盖。

### Changed

- 仓库测试与验证入口统一到 `test:*`、`iitest:*`、`iitest:token:*` 分层。
- `repo skills -> 子载体` 的可见性边界改为显式 allowlist，并补齐相应契约与测试说明。
- 根 README、专题设计文档与 integration 协议统一到当前 skill/runtime 分层口径。
