# Dev Run Integration Tests

Markdown case 协议（沿用 `claude-p-watch/` 的 `subagent.md` + `main-agent-assert.md` 模式）。

## Case 列表

| Case | 场景 | 覆盖点 |
|------|------|--------|
| case-01 | 无后端指定，配置默认 pi | 从 PWD 向 home 检索 + pi 命令骨架 |
| case-02 | 显式指定 codex | codex 后端路由 + `codex exec --json` 骨架 |
| case-03 | 显式指定 opencode | opencode 后端路由 + `opencode run` 骨架 |
| case-04 | 显式指定 pi | pi 后端路由 + `pi -p` 骨架（含 `</dev/null` 护栏） |
| case-05 | 同一任务切换后端 | 路由正确性 + 后端互不污染 |
| case-06 | 显式指定 cursor-agent | cursor 后端路由 + `cursor-agent -p --trust` 骨架 |
| case-07 | 显式指定 kimi | kimi 后端路由 + `kimi -p` 骨架（不带 `</dev/null`、不带 `--yolo`） |
| case-08 | 无配置时内建兜底 | claude 兜底 + 标准命令骨架 |

## 执行协议

1. 读取 case 目录下的 `subagent.md`
2. 提取 `## Input` 和 `## Execution Constraints`
3. 用 `Input + Execution Constraints` 组成实际执行请求
4. 在隔离 subagent 运行中执行该请求
5. 读取返回的纯文本结果
6. 对照 `main-agent-assert.md` 中的 `## Assert Must Include` / `## Assert Must Not Include` 做字面断言

## 维护约束

- `subagent.md` 只放会发给执行 agent 的输入与执行约束
- 主代理专用的验证理由与推导放到 `main-agent-assert.md`，写在 `## Assert Notes`
- 如果 case 运行依赖 `skill_entries`，只挂 `dev-run` skill 一个即可
