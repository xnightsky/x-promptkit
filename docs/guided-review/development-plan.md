# guided-review 开发计划

- 状态：进行中
- 主体：`guided-review` skill

## 1. 已落地

- [x] 统一名称为 `guided-review`
- [x] 统一 help 触发片段为 `$guided-review --help`
- [x] 将 skill 文档与参考资料收敛到 `skills/guided-review/`
- [x] 将开发脚本收敛到 `skills/guided-review/scripts/`
- [x] 顶层 `npm run guided-review` 改为 skill 内脚本的薄入口
- [x] 新增 `docs/guided-review/` 记录定位、设计和开发计划

## 2. 当前阶段原则

- skill 是主体，CLI 只是开发与验证入口
- 不同操作拆成不同脚本或函数
- prompt 不再承担大范围 git 机械取数
- 文档要显式区分“已落地事实”和“目标设计”

## 3. 下一步

### review context 稳定化

- [ ] 为 `git-context.mjs` 增加更稳定的摘要与截断策略
  done when: 大 diff、长文件列表、长 commit 列表都能稳定截断并给出清晰标记

### worktree 生命周期

- [ ] 收紧临时 worktree 生命周期与异常清理
  done when: branch-vs-branch 路径在成功、失败、异常退出下都能稳定清理临时 worktree

### 测试完善

- [ ] 补齐 repo / worktree / git-context 的更细粒度断言
  done when: 参数、repo、worktree、git context、CLI 干跑输出都有独立测试覆盖

### 文档同步

- [ ] 保持 README、skill 文档、脚本帮助文本和测试断言一致
  done when: 名称、路径、help 片段和 CLI 说明不再出现旧的 `guided-code-review`

## 4. 变更同步规则

以后对 `guided-review` 的改动，默认同时检查这些文件：

- `skills/guided-review/SKILL.md`
- `skills/guided-review/HELP.md`
- `skills/guided-review/EXAMPLES.md`
- `docs/guided-review/design.md`
- `docs/guided-review/development-plan.md`
- `README.md`

## 5. 验证要求

每次涉及 skill、脚本或文档契约的变更，结束前至少执行：

1. 相关局部测试
2. `npm run lint`

当改动明显影响脚本行为时，再补跑更完整的测试集。
