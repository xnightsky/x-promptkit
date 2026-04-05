import fs from "node:fs";
import path from "node:path";

import { resolveSkillViewEntries } from "./lib.mjs";

export function materializeResolvedSkillView({ targetRoot, entries }) {
  const resolvedEntries = resolveSkillViewEntries(entries);
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of resolvedEntries) {
    const linkPath = path.join(targetRoot, entry.skillName);
    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.symlinkSync(entry.sourcePath, linkPath, "dir");
  }

  return {
    targetRoot,
    resolvedEntries,
  };
}
