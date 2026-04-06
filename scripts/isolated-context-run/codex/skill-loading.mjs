import fs from "node:fs";
import path from "node:path";

import { resolveSkillViewEntries } from "./lib.mjs";

export function materializeResolvedSkillView({ targetRoot, entries }) {
  const resolvedEntries = resolveSkillViewEntries(entries);
  fs.mkdirSync(targetRoot, { recursive: true });

  for (const entry of resolvedEntries) {
    const linkPath = path.join(targetRoot, entry.skillName);
    fs.rmSync(linkPath, { recursive: true, force: true });
    // Windows can create directory junctions without elevated symlink rights.
    fs.symlinkSync(entry.sourcePath, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  return {
    targetRoot,
    resolvedEntries,
  };
}
