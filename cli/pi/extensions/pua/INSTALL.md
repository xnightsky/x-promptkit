# PUA Extension for pi — 安装与使用指南

## 安装

1. 安装 tanweai/pua skill（推荐放到 `~/.codex/skills/pua/`）。
2. 将本目录完整复制到 pi 扩展目录：
   ```bash
   cp -r pua/ ~/.pi/agent/extensions/pua/
   ```
3. 重启 pi，扩展自动加载。

## 命令

| 命令 | 说明 |
|------|------|
| `/pua-on` | 启用 PUA（`always_on=true`），当前会话立即生效 |
| `/pua-off` | 关闭 PUA（`always_on=false`），同时关闭反馈频率 |
| `/pua-status` | 查看开关状态、失败计数、压力等级、当前味道 |
| `/pua-reset` | 清零失败计数与时间戳 |

## 配置文件

```
~/.pua/config.json          # always_on / flavor 配置
~/.pua/.failure_count       # 官方失败计数文件（与 tanweai/pua 共享）
~/.pi/agent/pua-state.json  # pi 扩展私有状态（最后失败时间、注入等级）
```

示例 `~/.pua/config.json`：

```json
{
  "always_on": true,
  "flavor": "huawei"
}
```

## 模板文件

扩展依赖 tanweai/pua 原始 repo 的 `references/` 目录，主要文件如下：

| 文件 | 说明 |
|------|------|
| `flavors.md` | 味道文化 DNA、黑话词库 |
| `methodology-{key}.md` | 各味道行为约束（共 13 种） |
| `methodology-router.md` | 任务类型→味道 自动路由 |
| `display-protocol.md` | Unicode 方框表格格式规范 |
| `pressure-prompts.md` | L1–L4 压力 prompt（本扩展特有，需手动维护） |

## 同步上游 References

运行同步脚本，自动拉取 tanweai/pua 最新的 methodology、flavors 等文件：

```bash
bash ~/.pi/agent/extensions/pua/bin/sync-pua-references.sh
```

> `pressure-prompts.md` 等本地扩展文件不参与同步，需手动维护。

## 集成测试

```bash
bash ~/.pi/agent/extensions/pua/pua.ittest.sh
```

> 该脚本消耗真实 AI token，属于集成测试，不进入默认批量回归。
