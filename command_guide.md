# Ghost Import Hunter: Command Guide

This guide covers all the powerful commands available in Ghost Import Hunter, covering the core v3 engine and the exciting new v4 DX features.

## v3 Core Modes

These represent the core functionality of Ghost Import Hunter for hunting down AI hallucinations and code bloat.

### 1. Default Check Mode
The standard run. It scans the provided directory (or current directory `.` by default) and prints out all unused imports and hallucinated exports.
**Command:** 
```bash
npx ghost-import-hunter .
```

### 2. Auto-Fix Mode (`--fix`)
Automatically deletes `import` statements that are marked as unused. It is smart enough to handle removing named imports specifically from a larger destructured import statement.
**Command:**
```bash
npx ghost-import-hunter . --fix
```

### 3. Interactive Mode (`--interactive`)
Goes through every hallucination and unused import one-by-one, asking you if you want to `[d]elete` or `[s]kip` it. Great for careful surgery on a legacy codebase.
**Command:**
```bash
npx ghost-import-hunter . --interactive
```

### 4. Dependency Prune Mode (`--prune`)
Deep scans your actual `package.json` against your *used* imports. If you have dependencies installed in `package.json` that are completely ignored by your code, it will offer to `npm uninstall` them for you.
**Command:**
```bash
npx ghost-import-hunter . --prune
```

### 5. Uninstall Mode (`--uninstall-self`)
A helper command to cleanly remove `ghost-import-hunter` globally from your system.
**Command:**
```bash
npx ghost-import-hunter --uninstall-self
```

---

## v4 Developer Experience (DX) Upgrades

The latest v4 introduces massive pipeline and workflow improvements, designed for enterprise monorepos and continuous integration.

### 1. Watch Mode (`--watch`)
Runs Ghost Import Hunter in a background daemon. Every time you hit save on a `.js` or `.ts` file, it instantly re-scans the project. Perfect for having open on a second monitor while editing AI-generated code.
**Command:**
```bash
npx ghost-import-hunter . --watch
```

### 2. Git Diff Mode (`--changed`)
For gigantic enterprise codebases where a full scan takes minutes, this mode plugs into Git. It will *only* scan the files that have been modified or added in your current uncommitted Git diff. It's lighting fast.
**Command:**
```bash
npx ghost-import-hunter . --changed
```

### 3. CI/CD Report Generation (`--output`)
Instead of visually printing the output to the terminal, this will dump the raw AST analysis into a JSON file, or an HTML report that can be plugged right into a GitHub Actions artifact pipeline.
**Command:**
```bash
npx ghost-import-hunter . --output report.json
# or
npx ghost-import-hunter . --output report.html
```

---
*Note: You can combine flags! For example, `npx ghost-import-hunter . --changed --watch` will continually watch your current uncommitted git changes.*
