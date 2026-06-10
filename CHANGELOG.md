# Changelog

本文件记录仓库级版本发布，不记录每一条普通提交。版本采用 SemVer 风格，git tag 采用 `vX.Y.Z`。

## v0.11.0

移除 codex-bridge 运行时与 minimax_worker 集成。

### Removed

- `runtime/codex-bridge/`：in-repo 维护的 codex-bridge 运行时源整体删除。
- `skills-def/codex-bridge-minimax-worker-installer/`、`codex-bridge-minimax-worker-loader/`：两个 `minimax_worker` 安装/启动 skill 及 vendored 副本。
- `scripts/tooling/sync-codex-bridge-runtime.mjs` 及 `package.json` 的 `sync:codex-bridge-runtime` 脚本。
- `tests/codex-bridge-runtime.test.mjs` 单测。

### Changed

- `lint-repo.mjs`：移除 runtime→vendor 一致性校验块及随之失效的 `path`/`createHash` 导入。
- `README.md`：去掉「Codex bridge runtime 入口」常用入口行。

## v0.10.0

recall-eval `skill_trigger.permissions`：glob 模式 allow/deny 命令权限配置。

### Added

- recall-eval：`skill_trigger.permissions` —— `mode` / `allow` / `deny` 三字段，`allow`/`deny` 为 glob 模式列表，`deny` 优先于 `allow`；`globMatch` + `createShellChecker(permissions)` 高阶函数生成 shell 命令校验器，`runSkillTriggerAgent` 接收 `permissions` 参数；`evaluate-queue` 从 `data.skill_trigger` 读取并透传 `permissions` / `max_steps` / `timeout_ms`。
- schema：`recall-queue.schema.yaml` 新增 `$defs/permissions`（`mode`/`allow`/`deny`）与 `skill_trigger` 顶层字段，结构权威落 schema。
- fixtures + 集成测试：`skill-trigger-permissions` 4-case token ittest（allow / deny / subshell / default）及对应 prompts；新增 `iitest:token:skill-trigger-permissions` 脚本。
- 单测 +18：`tests/shell-checker.test.mjs` 覆盖 glob 匹配 / merge / override / deny 各分支。

### Changed

- `model-agent.mjs`：`DEFAULT_WHITELIST` → `DEFAULT_ALLOW_PATTERNS`（改为 glob 模式）。
- `recall-author/SKILL.md`：队列结构全景展开所有子字段，新增 `skill_trigger` 文档小节。

## v0.9.0

prompt-context 的 `context.*.path` 支持单文件或有序文件列表（`string | string[]`）。

### Added

- schema-validator：`type` 支持联合（一组类型名，标准 JSON Schema `type: [..]`）——类型相关关键字按值的运行时类型与声明允许类型择一触发；单类型 schema 逐字节零回归。
- prompt-context：`context.repo|global.path` 接受 `string | string[]`。列表按声明顺序读取、**每个文件各自按 `max_bytes` 截断**、拼接时在每段前标注来源路径（`<!-- <path> -->`，用声明里的原始路径串，不暴露绝对路径）；贴合「根 AGENTS.md + AGENTS.ai.md + 边界局部 AGENTS.*.md」多文件组合。单串形态输出与历史逐字节一致。
- 单测 +11：联合类型接受/退化拒绝、多文件按序拼接 + 逐文件截断 + 来源标注、缺文件跳过、归一过滤空项、global 列表 path 语义；新增 `tests/schema-validator.test.mjs` 锁联合类型与向后兼容回归。

### Changed

- `schemas/prompt-context-layers.schema.yaml`：`path` 放宽为 `type: [string, array]` + `pattern` + `minItems` + `items`。
- `_shared` 文档与示例（`README.md`、`context-layers.example.yaml`）、`recall-author/SKILL.md` 的 context 段补列表形态语义；prompt-context 顶部输出模板补多 path 示例。

## v0.8.0

recall-eval 具名字段裁决（`expected.decision`）：双极累加 + knockout 否决。

### Added

- recall-eval：`expected.decision` 块——具名维度逐条打分（命中 +weight / 答错 -weight / 缺席 0）累加、不封顶；`knockout` 维度未命中即整题 FAIL；维度名作者自定义，结构权威落 schema。
- schema-validator：支持 `minProperties` 与 `additionalProperties` 子 schema（约束开放 key 的值形状）。
- fixtures：`.recall/selftest-decision.yaml`（三向自测）、`fake-routing-prompt.md`、`broken-decision-bad-weight.yaml`；`examples/queue.example.yaml` 增 decision 示例 case。
- 设计文档 `docs/specs/2026-06-09-named-decision-adjudication-design.md`。
- recall-eval 与 recall-author 的 SKILL.md 各补 decision 契约/写作小节。
- `_shared/*.mjs` 全量补 BDD 注释；prompt-context 输出模板上移至文件顶部（带缩进与全部段类型）。
- 单测 +9（decision 打分各分支 + schema 违规拦截）。

### Changed

- `scoreAnswer`：含 decision 块的用例额外返回 decision 累加分（与内容分并列，v1 不并入单一 headline）；无 decision 块逐字节零回归。
- `evaluate-queue` 报告并列展示 decision 累加分 / FAIL 与逐维度命中。

### Removed

- `.recall/broken-missing-carrier.yaml`：与「carrier 可选」测试相矛盾的陈旧负例，改名为合法 fixture `queue-no-carrier.yaml`（修复 `npm run check` 长期失败）。

## v0.7.0

recall-author 百科 skill、_shared 内联、source_ref 相对路径、install 全局化。

### Added

- recall-author：面向队列编写者的人读百科（字段一览、写作规则、常见反例、场景速查、解答流程）。
- recall-author/.recall/queue.yaml 自验队列（3 case：必填字段、carrier 可选、context 缺省）。
- recall-eval : sync-shared 脚本（`npm run recall:sync-shared`），把 _shared/ 模块内联到 lib/_shared/。
- `validateRecallData` 支持 `yamlDir` 参数，source_ref 相对路径 → 绝对路径。

### Changed

- _shared/ 模块（schema-validator、prompt-context、model-client、model-runner）+ schema yaml 内联到 recall-eval/lib/_shared/，安装后自包含。
- 全部 .recall/*.yaml source_ref 从 `skills-def/.../SKILL.md` → `../SKILL.md`。
- SKILL.md ×2 文档路径从 `skills-def/` 改为 skill 目录相对路径。
- carrier 全篇从必填改为可选（缺省 `"direct"`）。
- INSTALL.md：+recall-author、本地安装统一加 `-g`、全局优先推荐。
- skills-lock.json：+recall-author 条目。
- evaluate-queue.mjs、validate-schema.mjs：传 yamlDir 给 validateRecallData。

### Removed

- 文档中 carrier 必填的错误表述（与 v0.6.0 schema 对齐）。

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
