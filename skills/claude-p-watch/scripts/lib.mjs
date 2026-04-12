import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEFAULT_MAX_TAIL_LINES = 3;

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`\`${label}\` must be a positive integer`);
  }
}

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

function stripDeletedSuffix(targetPath) {
  return targetPath.endsWith(" (deleted)")
    ? targetPath.slice(0, -(" (deleted)".length))
    : targetPath;
}

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
        // Match against both command name and args because different hosts
        // expose process rows differently.
        command: `${comm} ${args}`,
      };
    })
    .filter(Boolean);
}

function readProcessTable() {
  return execFileSync("ps", ["-eo", "pid=,ppid=,etimes=,comm=,args="], {
    encoding: "utf8",
  });
}

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
    // Prefer the most recently started matching process. `etimes` is elapsed
    // seconds, so smaller means newer.
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
