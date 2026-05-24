# PUA Extension (moved)

This extension has been migrated to a standalone repository:

**https://github.com/xnightsky/pi-pua-x**

## Install

```bash
git clone https://github.com/xnightsky/pi-pua-x.git
cd pi-pua-x
mkdir -p ~/.pi/agent/extensions/pua
cp -R ./* ~/.pi/agent/extensions/pua/
```

## Why moved?

- Independent release cycle (not tied to x-promptkit versioning)
- Clearer ownership boundary vs. official `@tanweai/pi-pua`
- Easier for others to install without pulling the entire x-promptkit repo
