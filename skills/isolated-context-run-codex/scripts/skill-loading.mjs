import fs from "node:fs";
import path from "node:path";

import { resolveSkillViewEntries } from "./lib.mjs";

const PRIMARY_SKILL_FILE = "SKILL.md";
const FALLBACK_SKILL_FILE = "SKILLS.fallback.md";

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function statIfExists(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function selectSkillEntry(sourcePath) {
  for (const fileName of [PRIMARY_SKILL_FILE, FALLBACK_SKILL_FILE]) {
    const candidatePath = path.join(sourcePath, fileName);
    const stats = statIfExists(candidatePath);
    if (stats?.isFile()) {
      return { fileName };
    }
  }

  throw new Error(
    `missing ${PRIMARY_SKILL_FILE} for skill source: \`${sourcePath}\` (accepted fallback: \`${FALLBACK_SKILL_FILE}\`)`,
  );
}

function inspectSkillArtifacts(sourcePath) {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`invalid skill source: \`${sourcePath}\``);
  }
  const skillEntry = selectSkillEntry(sourcePath);

  return {
    skillMd: true,
    sourceSkillMd: skillEntry.fileName,
    openaiYaml: fs.existsSync(path.join(sourcePath, "agents", "openai.yaml")),
  };
}

function materializeSkillDirectory({ sourcePath, targetPath, sourceSkillMd }) {
  if (sourceSkillMd === PRIMARY_SKILL_FILE) {
    fs.symlinkSync(sourcePath, targetPath, process.platform === "win32" ? "junction" : "dir");
    return process.platform === "win32" ? "directory_junction" : "directory_symlink";
  }

  fs.cpSync(sourcePath, targetPath, { recursive: true });
  // Legacy fallback bundles keep their original file for auditability, but the
  // mounted skill view must still expose a canonical SKILL.md for host loading.
  fs.copyFileSync(path.join(sourcePath, sourceSkillMd), path.join(targetPath, PRIMARY_SKILL_FILE));
  return "directory_copy";
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
  const resolvedSkills = [];

  for (const entry of resolvedEntries) {
    const artifacts = inspectSkillArtifacts(entry.sourcePath);
    const linkPath = path.join(targetRoot, entry.skillName);
    fs.rmSync(linkPath, { recursive: true, force: true });
    const linkMode = materializeSkillDirectory({
      sourcePath: entry.sourcePath,
      targetPath: linkPath,
      sourceSkillMd: artifacts.sourceSkillMd,
    });
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
        source_skill_md: artifacts.sourceSkillMd,
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
