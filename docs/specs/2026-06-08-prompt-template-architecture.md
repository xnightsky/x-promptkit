# buildSystemPrompt 模板体系

> 2026-06-08 | recall-eval prompt 层架构文档

## 引擎

`skills-def/_shared/prompt-context.mjs` 的 `buildSystemPrompt(config)` 是通用渲染引擎。

输出结构：

```
[injections.beforeSkills]
---
### skill-name
<content>
---
[injections.afterSkills]
---
### Repo Context
<content>
---
### Global Context
<content>
---
[discovery pool]
```

调用方通过 `config` 控制哪些层渲染、层的内容是什么。引擎不做策略判断。

## 策略层

策略（policy）不在引擎中——由调用方在 `config` 中注入。当前有两种策略：

### clean-context-v1（知识召回）

调用方：`model-agent.mjs` 的 `runRecallAgent`

```js
buildSystemPrompt({
  skills: {
    items: [{ name: sourceRef, content: skillContent }], // 注入 source_ref 文本
  },
  repo: layers.repo,                                       // queue context 控制
  global: layers.global,
  injections: {
    beforeSkills: [
      "policy: clean-context-v1",
      "",
      "You may only answer using the context provided below.",
      "Answer the question based solely on what the provided context defines.",
      "Do not invent, do not search, do not read files.",
    ].join("\n"),
  },
  cwd: baseDir,
})
```

红线：
- 不能搜索
- 不能读文件
- 不能调用工具
- 只能用注入的文本回答

### skill-trigger-v1（技能触发）

调用方：`model-agent.mjs` 的 `runSkillTriggerAgent`

```js
buildSystemPrompt({
  skills: {
    allowDiscovery: true,
    discoveryPool: resolvedSkills,     // {name, desc, path}[]
  },
  injections: {
    beforeSkills: [
      "policy: skill-trigger-v1",
      "",
      "You are evaluating which skill to trigger...",
    ].join("\n"),
    afterSkills: [
      "Allowed commands: node, npm, ...",
      "To run a command, output: <tool_call>...</tool_call>",
    ].join("\n"),
  },
  cwd: baseDir,
})
```

红线：
- 可执行白名单 shell 命令
- 不能修改文件
- 不能访问网络
- 输出必须走 `<tool_call>` 格式
- 不注入 source_ref 内容——模型必须通过 shell 自己读取

## 发现池

`config.skills.discoveryPool` 支持两种格式：

```js
// 简单格式
discoveryPool: ["recall-eval", "lint"]

// 对象格式（skill-trigger 推荐）
discoveryPool: [
  { name: "recall-eval", desc: "验证 recall queue", path: "skills-def/recall-eval/SKILL.md" },
  { name: "lint", path: "skills-def/lint/SKILL.md" },
]
```

渲染结果：
```
Available skills (cat the path to read full docs): recall-eval - 验证 recall queue (skills-def/recall-eval/SKILL.md), lint (skills-def/lint/SKILL.md)
```

## 注册新策略

要加第三种策略（如 `multistep-agent-v1`），只需：

1. 在 `model-agent.mjs` 新增一个函数（如 `runMultiStepAgent`）
2. 调用 `buildSystemPrompt` 传入新的 `config`

不需要改 `prompt-context.mjs` 引擎。

## 策略之间不可混用

一个 recall case 只能选一种 `medium`，对应一种策略：

```
medium: skill-mechanism  → clean-context-v1
medium: global-memory    → clean-context-v1
medium: skill-trigger    → skill-trigger-v1
```

`evaluate-queue.mjs` 在 case 级别路由，不同 case 可以混合在同一队列。
