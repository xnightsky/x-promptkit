# PUA Extension for pi

> tanweai/pua 的 pi 适配器，在 pi 中实现 PUA 行为协议的自动注入与失败压力升级。

## 功能

- **自动注入**：会话启动时根据 `always_on` 自动向 system prompt 追加完整行为协议。
- **失败检测**：监听 `tool_result`，识别 Bash / 工具失败并累加计数。
- **压力升级**：连续失败触发 L1–L4 压力 prompt，强制切换思路、搜索源码、完成检查清单或输出结构化失败报告。
- **味道系统**：支持阿里、华为、字节、Musk 等 13 种企业文化味道，可自动路由或手动切换。
- **skill 缺失保护**：未安装 pua skill 时自动关闭扩展，避免注入无效协议。

## 快速开始

详见 [INSTALL.md](./INSTALL.md)：安装、命令、配置、同步上游 references、集成测试。

## 文件结构

```
pua/
├── index.ts                 # 扩展主入口（注册钩子与命令）
├── references_loader.ts     # 对接 tanweai/pua references/ 的加载器
├── bin/
│   └── sync-pua-references.sh   # 从上游仓库同步 references 文件
├── INSTALL.md               # 安装与使用指南
├── pua.md                   # 跨平台调研与扩展设计文档（内部）
├── pua.ittest.sh            # 集成测试脚本（消耗真实 AI token）
└── README.md                # 本文件
```
