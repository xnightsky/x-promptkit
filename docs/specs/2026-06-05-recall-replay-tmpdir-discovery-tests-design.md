# recall-replay 矩阵发现测试改为临时目录沙箱 — 设计

日期：2026-06-05
状态：已确认

## 背景

`skills-def/recall-eval/scripts/replay-engine.mjs` 的矩阵文件发现机制（`discoverReplayMatrixPath` / `replayMatrixSearchDirs` / `findRepoRoot`）运行时本身跨平台：路径拼接全部走 `node:path`，home 目录来自 `os.homedir()`。

但 `tests/recall-eval.replay.test.mjs` 中 5 个发现类用例在 Windows 上失败：

- 夹具用硬编码 POSIX 字符串（`"/work/.recall-replay.env.yaml"` 等）模拟假文件系统；
- 生产代码 `join()` 在 win32 上产出反斜杠路径（`\work\...`），与夹具字符串不相等，注入的 `fileExists` 永远 miss。

根因：测试用"字符串集合"模拟文件系统，隐含了平台分隔符假设；且注入 `fileExists` 绕过了真实 `existsSync`，发现链路从未被端到端验证。

## 目标

1. 发现类测试在 Windows / Linux / macOS 上无差别通过，测试代码零平台分支。
2. 路径与目录判断全部交给 Node 标准库（`path` / `fs` / `os`），测试不关心分隔符细节。
3. 生产代码零改动。

## 方案

**在 `os.tmpdir()` 里搭真实目录树，用真实 `existsSync` 跑发现逻辑。**

每个发现类用例独立沙箱：

```
<tmp-sandbox>/            ← fs.mkdtempSync(path.join(os.tmpdir(), "recall-replay-"))
├── work/
│   └── repo/
│       ├── .git/         ← 真目录，标记仓库根
│       └── sub/          ← cwd 从这里向上找仓库根
├── skill/scripts/        ← 注入为 skillDir
│   └── .recall-replay.env.yml
└── home/                 ← 注入为 homeDir
    └── .recall-replay.env
```

- 执行时只注入 `cwd` / `skillDir` / `homeDir` 三个临时路径，不再注入 `fileExists`，使用生产默认的 `existsSync`。
- 断言期望值用 `path.join(sandbox, ...)` 构造，与生产代码同一路径库，平台天然一致。
- 清理：`t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }))`，用例间互不污染。

## 改动范围

| 文件 | 改动 |
|---|---|
| `tests/recall-eval.replay.test.mjs` | 重写 6 个用例（5 个发现类 + `replayMatrixSearchDirs` 顺序用例）为 tmpdir 沙箱；更新文件头注释（发现类用例改为沙箱真实 FS 验证，解析/打分类保持纯离线）；其余 10 个纯逻辑用例不动 |
| `skills-def/recall-eval/.recall-replay.env.example.yaml` | 注释补一句 Windows home 路径示例（`%USERPROFILE%\.recall-replay.env.yaml`） |
| `skills-def/recall-eval/scripts/replay-engine.mjs` | 零改动 |

## 不做什么

- 不改生产发现逻辑、不新增候选目录。
- 不把 `path` 模块做成可注入依赖（YAGNI）。
- 不在运行时做分隔符归一化。

## 验收标准

- Windows 上 `npm run test:recall-replay-unit` 全绿（当前 5 失败 → 0）。
- 测试代码中不出现任何硬编码分隔符的完整路径字符串断言。
- `npm test` 整体不回归。

## 追加范围（执行期经用户确认扩展）

原设计为"生产代码零改动"；执行期发现并经用户指示后，追加两项同根因（平台/宿主状态假设）的修复：

1. **`~` 前缀展开（生产代码改动）**：`RECALL_REPLAY_MATRIX` 写 `~/...` 时，shell 之外无人展开 `~`，Windows 上会被当成字面目录名导致 override 静默失效。新增 `skills-def/_shared/model-client.mjs` 的 `expandHomePath`（只处理 `~`、`~/`、`~\` 前缀；`~user` 形式刻意不支持），并在 `model-client.mjs` 与 `skills-def/recall-eval/scripts/replay-engine.mjs` 两处 override 消费点统一应用。
2. **宿主依赖的 live 用例改沙箱**：`tests/recall-eval.test.mjs` 中 "uses home directory provider matrix" 用例原本假设宿主机 home（注释写死 `/root/`）已放好矩阵文件，在任何未预置的机器上必挂。改为临时 cwd（自带 `.git` 收敛仓库根）+ 通过 `HOME` / `USERPROFILE` 注入临时 home（`os.homedir()` 在 POSIX 读 HOME、Windows 读 USERPROFILE），并新增 `~/` override 的端到端用例。

追加验收：`npm run test:recall-cli` 全绿；`~` 用例分别在单测（`discoverReplayMatrixPath`）与 CLI 端到端各覆盖一次。

执行 token 集成套件时又暴露两个仅在真实 provider 下可见的回归（echo 后端原样回显整个 prompt，从而把它们掩盖了），一并修复：

3. **replay 链路不解析 `apikey`**：`assembleEphemeralAgent` 把 `apikey: SOME_ENV_NAME` 原样透传给 `callModel`，而 `callModel` 只读 `provider.key`，导致真实请求以 `Bearer undefined` 发出、稳定 401。新增 `resolveProviderKey`（解析顺序与 `selectEnabledProviders` 可达性判断一致：先同名环境变量、后 inline key），组装 agent 时物化为 `provider.key`；补单测钉住 authorization 头。
4. **缺少策略回显指令**：`buildReplayMessages` 的 system 提示只声明 `policy: <id>`，未指示模型回显，真实模型的 `policyEcho` 恒为 null。`assert_echo` 非 false 时在 system 中追加显式回显指令。

追加验收：`npm run iitest:token:recall-replay` 与 `npm run iitest:token:recall-live` 在配置 DeepSeek provider 的环境下全绿（真实 token 调用）。

家目录矩阵实测（仓库外 cwd + 家目录 `.recall-replay.env.yaml`）再暴露一个 cwd 假设，一并修复：

5. **`source_ref` 按进程 cwd 解析**：`model-agent.mjs` 直接 `readFileSync(sourceRef)`，注释声明"相对于仓库根"但实现依赖 cwd——从仓库外引用绝对路径队列时稳定 `source_ref not found`。改为 `run-eval.mjs` 从队列文件位置向上找 `.git` 得到 `sourceBaseDir` 并传入 `runRecallAgent`（新增 `baseDir` 参数，绝对路径 source_ref 原样使用）；两个 live 沙箱 CLI 用例补 `doesNotMatch(/source_ref not found/)` 回归钉。

追加验收：仓库外 cwd + 家目录矩阵的 `--live` 全链路（发现 → source_ref 解析 → 真实模型召回 → 打分）实测通过。
