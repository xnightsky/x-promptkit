import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_MAX_TAIL_LINES = 3;

/**
 * 断言请求载荷是普通对象。
 *
 * @param {unknown} value - CLI 或测试传入的值。
 * @param {string} label - 用于错误消息的人类可读载荷名称。
 * @throws {Error} 当值不是非数组对象时抛出。
 */
function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

/**
 * 断言数字选项是正整数。
 *
 * @param {unknown} value - CLI 或测试传入的值。
 * @param {string} label - 用于错误消息的选项名。
 * @throws {Error} 当值不是大于零的整数时抛出。
 */
function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`\`${label}\` must be a positive integer`);
  }
}

/**
 * 对 `/proc/<pid>/fd/<n>` 返回的 Linux 文件描述符目标分类。
 *
 * @param {string} targetPath - 原始符号链接目标路径。
 * @returns {"pipe" | "socket" | "tty" | "file"} 尾部输出安全检查使用的目标类型。
 */
function detectFdTargetKind(targetPath) {
  if (targetPath.startsWith("pipe:[")) {
    return "pipe";
  }
  if (targetPath.startsWith("socket:[")) {
    return "socket";
  }
  if (targetPath.startsWith("/dev/pts/") || targetPath.startsWith("/dev/tty")) {
    return "tty";
  }
  return "file";
}

/**
 * 在 stat/read 前移除 Linux fd 符号链接目标中的已删除文件后缀。
 *
 * @param {string} targetPath - 原始符号链接目标路径。
 * @returns {string} 去掉末尾删除标记后的路径。
 */
function stripDeletedSuffix(targetPath) {
  return targetPath.endsWith(" (deleted)")
    ? targetPath.slice(0, -(" (deleted)".length))
    : targetPath;
}

/**
 * 将进程表文本解析为标准化进程行。
 *
 * @param {string} psText - POSIX `ps` 或 Windows PowerShell 兼容层输出的文本。
 * @returns {{ pid: number, ppid: number, etimes: number, comm: string, args: string, command: string }[]} 解析后的进程行。
 */
function parseProcessRows(psText) {
  return String(psText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        return null;
      }

      const [, pidText, ppidText, etimesText, comm, args] = match;
      return {
        pid: Number(pidText),
        ppid: Number(ppidText),
        etimes: Number(etimesText),
        comm,
        args,
        // 不同宿主暴露进程行的方式不同，因此同时匹配命令名和参数。
        command: `${comm} ${args}`,
      };
    })
    .filter(Boolean);
}

/**
 * 读取 parseProcessRows 期望的五列标准化进程表。
 *
 * @returns {string} 包含 pid、ppid、运行秒数、命令名和参数的进程表文本。
 */
function readProcessTable() {
  if (process.platform === "win32") {
    // 输出与 POSIX `ps` 相同的列顺序，保证解析逻辑可复用。
    return execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-CimInstance Win32_Process | ForEach-Object {
          $elapsed = [math]::Round(((Get-Date) - $_.CreationDate).TotalSeconds)
          $comm = if ($_.Name) { $_.Name } else { "unknown" }
          $cmd = if ($_.CommandLine) { $_.CommandLine } else { $comm }
          "$($_.ProcessId) $($_.ParentProcessId) $elapsed $comm $cmd"
        }`,
      ],
      {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );
  }
  return execFileSync("ps", ["-eo", "pid=,ppid=,etimes=,comm=,args="], {
    encoding: "utf8",
  });
}

/**
 * 查找命令行包含全部指定 token 的最新进程。
 *
 * @param {{ command_contains: string[], exclude_pid?: number | null }} request - 进程搜索请求。
 * @param {{ psText?: string }} [options] - 测试用进程表文本覆盖项。
 * @returns {{ ok: boolean, pid: number | null, ppid: number | null, etimes: number | null, command: string | null, reason: string | null }} 查找结果。
 */
export function discoverPidByCommand(request, options = {}) {
  assertObject(request, "discover pid request");
  if (!Array.isArray(request.command_contains) || request.command_contains.length === 0) {
    throw new Error("`command_contains` must be a non-empty array");
  }

  const commandContains = request.command_contains.map((token) => {
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new Error("`command_contains` entries must be non-empty strings");
    }
    return token.toLowerCase();
  });

  const excludePid = request.exclude_pid ?? null;
  if (excludePid !== null) {
    assertPositiveInteger(excludePid, "exclude_pid");
  }

  const rows = parseProcessRows(options.psText ?? readProcessTable());
  const matches = rows
    .filter((row) => {
      if (excludePid !== null && row.pid === excludePid) {
        return false;
      }

      const haystack = row.command.toLowerCase();
      return commandContains.every((token) => haystack.includes(token));
    })
    // 优先选择最近启动的匹配进程；`etimes` 是已运行秒数，越小越新。
    .sort((left, right) => left.etimes - right.etimes || right.pid - left.pid);

  if (matches.length === 0) {
    return {
      ok: false,
      pid: null,
      ppid: null,
      etimes: null,
      command: null,
      reason: "process_not_found",
    };
  }

  const selected = matches[0];
  return {
    ok: true,
    pid: selected.pid,
    ppid: selected.ppid,
    etimes: selected.etimes,
    command: selected.command,
    reason: null,
  };
}

/**
 * 检查单个进程文件描述符，并在安全时截取少量尾部输出。
 *
 * @param {number} pid - 目标进程 id。
 * @param {number} fd - 要检查的文件描述符编号。
 * @param {{ platform?: NodeJS.Platform, maxTailLines?: number, procRoot?: string, readlink?: (targetPath: string) => string }} [options] - 运行时与测试覆盖项。
 * @returns {{ pid: number, fd: number, canCapture: boolean, tailExcerpt: string, reason: string | null, targetKind: string, targetPath: string | null, explanation: string }} 检查结果。
 */
export function inspectPidFd(pid, fd, options = {}) {
  assertPositiveInteger(pid, "pid");
  assertPositiveInteger(fd, "fd");

  const platform = options.platform ?? process.platform;
  const maxTailLines = options.maxTailLines ?? DEFAULT_MAX_TAIL_LINES;

  if (platform !== "linux") {
    return {
      pid,
      fd,
      canCapture: false,
      tailExcerpt: "",
      reason: "platform_not_supported",
      targetKind: "unsupported",
      targetPath: null,
      explanation: "Only Linux `/proc/<pid>/fd/<n>` probing is supported.",
    };
  }

  const readlink = options.readlink ?? ((targetPath) => fs.readlinkSync(targetPath));
  let targetPath;
  try {
    targetPath = String(
      readlink(path.join(options.procRoot ?? "/proc", String(pid), "fd", String(fd))),
    );
  } catch (error) {
    return {
      pid,
      fd,
      canCapture: false,
      tailExcerpt: "",
      reason: "fd_target_unreadable",
      targetKind: "unknown",
      targetPath: null,
      explanation: `fd target could not be read: ${error.message}`,
    };
  }

  const targetKind = detectFdTargetKind(targetPath);
  if (targetKind !== "file") {
    return {
      pid,
      fd,
      canCapture: false,
      tailExcerpt: "",
      reason: "fd_target_not_seekable",
      targetKind,
      targetPath,
      explanation: "fd target is not a regular file, so historical tail capture is unsafe.",
    };
  }

  const resolvedPath = stripDeletedSuffix(targetPath);
  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      return {
        pid,
        fd,
        canCapture: false,
        tailExcerpt: "",
        reason: "fd_target_not_regular_file",
        targetKind,
        targetPath: resolvedPath,
        explanation: "fd target exists but is not a regular file.",
      };
    }

    const content = fs.readFileSync(resolvedPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
    return {
      pid,
      fd,
      canCapture: true,
      tailExcerpt: lines.slice(-maxTailLines).join("\n"),
      reason: null,
      targetKind,
      targetPath: resolvedPath,
      explanation: "fd target is a regular file, so tail capture is available.",
    };
  } catch (error) {
    return {
      pid,
      fd,
      canCapture: false,
      tailExcerpt: "",
      reason: "fd_target_unreadable",
      targetKind,
      targetPath: resolvedPath,
      explanation: `fd target could not be read: ${error.message}`,
    };
  }
}

/**
 * 返回进程 stdout 或 stderr 中第一个可用的尾部片段。
 *
 * @param {number} pid - 目标进程 id。
 * @param {{ inspectPidFdImpl?: typeof inspectPidFd, maxTailLines?: number }} [options] - 运行时与测试覆盖项。
 * @returns {{ ok: boolean, pid: number, stream: "stdout" | "stderr" | "none", tailExcerpt: string, reason: string | null, stdout: ReturnType<typeof inspectPidFd>, stderr: ReturnType<typeof inspectPidFd> }} 尾部输出查找结果。
 */
export function tailByPid(pid, options = {}) {
  assertPositiveInteger(pid, "pid");

  const inspectPidFdImpl = options.inspectPidFdImpl ?? inspectPidFd;
  const maxTailLines = options.maxTailLines ?? DEFAULT_MAX_TAIL_LINES;

  const stdout = inspectPidFdImpl(pid, 1, { maxTailLines });
  const stderr = inspectPidFdImpl(pid, 2, { maxTailLines });

  if (stdout.canCapture && stdout.tailExcerpt.length > 0) {
    return {
      ok: true,
      pid,
      stream: "stdout",
      tailExcerpt: stdout.tailExcerpt,
      reason: null,
      stdout,
      stderr,
    };
  }

  if (stderr.canCapture && stderr.tailExcerpt.length > 0) {
    return {
      ok: true,
      pid,
      stream: "stderr",
      tailExcerpt: stderr.tailExcerpt,
      reason: null,
      stdout,
      stderr,
    };
  }

  return {
    ok: false,
    pid,
    stream: "none",
    tailExcerpt: "",
    reason: stdout.reason ?? stderr.reason ?? "no_output_available",
    stdout,
    stderr,
  };
}
