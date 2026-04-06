# guided-review 设计文档

- 状态：进行中
- 主体：`guided-review` skill

## 1. 设计目标

这份设计文档回答三个问题：

1. 为什么 `guided-review` 要以 skill 为主，而不是先做 repo-level CLI
2. 哪些资源属于 skill 自包含目录
3. 当前脚本入口在整个 skill 里承担什么职责

## 2. 结构判断

当前采用 `skill-first` 结构：

- `skills/guided-review/` 是能力主体
- 与该 skill 强绑定的脚本放在 `skills/guided-review/scripts/`
- `tests/guided-review/` 负责验证这个 skill 与脚本入口
- 顶层 `package.json` 只保留一个薄入口，便于开发时调用

这样处理的原因是：

- 当前仓库的核心资产是 skill 契约与其配套资源
- 当前 CLI 只是为开发和验证这个 skill 服务
- 现在没有必要维护一套独立的 repo-level review 产品实现

## 3. 已落地事实

当前已经固定的事实：

- skill 名统一为 `guided-review`
- help 触发片段统一为 `$guided-review --help`
- skill 文档、示例、参考资料与脚本都收敛到 `skills/guided-review/`
- 脚本职责被拆为参数解析、repo 解析、worktree 选择、git context、prompt 拼装和执行入口
- 顶层 `npm run guided-review` 只转发到 skill 内脚本

## 4. 当前脚本职责

`skills/guided-review/scripts/` 的职责不是把 skill 变成一个完整产品，而是提供一个稳定的开发入口。

拆分规则：

- `args.mjs`
  - 解析参数和默认值
- `repo.mjs`
  - 解析当前 repo，校验 git 上下文
- `worktree.mjs`
  - 选择显式 worktree 或生成临时 review worktree
- `git-context.mjs`
  - 提前收敛 review 范围，减少模型重复做机械 git 枚举
- `prompt.mjs`
  - 拼装 guided review scaffold 与预生成的 review context
- `exec-review.mjs`
  - 执行 `codex review`
- `run-review.mjs`
  - 只做入口编排与 dry-run 展示

## 5. 为什么要预生成 review context

最初的痛点是：模型在正式 review 前，常常要花大量 token 在这些低价值操作上：

- `git branch`
- `git log`
- `git diff --stat`
- `git diff --name-only`
- `git show`

这些动作不是 review 判断本身，而是 review 的机械准备工作。

因此当前设计要求：

- git 细节优先由脚本收敛
- prompt 直接消费稳定 review context
- 模型把主要精力放在行为回归、契约一致性、测试缺口和 feedback 组织上

## 6. 目标设计

下面这些属于目标设计，不应误解为全部已完成：

- 更稳定的 branch-vs-branch 临时 worktree 生命周期管理
- 更丰富的 review context 摘要与截断策略
- 更明确的脚本契约测试覆盖
- 若未来确实需要独立产品级 CLI，再从 skill 内脚本抽出

## 7. 非目标

当前明确不做：

- 产品级、长期稳定承诺的 review CLI
- 为未来平台化需求提前抽象过度的 runtime 层
- 在 skill 外保留第二套平行实现
