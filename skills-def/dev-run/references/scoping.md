# Scoping — 通用预设生成引擎（scope）

> **本文件是 scope（套餐表生成）引擎的唯一事实源，宿主无关。**
> 它会被镜像进各宿主的分发形态（镜像件头部自带「请勿手改」注记），**只改这一份**。
>
> scope 按「真实可用模型」交互生成指定后端的套餐表，写入 `.dev-run.yaml`（单文件、双层存储，见「存储」），供各宿主交接时读默认档。结构权威是与本文件同目录的 `packages.schema.yaml`。生成物是**机器本地物**（不进版本控制；项目层建议 gitignore，见「存储」）。

## 触发

scope 只在用户**显式请求**「给某后端生成/更新套餐表」时触发。具体入口形态（斜杠命令、自然语言等）由各宿主的入口文档定义，本引擎不关心；触发后都跑下面同一套引擎。用户请求里**后端名之后的关键词**作第 1 步 list-models 的过滤词。

## 存储（单文件 `.dev-run.yaml`、双层）

套餐表**全部后端共用一个文件** `.dev-run.yaml`：顶层 `version` + `default_backend` + `backends` map，每个后端一个 section（key 用「每后端 scope 配置」表里的落盘 key）。`default_backend` 是“未点名时选哪个后端”，backend section 内的 `default: true` 是“该后端选哪个 model 套餐”，两者不得混淆。分两层，**写方落点跟着安装作用域走，不问用户**：

| 层 | 路径 | 什么时候写这层 |
|---|---|---|
| 项目级 | `<项目根>/.dev-run.yaml` | 本技能是**项目级安装**（安装路径在当前项目目录内，如 `<项目>/.agents/skills/dev-run/`） |
| 用户级 | `~/.dev-run.yaml` | 本技能是**用户级安装**（安装路径在 home 下，如 `~/.config/agents/skills/`） |

- `~` 由执行者解析为本机用户目录（Windows 下同）。
- **判定不出**安装作用域（如全局 npm 目录）→ 按用户级处理，落盘前告知实际路径。
- **局部更新**：文件已存在 → 只替换本 backend 的 section，保留其他 backend section 与文件其余内容；不存在 → 新建。
- **目标层不可写** → 报错停下，**不**自动改写另一层冒充成功。
- **已有 `.dev-run.yaml` 但结构非法**（缺 `version`、`backends` 非 map；或已有 `default_backend` 非法/没有对应 section）→ 停下如实报告，由用户决定修或删，不静默覆盖整个文件。旧文件只缺 `default_backend` 时允许进入第 3 步补齐。
- **git 处理**：项目级 `.dev-run.yaml` 默认建议 gitignore（机器本地模型清单）；文件无敏感信息，团队想共享默认档可自行决定提交。

## 每后端 scope 配置（后端专属只有这 4 处，引擎其余步骤后端无关）

| 后端 | list-models 命令（含 stdin 护栏） | knobs（要交互问的后端专属旋钮） | 落盘 key（`.dev-run.yaml` 的 `backends.<key>`） |
|------|-----------------------------------|-------------------------------|----------------|
| **pi** | `pi --list-models [关键词] </dev/null`（`</dev/null` 不可省，见 backends.md#pi） | `thinking`：枚举 `off｜minimal｜low｜medium｜high｜xhigh` | `pi` |
| **cursor-agent** | `cursor-agent --list-models [关键词]`（Windows/Git-Bash 用 `cursor-agent.cmd`） | 无（推理档编进 model ID，见 backends.md#cursor-agent） | `cursor` |
| **kimi** | `kimi provider list --json`（**无 pattern 参数**、无需 stdin 护栏；解析 `.models` 的 key 作候选 alias 集，关键词过滤在解析后自己做，见 backends.md#kimi） | 无（无独立 thinking flag，thinking 是 config 级，见 backends.md#kimi） | `kimi` |
| **claude / codex / opencode** | —— **无 scope** | —— | —— |

- **无 scope 的后端**：`claude`/`codex`/`opencode` 在 dev-run 里模板固定、不吃 `--model`，没有「选模型」这件事 → 不做 scope。
- 各后端的 list-models 命令与 model 语法细节以 [`backends.md`](./backends.md) 对应条目为准；本表只列 scope 相关的取值。

## 引擎（后端无关 6 步）

### 0. 取配置
从上表取 `<backend>` 的 scope 配置。若该后端**无 scope** → 报「后端 `<backend>` 无 scope（dev-run 模板固定、不吃 `--model`）。支持 scope 的后端：pi、cursor、kimi。」，停下，不进入第 1 步。

### 1. 拉清单
跑该后端配置里的 list-models 命令（**带其 stdin 护栏**，如 pi 的 `</dev/null`）；用户请求里后端名之后的关键词非空 → 当过滤词传入，为空 → 拉全量。**kimi 例外**：`kimi provider list --json` 不吃 pattern 参数，一律拉全量，关键词在你解析 `.models` 后自己过滤。

从输出解析真实可用的 model id 集合，记下来——这是第 2 步选 model 的唯一合法候选集，也是第 3 步校验「model 命中清单」的依据。若 list-models 失败（命令不存在、非零退出等）→ 按第 6 步异常态处理，直接停下。

### 2. 逐条建套餐（循环）
每轮凑齐一条 package。**结构化选择**（model / 各 knob / 设为默认 / 再加一条）用 `AskUserQuestion`（宿主无此工具时用等价的选择式提问）；**自由文本**（name / case / descr）直接对话问——结构化选择工具无原生多行自由文本字段，长文本别硬塞进选项。

1. **挑 model**（结构化选择）：从第 1 步清单里选（选项直接列具体 model id，不让用户手打，避免拼错落到清单外）。
2. **逐个问 knob**（结构化选择）：按该后端配置声明的 knob 集问（pi 问 `thinking` 六选一枚举；cursor 无 knob → 跳过本步）。
3. **写 name**（对话）：套餐名，用户自定（如「多模态」「省钱」）。
4. **写 case**（对话）：一句话速查——适用什么场景。
5. **可选填 descr**（对话）：长描述/注意事项，允许多行、允许留空（存跟 model 强相关、CLI 本身看不到的整段告警）。用户不填就跳过。
6. **问「设为默认?」**（结构化选择）：是/否。
7. **问「再加一条 or 收工?」**（结构化选择）：「再加一条」→ 回步骤 1；「收工」→ 进第 3 步校验。

### 3. 落盘前校验
写文件前，把全部 package 过一遍：

- `packages` 至少 1 条。
- 全表**恰好 1 条** `default: true`（0 条或 ≥2 条都非法）。
- 每条 `model` 必须命中第 1 步 list-models 的结果集（不是随口编的字符串）。
- 每个 knob 值合法（按该后端配置声明的枚举/类型，如 pi 的 `thinking` 六枚举之一）。

套餐校验通过后确定顶层 `default_backend`：

- 新建文件 → 当前 scope 后端自动成为默认后端。
- 更新已有且已有合法 `default_backend` → 用结构化选择询问“保留现有默认后端 / 切换为当前后端”。
- 更新旧文件且缺少 `default_backend` → 用结构化选择从文件内已有 backend section（含当前后端）选一个；选定前不得写盘。
- 最终值必须命中同一文件的 `backends` key；否则校验失败，不落盘。

**任一不过** → 明确指出哪条 package、哪个字段不对，回到第 2 步对应小步针对性补齐/改正；修完再回本步重过。**全部通过前绝不落盘，不留半成品文件。**

### 4. 落盘
按「存储」节判定落哪一层，写该层 `.dev-run.yaml`（目录即项目根或 home，无需预先 `mkdir`）。形状对齐与本文件同目录的 `packages.schema.yaml`：顶层 `version` + `default_backend` + `backends`，本后端 section 含 `packages`；每条 package 含 `name/model/case/default`（`descr` 可选），**后端专属旋钮存进 `knobs` 对象**（如 pi：`knobs: {thinking: medium}`；cursor：无 knob 则省略 `knobs`）。文件已存在 → 只替换本 backend section，并按第 3 步的选择保留或更新 `default_backend`；其他后端 section 原样保留。

首行注释标来源：

```yaml
# 由 dev-run scope 生成 · 符合 references/packages.schema.yaml
```

生成样例（项目层 `.dev-run.yaml`，含 pi 一个后端）：

```yaml
# 由 dev-run scope 生成 · 符合 references/packages.schema.yaml
version: 1
default_backend: pi
backends:
  pi:
    packages:
      - name: 省钱（默认）
        model: deepseek/deepseek-v4-flash
        case: 官方 deepseek，1M context / 384K max-out，速度快
        knobs:
          thinking: high
        default: true
```

### 5. 回显确认
写盘成功后，把最终落盘的 yaml **全文**回显给用户确认，并提示当前 `default_backend`，以及「之后交接 `<backend>` 会读该 section 的 default 套餐」。

### 6. 异常态
- **CLI 不存在，或 list-models 非零退出**：打印其原始 stderr，停下，**不写盘**、不进第 2 步。
- **用户中途放弃**（取消交互、拒绝继续）：直接结束，**不落半成品文件**。
- **第 3 步校验反复不过**：如实告知具体卡在哪条哪字段，不为收尾放宽校验、也不自作主张编值糊弄。
- 存储相关异常（层不可写、已有文件结构非法、作用域判定不出）按「存储」节各条处理。

## 读方

### 1. 从 PWD 向 home 检索配置

以最终执行命令的工作目录为 `PWD`：

1. 从 `PWD/.dev-run.yaml` 开始，逐级检查父目录中的 `.dev-run.yaml`，最近命中的文件立即生效。
2. home 是祖先目录时，检查到 `~/.dev-run.yaml` 为止，不越过 home 继续向上。
3. home 不是 `PWD` 的祖先时（例如工作区挂载在 home 外），检查完 `PWD` 的祖先链后，再把 `~/.dev-run.yaml` 检查一次作为最终候选。
4. 命中后不与更远位置的配置合并；该文件是本次交接唯一配置源。

### 2. 未显式指定后端时选择默认后端

- 命中配置 → 读取 `default_backend`；它必须是 `pi|cursor|kimi` 且同一文件存在对应 backend section。
- 所有候选位置都没有配置文件 → 使用内建兜底 `claude`。
- 命中配置但 `default_backend` 缺失/非法、对应 section 缺失或文件结构非法 → 停止并报告，**不得继续找更远配置，也不得静默回退 claude**。
- 显式后端信号优先级最高，不用 `default_backend` 改写用户选择。

### 3. 后端选定后取默认 model/knob

从第 1 节命中的唯一配置文件读取所选 backend section：

1. 有该 backend section → 用其 `default: true` 档的 `model`（+ `knobs`，如 pi 的 `knobs.thinking`）。
2. 没有该 backend section，或所有候选位置都没有配置文件 → **回退后端自身默认**，不停：pi 走裸 `pi -p`（pi 自身配置的默认 model）、cursor 走 `composer-2.5-fast`、kimi 走裸 `kimi -p`（kimi config 的 `default_model`，如 `kimi-code/k3`）。scope 是可选便利层，不生成也能用。

- 命中且有 `descr` → 回显给用户。
- **显式旋钮优先级最高**：用户给了 `--model`/`--thinking` 等就原样透传，压过 yaml 默认档。
