# guided-review

`guided-review` 是本仓库当前正在开发和验证的 skill。

这里的主语是 skill，而不是独立产品级 CLI。仓库存在的目的，是把这个 skill 的契约、参考资料、脚本入口和测试收拢在一起，方便持续迭代。

## 当前定位

- `skills/guided-review/` 是主体
- `skills/guided-review/scripts/` 是该 skill 自带的开发与验证入口
- 顶层 `npm run guided-review` 只是一个薄别名，用来运行 skill 内部脚本
- 当前 CLI 不作为稳定产品接口承诺

## 文档导航

- [design.md](./design.md)
  - 解释为什么采用 skill-first 结构、目录边界如何划分、脚本职责如何拆分
- [development-plan.md](./development-plan.md)
  - 记录已落地事实、未落地初衷、下一步拆分顺序和验收标准

## 相关目录

- `skills/guided-review/`
  - skill 契约、help、examples、参考资料与开发脚本
- `tests/guided-review/`
  - 针对 skill 与脚本的验证

## 说明

当前文档会显式区分两类信息：

- 已落地事实
- 目标设计或后续演进方向

这样做的目的是避免把“初衷”误读成“已经实现”。
