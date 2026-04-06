export function normalizeProcessSpawnFailure(error) {
  if (error?.code === "ENOENT") {
    return {
      kind: "unavailable",
      reason: "codex_command_missing",
    };
  }

  return {
    kind: "environment_failure",
    reason: "process_spawn_failed",
  };
}
