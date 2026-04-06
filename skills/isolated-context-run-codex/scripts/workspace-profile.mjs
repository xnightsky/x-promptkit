import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import YAML from "yaml";

import { validateWorkspaceProfile } from "./lib.mjs";

function copyIntoWorkspace(sourceRoot, fromPath, workspaceRoot, toPath) {
  const sourcePath = path.join(sourceRoot, fromPath);
  const destinationPath = path.join(workspaceRoot, toPath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

export function applyWorkspaceProfile({
  profile,
  sourceRoot,
  workspaceRoot,
  metaDir,
}) {
  const validatedProfile = validateWorkspaceProfile(profile);
  const initReport = [];

  for (const entry of validatedProfile.seed?.copy ?? []) {
    copyIntoWorkspace(sourceRoot, entry.from, workspaceRoot, entry.to);
  }

  for (const step of validatedProfile.init?.steps ?? []) {
    if (step.type === "mkdir") {
      fs.mkdirSync(path.join(workspaceRoot, step.path), { recursive: true });
      initReport.push({ type: step.type, path: step.path });
      continue;
    }

    if (step.type === "copy") {
      copyIntoWorkspace(sourceRoot, step.from, workspaceRoot, step.to);
      initReport.push({ type: step.type, from: step.from, to: step.to });
      continue;
    }

    if (step.type === "write_file" || step.type === "template_file") {
      const destinationPath = path.join(workspaceRoot, step.path);
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, step.content ?? "");
      initReport.push({ type: step.type, path: step.path });
      continue;
    }

    if (step.type === "run_local") {
      const spawnResult = spawnSync(step.command, step.args, {
        cwd: path.join(workspaceRoot, step.cwd ?? "."),
        encoding: "utf8",
        env: {
          ...process.env,
          ...Object.fromEntries(
            Object.entries(step.env ?? {}).map(([key, value]) => [key, String(value)]),
          ),
        },
      });

      if (spawnResult.status !== 0) {
        throw new Error(`run_local failed: ${spawnResult.stderr || spawnResult.stdout}`);
      }

      initReport.push({
        type: step.type,
        command: step.command,
        args: step.args,
        cwd: step.cwd ?? ".",
        env_keys: Object.keys(step.env ?? {}),
      });
    }
  }

  fs.writeFileSync(
    path.join(metaDir, "resolved-workspace-profile.yaml"),
    YAML.stringify(validatedProfile),
  );
  fs.writeFileSync(
    path.join(metaDir, "init-report.json"),
    `${JSON.stringify(initReport, null, 2)}\n`,
  );

  return {
    profile: validatedProfile,
    initReport,
  };
}
