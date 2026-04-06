import fs from "node:fs";
import path from "node:path";

import { resolveSkillViewEntries } from "./lib.mjs";

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function inspectSkillArtifacts(sourcePath) {
  const skillMdPath = path.join(sourcePath, "SKILL.md");
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`invalid skill source: \`${sourcePath}\``);
  }
  if (!fs.existsSync(skillMdPath) || !fs.statSync(skillMdPath).isFile()) {
    throw new Error(`missing SKILL.md for skill source: \`${sourcePath}\``);
  }

  return {
    skillMd: true,
    openaiYaml: fs.existsSync(path.join(sourcePath, "agents", "openai.yaml")),
  };
}

function buildExcludedSkills(entries, resolvedEntries) {
  const winners = new Map(
    resolvedEntries.map((entry) => [`${entry.skillName}::${entry.sourceClass}::${entry.sourcePath}`, entry]),
  );

  return entries
    .filter((entry) => !winners.has(`${entry.skillName}::${entry.sourceClass}::${entry.sourcePath}`))
    .map((entry) => ({
      id: entry.skillName,
      source_class: entry.sourceClass,
      source_ref: entry.sourcePath,
      reason: "shadowed_by_higher_precedence",
    }));
}

export function materializeResolvedSkillView({ targetRoot, entries, targetRootRel = ".agents/skills" }) {
  const resolvedEntries = resolveSkillViewEntries(entries);
  fs.mkdirSync(targetRoot, { recursive: true });
  const linkMode = process.platform === "win32" ? "directory_junction" : "directory_symlink";
  const resolvedSkills = [];

  for (const entry of resolvedEntries) {
    const artifacts = inspectSkillArtifacts(entry.sourcePath);
    const linkPath = path.join(targetRoot, entry.skillName);
    fs.rmSync(linkPath, { recursive: true, force: true });
    // Windows can create directory junctions without elevated symlink rights.
    fs.symlinkSync(entry.sourcePath, linkPath, process.platform === "win32" ? "junction" : "dir");
    resolvedSkills.push({
      id: entry.skillName,
      source_class: entry.sourceClass,
      source_ref: entry.sourcePath,
      mount_relpath: normalizeRelativePath(path.posix.join(targetRootRel, entry.skillName)),
      link_copy: {
        mode: linkMode,
      },
      artifacts: {
        skill_md: artifacts.skillMd,
        openai_yaml: artifacts.openaiYaml,
      },
    });
  }

  return {
    targetRoot,
    resolvedEntries,
    resolvedSkillView: {
      root: normalizeRelativePath(targetRootRel),
      skills: resolvedSkills,
    },
    excludedSkills: buildExcludedSkills(entries, resolvedEntries),
  };
}
