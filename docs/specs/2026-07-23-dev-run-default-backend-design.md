# dev-run 配置化默认后端设计

- 日期：2026-07-23
- 状态：现行实现（2026-07-23 落地，证据见 §6）
- 范围：让 `dev-run` 在用户未显式指定后端时，从当前工作目录向 home 检索 `.dev-run.yaml`，消除无条件静默路由到 Claude 的风险。
- 关联：[2026-07-23-dev-scope-skill-sinking-design.md](./2026-07-23-dev-scope-skill-sinking-design.md)

## 1. 问题

当前实现只在已经选定 pi、cursor 或 kimi 后，读取 `.dev-run.yaml` 中该后端的默认 model/knob；后端选择本身仍写死为“无显式信号时默认 Claude”。因此，即使用户已经通过 scope 配置了其他后端，未点名后端的交接仍会绕过配置并直接启动 Claude。

## 2. 目标与主流程

`.dev-run.yaml` 顶层新增 `default_backend`，表示未显式指定时的默认执行后端。后端选择顺序必须是：

1. 用户请求中的第一个显式后端信号；
2. 从执行命令的 `PWD` 开始逐级向父目录查找 `.dev-run.yaml`，最近命中的文件生效；
3. 若 home 不在上述祖先链中，则额外把 `~/.dev-run.yaml` 作为最终候选；
4. 全部候选位置都不存在配置文件时，才使用内建兜底 `claude`。

搜索命中后不继续合并更远层配置。显式后端始终优先，且不因配置改变。选定后端后，model/knob 也从同一次搜索命中的配置文件读取。

## 3. 输入/输出契约

配置形状增加：

```yaml
version: 1
default_backend: pi
backends:
  pi:
    packages:
      - name: 日常编码
        model: deepseek/deepseek-v4-flash
        case: 默认编码任务
        default: true
```

- `default_backend` 必须是 `pi`、`cursor`、`kimi` 之一，并且同一文件的 `backends` 必须存在对应 section。
- scope 新建文件时，当前 scope 后端自动成为 `default_backend`。
- scope 更新已有文件时，必须让用户确认保留现有默认后端还是切换为当前后端；旧文件缺少该字段时，必须从已有 backend section 中选定一个后再写盘。

## 4. 异常态

- 最近命中的配置文件中，`default_backend` 缺失或取值非法，或没有对应 backend section：停止，不执行任何 AI CLI 命令，也不继续向更远位置寻找配置来掩盖错误。
- 配置文件结构非法：沿用既有规则，停止并报告，不静默忽略。
- 用户显式指定后端时，不读取 `default_backend` 参与路由；配置只在后续 model/knob 解析时按需读取。

## 5. 验收点

1. `SKILL.md`、`scoping.md`、schema 和示例明确区分默认后端与 backend 内默认套餐。
2. 无显式信号且最近配置声明 `default_backend: pi` 时，构造 pi 命令，不构造 Claude 命令。
3. 当前目录与上层目录均有配置时，当前目录配置胜出。
4. 配置存在但缺失/写错 `default_backend` 时停止，不启动 Claude。
5. 从 `PWD` 到 home 的候选位置都没有配置时仍可使用 Claude 内建兜底。
6. 共享核心镜像一致，`npm run lint` 与 `npm run check` 通过。

## 6. 落地证据

在仓库根执行：

```text
$ npm run lint
lint:code: PASS
lint:docs: PASS
lint:repo: PASS

$ npm run check
check:fixtures: PASS
sync:handoff-core --check: PASS

$ npm test
tests 169
pass 169
fail 0
```

用户级安装验证：重新安装 `dev-run` 后，安装件的 `SKILL.md`、`references/scoping.md`、`references/packages.schema.yaml` 与仓库源逐文件一致；用户级配置解析结果为 `default_backend=pi`，且能解析到 pi 的默认 model 与 thinking 档。
