#!/usr/bin/env node
// install-dev-plugin.mjs — 把 x-promptkit 的 dev 插件（/dev:pi）装进指定 repo 或全机。
// 背景：npx skills 只认 SKILL.md、不认斜杠命令，所以命令安装自带这条独立轨道，薄包装 `claude plugin`。
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const MARKETPLACE_NAME = 'x-promptkit-dev';
const PLUGIN_REF = `dev@${MARKETPLACE_NAME}`;
// 市场源 = 本脚本所在 repo 的 extensions/claude-code/dev（含 .claude-plugin/marketplace.json）。
// 用脚本自身位置解析，绝不写死机器绝对路径。
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MARKETPLACE_DIR = path.resolve(SCRIPT_DIR, '..', 'extensions', 'claude-code', 'dev');

const HELP = `install-dev-plugin — 安装/卸载 x-promptkit 的 dev 插件（/dev:pi）

用法:
  node scripts/install-dev-plugin.mjs                 装进当前 repo（--scope project）
  node scripts/install-dev-plugin.mjs --repo <path>   装进指定 repo（--scope project，以该 repo 为 cwd）
  node scripts/install-dev-plugin.mjs --global         全机安装（--scope user）
  node scripts/install-dev-plugin.mjs --remove [...]   卸载（可带 --global / --repo <path>）
  node scripts/install-dev-plugin.mjs --help

--repo 与 --global 互斥。`;

// 纯函数：argv -> 计划。无副作用，便于单测。
export function parseArgs(argv) {
  let mode = 'install';
  let global = false;
  let repo = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove') mode = 'remove';
    else if (a === '--global') global = true;
    else if (a === '--repo') {
      repo = argv[++i];
      if (repo == null || repo === '') throw new Error('--repo 需要一个路径参数');
    } else if (a === '--help' || a === '-h') {
      return { mode: 'help' };
    } else {
      throw new Error(`未知参数: ${a}`);
    }
  }
  if (global && repo != null) throw new Error('--global 与 --repo 互斥');
  return { mode, scope: global ? 'user' : 'project', repo };
}

// 预检：确认 claude CLI 可用。win32 下 claude 实为 claude.cmd，Node 不带 shell 直接 spawn 会 EINVAL，
// 所以全程 shell:true 让外壳解析扩展名（claude.cmd / claude）。
function ensureClaude() {
  // 传命令串而非 (cmd, argsArray)：shell:true 下传 args 数组会触发 DEP0190 噪音警告。
  const r = spawnSync('claude --version', { stdio: 'ignore', shell: true });
  if (r.error || (r.status ?? 1) !== 0) {
    console.error("[X] 未找到可用的 'claude' CLI（本机未安装 Claude Code 或不在 PATH）。装好后重试。");
    process.exit(127);
  }
}

// 跑一条 claude 子命令（shell:true 跨平台解析 claude/claude.cmd）。含空格的参数（如路径）加引号。
// strict=true：非零退出即报错中止（安装步骤用）。strict=false：容忍非零（卸载步骤用——
// 清理未完整安装的状态时，disable/uninstall 命中"未安装"返回非零是正常的）。
function runClaude(args, cwd, { strict = true } = {}) {
  // 始终双引号包裹每个参数：既挡空格，也挡 cmd.exe 元字符（& ( ) 等）在无空格路径里截断命令。
  // 命令名 claude 保持裸写，便于 Windows 经 PATHEXT 解析到 claude.cmd。
  const cmdline = 'claude ' + args.map((a) => `"${a}"`).join(' ');
  const r = spawnSync(cmdline, { cwd, stdio: 'inherit', shell: true });
  if (r.error) {
    console.error(`[X] 无法运行 claude（${r.error.code || r.error.message}）。`);
    process.exit(127);
  }
  const status = r.status ?? 0;
  if (strict && status !== 0) {
    console.error(`[X] 'claude ${args.join(' ')}' 失败（退出码 ${status}，见上方输出）。`);
    process.exit(status || 1);
  }
  return status;
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
  const { mode, scope, repo } = plan;
  const cwd = repo ? path.resolve(repo) : process.cwd();
  ensureClaude();
  if (mode === 'install') {
    runClaude(['plugin', 'marketplace', 'add', MARKETPLACE_DIR, '--scope', scope], cwd);
    runClaude(['plugin', 'install', PLUGIN_REF, '--scope', scope], cwd);
    console.log(`\n✅ dev 插件已装（scope=${scope}, cwd=${cwd}）。/dev:pi 生效需重启 CC 会话或 /reload-plugins。`);
  } else {
    // 先 disable 再 uninstall，最后摘市场，彻底清干净；非 TTY 下 uninstall 需 -y。
    // 这三步 best-effort：清理未完整安装的状态时命中"未安装"会返回非零，属正常。
    runClaude(['plugin', 'disable', PLUGIN_REF, '--scope', scope], cwd, { strict: false });
    runClaude(['plugin', 'uninstall', PLUGIN_REF, '--scope', scope, '-y'], cwd, { strict: false });
    runClaude(['plugin', 'marketplace', 'remove', MARKETPLACE_NAME, '--scope', scope], cwd, { strict: false });
    console.log(`\n✅ dev 插件卸载流程已执行（disable + uninstall + 摘市场，scope=${scope}）。本就未安装时部分步骤无操作。`);
  }
}

// 仅作为入口脚本运行时执行 main；被 import（测试）时不执行。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
