# recall 队列 context 层声明设计

日期：2026-06-06 | 状态：已确认

修订对象：[2026-06-05-recall-eval-dynamic-agent-design.md](./2026-06-05-recall-eval-dynamic-agent-design.md) 中「`.recall/prompt-context.yaml` DSL 文件」方案。

---

## 目标

让召回结构与召回队列结构能**显式声明**：本次召回是否加载项目提示词（repo 层，如 `AGENTS.md`）、是否加载全局提示词（global 层，如用户家目录下的全局记忆文件）。

同时解决三个既有问题：

1. `skills/recall-eval/prompt-context.yaml` 是死文件——`model-agent.mjs` 从不读取它，注入内容硬编码在脚本内，文件头注释与实现矛盾。
2. 上一版设计把该 DSL 放进 `.recall/`，但 `.recall/*.yaml` 会被 `scripts/tooling/check-fixtures.mjs` 当作召回契约 fixture 校验，非召回 schema 的 yaml 放进去必然打挂 `npm run check`。
3. 上下文拼装结构定义（skills/repo/global 三层）散落：引擎在 `_shared`，DSL 孤儿文件在 recall-eval，队列契约对上下文层只字未提。

## 方案

废除独立 DSL 文件，把上下文层声明**内嵌进召回队列契约**；结构定义归 `skills/_shared` 引擎层维护，并且**落地为独立 schema 文件**（类 JSON Schema 子集），校验代码只消费 schema、不再手写逐字段 shape 检查。

### 能力边界划分

| 层 | 归属 | 职责 |
|---|---|---|
| 机制层 | `skills/_shared/prompt-context.mjs` + `schema-validator.mjs` | 三层（skills/repo/global）拼装引擎；schema 文件解释执行；context 声明的归一化与跨字段语义；不内置任何策略 |
| 结构权威 | `skills/_shared/schemas/prompt-context-layers.schema.yaml`、`skills/recall-eval/schemas/recall-queue.schema.yaml` | yaml 数据结构的唯一机器可读定义；队列 schema 通过外部 `$ref` 复用 layers schema |
| 契约层 | 召回队列 yaml（`context` 块） | 显式声明本次召回加载哪些提示词层；队列级声明、用例级整块覆盖 |
| 策略层 | `skills/recall-eval/scripts/model-agent.mjs` | clean-context-v1 注入钉死在代码（红线不是配置项）；按 `context` 声明拼装 repo/global 层 |

判据：**调用方允许改的进队列契约（加载哪些层）；不允许改的钉死在代码（no tools / no web / no fresh reads）；结构本身写进 schema 文件，代码与文档都只是消费方/镜像。**

### schema 落地约束

- 校验器只实现仓库 schema 实际用到的关键字子集（type / required / properties / additionalProperties / items / minItems / minimum / pattern / `$ref` / `$defs`），刻意不支持 if-then、oneOf。
- schema 表达不了的跨字段语义留在代码：生效 `source_ref` 解析（队列级继承 + 用例级覆盖）、`context.global.enabled` 时必须给 `path`。
- 报错文案是对外契约的一部分（fixture、EXAMPLES.md 与测试断言依赖 ``missing `medium` `` 这类格式），校验器按既有格式输出。
- 样例与 schema 强制同步：样例文件由单元测试用 schema 校验，不允许漂移。

### 队列契约新增：`context` 块（可选）

```yaml
# 队列级声明；用例级可用同形状整块覆盖（不做深合并，语义同 source_ref 覆盖）
context:
  repo:
    enabled: true            # 必须显式给布尔值
    path: AGENTS.md          # 可省略；默认 AGENTS.md，相对队列所在仓库根解析
    max_bytes: 8192          # 可选；正整数
  global:
    enabled: true
    path: ~/.claude/CLAUDE.md  # enabled 时必填——全局提示词没有跨平台默认路径
    max_bytes: 4096
```

语义：

- 缺省（不写 `context`）= 不加载任何 repo/global 层 = 现状行为，向后兼容。
- `context` 只决定**注入哪些提示词层**，不放松 clean-context-v1 的 no-tools/no-reads 红线。
- `medium` 与 `context` 不做强联动校验（v1 边界）：`global-memory` 用例通常应开 global 层，由队列作者自行保证。

### 主流程

1. `lib.mjs` 校验队列时调用引擎的 `validateContextLayers` 校验 `context` 块，并解析每用例生效的 `effectiveContext`（用例级 > 队列级 > null）。
2. `run-eval.mjs --live` 把 `effectiveContext` 传给 `runRecallAgent`。
3. `model-agent.mjs` 经 `normalizeContextLayers` 把声明（snake_case）映射为引擎 config（camelCase），与内联的 `source_ref` 内容、钉死的 clean-context 注入一起交给 `buildSystemPrompt`。
4. `buildSystemPrompt` 按 `cwd`（队列所在仓库根）解析相对路径，`~` 前缀按 `os.homedir()` 展开（修复 Windows 下 `HOME` 缺失问题）。

### 异常态

- `context` 非对象、含 repo/global 之外的键、`enabled` 非布尔、`path` 空串、`max_bytes` 非正整数 → 队列定义失败（queue-definition failure）。
- `global.enabled: true` 且无 `path` → 队列定义失败。
- 声明的层文件不存在 → 拼装时静默跳过该层（引擎 `readMaybe` 语义），不算运行时失败；是否该升级为显式报错留待后续版本。

### 文件变更

- 删除 `skills/recall-eval/prompt-context.yaml`（死文件）。
- 新增 `skills/_shared/schema-validator.mjs`（类 JSON Schema 子集校验器）。
- 新增 `skills/_shared/schemas/prompt-context-layers.schema.yaml`（context 声明结构权威）。
- 新增 `skills/recall-eval/schemas/recall-queue.schema.yaml`（队列契约结构权威，外部 `$ref` 复用 layers schema）。
- 新增 `skills/_shared/README.md`：各共享模块能力边界 + context 声明结构定义（prose 镜像）。
- 样例迁入 examples 目录：`SAMPLE-QUEUE.yaml` → `skills/recall-eval/examples/queue.example.yaml`（带队列的版本）；新增 `skills/_shared/examples/context-layers.example.yaml`（非队列的简单版本）。
- `.recall/` 命名规约升格为书面契约（写入 SKILL.md）：`queue.yaml` 是自动发现入口；`broken-*` 前缀 = 故意非法负例（`npm run check` 强制其保持非法）；其余名字仅显式路径引用；`.recall/` 不放非召回 schema 的 yaml。
- 新 fixture：`.recall/queue-with-context-layers.yaml`（正例）、`.recall/broken-invalid-context.yaml`（负例）。
- 新增手写 fixture 提示词：`.recall/fake-repo-prompt.md`、`.recall/fake-global-prompt.md`。自测隔离红线：自测队列与单元测试的 `context` 层只指向手写 fixture 提示词（或临时目录文件），不依赖真实 `AGENTS.md` / 用户全局提示词——真实提示词内容变化不得影响自测结果；只有「评测对象就是该提示词」的真实评测队列（如仓库根 `.recall/queue.yaml`）才引用真实文件。
- 修复存量 fixture bug：根 `.recall/queue.yaml` 的 `- [by=x-promptkit]` 被 YAML 解析为嵌套数组而非字符串，旧手写校验静默吞掉、该 `must_include` 从未生效；schema 驱动校验将其报出，已补引号修复。

### 边界与后续

- provider 矩阵（`.recall-replay.env.yaml`）与 integration-test suite yaml 本轮不做 schema 化；若后续 schema 化，沿用同一校验器与「schema 文件 = 结构权威」约定。

## 验收点

- `npm test`：lib 校验/继承覆盖、schema 校验器与样例一致性（`tests/prompt-context.test.mjs`）、model-agent（echo provider）按声明注入 repo/global 层（`tests/recall-eval.model-agent.test.mjs`）。
- `npm run lint` 与 `npm run check` 全绿（新增 fixture 被 check-fixtures 按预期分类）。
- `npm run recall:validate -- skills/recall-eval/.recall/queue-with-context-layers.yaml` 输出 PASS；`broken-invalid-context.yaml` 输出 FAIL 且指明 `context.global.path`。
