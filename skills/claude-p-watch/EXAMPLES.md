# Claude -p Watch Examples

This file is the companion corpus for [SKILL.md](./SKILL.md). Each case locks command construction, bare-command execution, and the internal PID/tail helper behavior for monitored `claude -p` runs.

## Case 01: 直接执行并持续监控

触发方式：

- “直接执行，并持续监控直到结束”
- “启动后每分钟告诉我最后几行”

最小上下文：

- 用户明确要 watch，而不是单次启动结果

期望产出：

- 使用 canonical `claude -p` 命令骨架直接执行
- `IS_SANDBOX=1` 作为固定命令字面保留，不额外解释
- 宿主 `claude -p` 进程启动后，通过内部 `discover-pid` helper 拿到 PID 一次
- 后续 watch 通过 `tail-by-pid` helper 重复查询
- 重复汇报最多每分钟一次

标准输出样例：

```md
命令已启动，已发现宿主 `claude -p` PID；后续按 60 秒粒度用 `tail-by-pid` 汇报最新 2-3 行摘要或 empty 原因。
```

验收标准：

- watch 目标明确是外层 `claude -p` PID
- 不提前展开 sandbox / approval / permission 说明
- 不让 AI CLI 临时发明监控方案
- 不刷短轮询噪声

反例：

- “这个命令里有 `IS_SANDBOX=1`，因为需要绕过权限提示”
- “你可以手动执行以下命令”
- “我先挂着会话，过几秒再看看”
- “我会同时用 `ps` 推断它有没有在跑”

---

## Case 02: Linux regular-file stdout 可抓尾部

触发方式：

- 运行中的宿主 `claude -p` stdout 已重定向到常规文件

最小上下文：

- 平台是 Linux
- `/proc/<pid>/fd/1` 可解析到 regular file

期望产出：

- 返回最后几行 tail 摘要
- 不重放全量 stdout

标准结果样例：

```md
最新 watch：已捕获宿主 stdout 尾部，末尾几行为 `PROGRESS:...`
```

验收标准：

- 仅 tail 最后几行
- `tail-by-pid` 返回的 stream 优先为 `stdout`

反例：

- 全量回放 stdout
- 改去监控内部 bash PID

---

## Case 03: Linux pipe/socket/tty 安全降级

触发方式：

- `/proc/<pid>/fd/1` 和 `/proc/<pid>/fd/2` 都指向 pipe、socket、tty 或不可读目标

最小上下文：

- 平台是 Linux
- stdout 不是 regular file

期望产出：

- 返回 empty tail
- 同时说明原因

标准结果样例：

```md
最新 watch：stdout/stderr 目标都不可 seek，本次 tail 为空；reason=`fd_target_not_seekable`。
```

验收标准：

- 不强行抓历史输出
- 明确 reason

反例：

- 继续用别的侵入式方式偷抓 pipe 历史数据
- 用 `ps` 或时间推测假装成 watch 结果

---

## Case 04: 前台 TTY / character special file 只做判活不伪造 tail

触发方式：

- watched `claude -p` 以前台 PTY 运行
- `/proc/<pid>/fd/1` 指向 `/dev/pts/*` 这类 character special file

最小上下文：

- 平台是 Linux
- `tail-by-pid` 无法从 TTY 倒推历史输出

期望产出：

- 明确说明本次 tail 为空与原因
- 另行通过 runtime PID 或 session 状态判断宿主是否仍存活

标准结果样例：

```md
最新 watch：`fd1` 为 `/dev/pts/3` 的 character special file，tail 为空；已单独复核宿主状态，当前仍在运行。
```

验收标准：

- 不把“无 tail”误报成“已停止”
- 不把“仍有 PID”误报成“一定还没完成”

反例：

- 把 TTY 下看不到 tail 说成“没有任何进展”
- 直接拿 prompt 里的 `DONE` 文字当进程仍存活的证明

---

## Case 05: session 已返回后做一次短暂 PID 复核

触发方式：

- watched host session 已返回最终文本
- 同一时刻或紧接着用户追问“是不是停了”

最小上下文：

- session 已拿到 terminal result
- 外层 PID 可能正在退出，也可能已退出

期望产出：

- 立即汇报 terminal result 已到达
- 再做一次短暂 PID 复核，区分“已退出”和“短暂 draining”

标准结果样例：

```md
会话已返回最终结果；复核后宿主 PID 已退出，可确认命令已结束。
```

验收标准：

- 不把“session 已返回”与“PID 必然已退出”混为一谈
- 不需要等待下一次 60 秒 watch

反例：

- 看到 session 返回就直接声称 PID 一定消失
- 明明用户在追问状态，仍坚持等下一轮定时 watch

---

## Case 06: 退出态即时汇报

触发方式：

- 任务完成、崩溃、被信号终止，或用户主动要求检查状态

最小上下文：

- 宿主 `claude -p` 已经进入终止态

期望产出：

- 立即汇报 terminal status
- 不等下一次定时 watch

标准结果样例：

```md
命令已结束，最终结果为 `DONE`。
```

验收标准：

- 终止态即时上报
- 不在终止后继续按固定频率汇报
