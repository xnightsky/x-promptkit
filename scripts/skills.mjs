#!/usr/bin/env node
// skills.mjs — 把 dev-run skill 经 `npx skills` 装进指定技能目录（默认 Kimi 专属的
// .kimi-code/skills/），全程不碰共享的 .agents/skills。
//
// 为什么需要中转：skills CLI 内置 agent 注册表把 kimi-cli 的全局落点写死为 ~/.config/agents/skills
// （Kimi 官方不扫描该目录），项目级落点写死为 .agents/skills（Kimi 会扫，但那是跨工具共享目录）。
// CLI 又没有自定义落点参数，所以本脚本用「临时 staging 项目级安装（--copy 出真实文件）→ 校验产物 →
// 拷贝进各目标目录 → 删 staging」的中转方式：官方工具只负责发现/校验/提取，落点完全由本脚本控制。
// 也正因为落点自管，--global / --repo / --dest 可以自由组合、一次装到多个位置。
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_NAME = 'dev-run';
// 源 = 本脚本所在仓库（skills CLI 从这里发现/提取 skill），用脚本自身位置解析，不写死机器路径。
const SOURCE_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `skills.mjs — 经 npx skills 把 dev-run 装进指定技能目录（不碰 .agents/skills）

用法:
  node scripts/skills.mjs                  默认：装进当前项目 <cwd>/.kimi-code/skills/${SKILL_NAME}
  node scripts/skills.mjs --global         加用户级 ~/.kimi-code/skills/${SKILL_NAME}
  node scripts/skills.mjs --repo <path>    加指定项目 <path>/.kimi-code/skills/${SKILL_NAME}
  node scripts/skills.mjs --dest <dir>     加自定义技能根目录 <dir>/${SKILL_NAME}（可多次）
  node scripts/skills.mjs --remove [...]   从各指定位置卸载（可带 --global / --repo / --dest）
  node scripts/skills.mjs --help

--global / --repo / --dest 可自由组合，一次装到多个位置；三者都不给时默认当前项目。
安装后需新开 Kimi 会话才会加载（skill 列表在会话启动时扫描）。`;

// 纯函数：argv -> 计划。无副作用，便于单测。
// 落点 flags 是累加语义：global/repo/dests 各自成项，全空时由 resolveTargets 补「当前项目」默认。
export function parseArgs(argv) {
  let mode = 'install';
  let global = false;
  let repo = null;
  const dests = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove') mode = 'remove';
    else if (a === '--global') global = true;
    else if (a === '--repo') {
      repo = argv[++i];
      if (repo == null || repo === '') throw new Error('--repo 需要一个路径参数');
    } else if (a === '--dest') {
      const d = argv[++i];
      if (d == null || d === '') throw new Error('--dest 需要一个路径参数');
      dests.push(d);
    } else if (a === '--help' || a === '-h') {
      return { mode: 'help' };
    } else {
      throw new Error(`未知参数: ${a}`);
    }
  }
  return { mode, global, repo, dests };
}

// 纯函数：计划 -> 目标目录数组（去重，保持声明顺序）。home/cwd 显式传入，便于单测（不碰真实环境）。
// --dest 的语义是「技能根目录」（里面再进 <skill 名>/），与 --global/--repo 的 .kimi-code/skills 对齐。
export function resolveTargets(plan, { home, cwd }) {
  const targets = [];
  if (plan.global) targets.push(path.join(home, '.kimi-code', 'skills', SKILL_NAME));
  if (plan.repo != null) targets.push(path.join(path.resolve(plan.repo), '.kimi-code', 'skills', SKILL_NAME));
  for (const d of plan.dests) targets.push(path.join(path.resolve(d), SKILL_NAME));
  if (targets.length === 0) targets.push(path.join(path.resolve(cwd), '.kimi-code', 'skills', SKILL_NAME));
  return [...new Set(targets)];
}

// 预检：确认 npx + skills CLI 可用。win32 下 npx 实为 npx.cmd，Node 不带 shell 直接 spawn 会 EINVAL，
// 所以全程 shell:true 让外壳解析扩展名；传命令串而非 args 数组（数组会触发 DEP0190 噪音警告）。
function ensureNpxSkills() {
  const r = spawnSync('npx skills --version', { stdio: 'ignore', shell: true });
  if (r.error || (r.status ?? 1) !== 0) {
    console.error("[X] 未找到可用的 'npx skills'（需要 Node 环境且能拉到 skills 包）。装好后重试。");
    process.exit(127);
  }
}

// 在 staging 目录跑官方安装（项目级 + --copy = 真实文件落在 staging/.agents/skills/，不污染任何真实 agent 目录）。
function stageSkills(staging) {
  const cmdline = `npx skills add "${SOURCE_REPO}" --skill ${SKILL_NAME} -a kimi-cli -y --copy`;
  const r = spawnSync(cmdline, { cwd: staging, stdio: 'inherit', shell: true });
  if (r.error) {
    console.error(`[X] 无法运行 npx（${r.error.code || r.error.message}）。`);
    process.exit(127);
  }
  if ((r.status ?? 1) !== 0) {
    console.error(`[X] 'npx skills add' 失败（退出码 ${r.status}，见上方输出）。`);
    process.exit(r.status || 1);
  }
  const staged = path.join(staging, '.agents', 'skills', SKILL_NAME);
  if (!existsSync(path.join(staged, 'SKILL.md'))) {
    console.error(`[X] staging 产物缺失：${path.join('.agents', 'skills', SKILL_NAME, 'SKILL.md')} 未生成（官方工具行为可能已变化）。`);
    process.exit(1);
  }
  return staged;
}

function main() {
  let plan;
  try {
    plan = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[X] ${e.message}\n`);
    console.error(HELP);
    process.exit(2);
  }
  if (plan.mode === 'help') {
    console.log(HELP);
    return;
  }
  const targets = resolveTargets(plan, { home: os.homedir(), cwd: process.cwd() });

  if (plan.mode === 'remove') {
    for (const target of targets) {
      const existed = existsSync(target);
      rmSync(target, { recursive: true, force: true });
      console.log(existed ? `✅ 已卸载：${target}` : `— 本就未安装（${target} 不存在），跳过。`);
    }
    return;
  }

  ensureNpxSkills();
  const staging = mkdtempSync(path.join(os.tmpdir(), 'dev-run-kimi-'));
  try {
    const staged = stageSkills(staging);
    for (const target of targets) {
      rmSync(target, { recursive: true, force: true }); // 覆盖式安装：先清旧版，避免残留已删除文件
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(staged, target, { recursive: true });
      console.log(`✅ 已装：${target}`);
    }
    console.log(`\n完成，共 ${targets.length} 个位置。新开 Kimi 会话生效。`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// 仅作为入口脚本运行时执行 main；被 import（测试）时不执行。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
