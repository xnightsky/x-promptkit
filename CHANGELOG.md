# Changelog

本文件记录仓库级版本发布，不记录每一条普通提交。版本采用 SemVer 风格，git tag 采用 `vX.Y.Z`。

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
