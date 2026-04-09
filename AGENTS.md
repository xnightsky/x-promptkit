**始终使用简体中文回答**
**输出标记（canary）**：每次回复末尾必须附带一行 `[by=x-promptkit]`。

# AGENTS

本文件用于维护本仓库的代理协作约束与全局行为约定。


## 环境提示
- 如果环境支持，善用 `rg` 和 `fd` 命令

## 规则红线

- 仓库内容中禁止出现本机绝对路径；仓库内引用一律使用相对路径，不要把终端输出、补丁预览或工具回显里的本地目录原样写入文档。

## 全局开发要求

- 任何实现、脚本、文档契约、fixture、README、skill 相关改动，在结束前都必须补跑对应 `lint`；默认入口是 `npm run lint`，需要交付完整校验时跑 `npm run verify`。
- 任何非显然逻辑、协议边界、拒绝分支、输出骨架或字段语义变更，都必须同步补解释性注释；不要把“最后再补注释”当作允许路径。
- 任何影响行为、命令、字段、输出格式、开发流程的改动，都必须同步更新相关文档、示例、fixture 与脚本说明，不能只改实现不改契约。
- 本仓库的默认本地校验顺序是：先跑相关局部检查，再跑 `npm run lint`，再按需要跑 `npm run check` 或 `npm run verify`。
- 代理在宣称“已完成”前，不得跳过 `lint`、必要注释或相关文档同步。

## 测试边界

- 本仓库只有两类官方测试：单元测试与集成测试。
- `tests/` 只放单元测试；`integration-tests/` 只放集成测试资产。
- `npm test` 与所有 `test:*` 前缀脚本只属于单元测试。
- `npm run iitest` 与所有 `iitest:*` 前缀脚本只属于集成测试。
- `iitest:token:*` 只用于会消耗真实 AI token 的显式集成测试入口。
- `*.token.test.mjs` 不进入默认批量回归，只能通过对应显式 `iitest:token:*` 脚本单独运行。
- 纯 fake is unit。即使起了子进程，只要不消耗真实 AI token，且不验证整个环境或编排行为，仍按单元测试处理。
- 任何真实 AI 调用、真实 token 消耗、workspace/clean-room 生命周期、artifact 持久化、carrier/harness 编排或真实宿主路径验证，都属于集成测试。

## skills 开发约束

- 当任务是在本仓库内编写、修改、拆分、整理 `skills/` 下的 skill 文档、样例、说明或相关辅助文件时，不要自动套用面向常规产品开发的重流程原则。
- 这类任务默认不启用以下 superpowers skills，除非用户明确要求：
  - `brainstorming`
  - `test-driven-development`
  - `writing-plans`
  - `requesting-code-review`
  - `verification-before-completion`
- 这类任务也默认不强制执行“先写失败测试再改实现”这一原则；纯文档或纯 skill 契约调整不应为了形式补低价值字符串测试。
- 对 `skills/` 的改动，优先做法是：直接检查仓库上下文、修改目标文档、核对相关引用与示例是否一致；只有当测试能够覆盖真实脚本、真实 fixture、真实解析/执行行为时，才新增测试。
