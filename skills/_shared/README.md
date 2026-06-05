# skills/_shared

跨 skill 复用的共享原语。本目录只放**机制层**代码与结构定义：不内置策略、不绑定任何具体 skill 的契约语义。

## 能力边界

| 模块 | 职责 | 不做的事 |
|---|---|---|
| `prompt-context.mjs` | skills/repo/global 三层 system prompt 拼装；context 声明的归一化（`normalizeContextLayers`）与校验入口（`validateContextLayers` / `validateContextSemantics`） | 不决定该不该加载哪一层；不内置 clean-context 之类的策略 |
| `schema-validator.mjs` | 类 JSON Schema 子集校验器：让 yaml 数据结构以独立 schema 文件为结构权威，校验代码只消费 schema | 不支持 if-then、oneOf 等组合关键字；跨字段语义留给调用方 |
| `schemas/` | 结构权威文件（当前：`prompt-context-layers.schema.yaml`） | — |
| `examples/` | 人读样例（当前：`context-layers.example.yaml`，非队列的简单版本），由单元测试保证与 schema 持续一致 | — |
| `model-runner.mjs` | 多协议 `callModel`（anthropic-messages / openai-chat / echo）+ 重试预算 | 不读文件、不发现配置 |
| `model-client.mjs` | provider 矩阵发现与加载（`loadProviders`）、client 工厂（`createClient`） | 不定义 prompt 内容策略 |

判据：**调用方允许改的属于配置/契约（由调用方契约声明），不允许改的属于策略（钉死在调用方代码）；本目录两者都不持有，只提供机制与结构定义。**

## context 层声明（结构定义）

文件态声明形式（snake_case），供调用方契约内嵌（如召回队列 yaml 的 `context` 块）：

```yaml
context:
  repo:
    enabled: true            # 必须显式布尔值：是否加载项目提示词
    path: AGENTS.md          # 可省略；默认 AGENTS.md，相对调用方给定的解析基准目录
    max_bytes: 8192          # 可选；正整数
  global:
    enabled: true            # 必须显式布尔值：是否加载全局提示词
    path: ~/.claude/CLAUDE.md  # enabled 时必填——全局提示词没有跨平台默认路径
    max_bytes: 4096
```

结构权威是 [schemas/prompt-context-layers.schema.yaml](./schemas/prompt-context-layers.schema.yaml)（独立 schema 文件，`schema-validator.mjs` 解释执行）；schema 表达不了的跨字段语义（global enabled 必须给 path）在 `prompt-context.mjs` 的 `validateContextSemantics`。本节只是 prose 镜像，不一致时以 schema + 单元测试为准并修文档。

`~` 前缀按 `os.homedir()` 展开（兼容 Windows 上 `HOME` 未设置的情况）；声明的层文件不存在时拼装静默跳过该层。

## 消费方

- `skills/recall-eval`：队列契约内嵌 `context` 块（见 `skills/recall-eval/SKILL.md` 的 context Rule；队列 schema 通过外部 `$ref` 复用本目录的 layers schema）；clean-context-v1 策略钉死在 `scripts/model-agent.mjs`。
