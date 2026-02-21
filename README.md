<div align="center">
  <img src="https://raw.githubusercontent.com/01Developer95/Ghost-Import-Hunter/main/media/header.png" alt="Ghost Hunter" width="100%">
</div>

<div align="center">

![Ghost Hunter](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)

</div>

---

## 🚀 Features

- **Deterministic Validation** - Verify every import against your actual installed modules. No guessing or regex.
- **Deep Export Analysis** - Uses TypeScript Compiler API to correctly resolve `export *`, re-exports, and aliases.
- **Local File Scanning** - Validates imports from your own local files, not just external packages.
- **Zero Configuration** - Works out of the box. Just run `npx ghost-hunter` in your project root.
- **CI/CD Ready** - Fails the build if hallucinations are detected. Preventing bad code from merging.

---

## 🤔 What is a Hallucination?

AI coding assistants often suggest imports that **look real but don't exist**. Ghost Hunter catches these bugs before they break your app.

### Examples of what Ghost Hunter catches:

**1. The "Fake Function" Hallucination**
```typescript
import { nonexistent } from 'fs'; 
// ❌ Error: 'fs' exists, but it has no export named 'nonexistent'.
```

**2. The "Wrong Library" Hallucination**
```typescript
import { notARealColor } from 'chalk'; 
// ❌ Error: 'chalk' exists, but 'notARealColor' is not a valid color.
```

**3. The "Ghost Dependency" Hallucination**
```typescript
import { utils } from 'dependency-i-never-installed'; 
// ❌ Error: Module 'dependency-i-never-installed' is not in node_modules.
```

---

## 🧠 How it Works (Under the Hood)

Ghost Hunter uses three core technologies to ensure your code is safe:

### 1. `glob` - The Scanner
**Role:** Finding your files.
Just like your terminal finds files when you type `ls *.ts`, Ghost Hunter uses `glob` to scan your entire project's TypeScript and JavaScript files, ignoring junk like `node_modules`.

### 2. TypeScript Compiler API - The Brain
**Role:** Understanding your code.
Unlike v1 which used Regex, v2.0 uses the real **TypeScript Compiler API** to parse your code, resolve symbols, and track exports across files. This allows it to:
- Follow `export * from ...` chains.
- Understand aliased imports (`import { foo as bar }`).
- Detect missing exports in local files.

### 3. `chalk` - The Reporter
**Role:** Making sense of the output.
When a hallucination is found, Ghost Hunter uses `chalk` to highlight the error in **red** and the file path in **bold**, making it impossible to miss critical bugs in your terminal.

---

## 📦 Installation

### npx (Recommended)
```bash
npx ghost-import-hunter .
```

### Global Install
```bash
npm install -g ghost-import-hunter
```

---

## 🛠️ Usage

### Basic Usage
```bash
# Scan current directory
npx ghost-import-hunter .

# Scan specific directory
npx ghost-import-hunter ./src/components
```

### CI/CD Integration
Add to your GitHub Actions or GitLab CI:
```yaml
- name: Detect Hallucinations
  run: npx ghost-import-hunter .
```

### Command Line Options

```text
Usage: ghost-import-hunter [options] [directory]

A deterministic tool to find AI hallucinations and unused code

Arguments:
  directory      Directory to scan (default: ".")

Options:
  -V, --version  output the version number
  --fix          Automatically fix unused imports
  --interactive  Interactively fix unused imports and hallucinations
  -h, --help     display help for command
```

---

## ⚙️ Configuration

Ghost Hunter supports a `.ghostrc` file:

```json
{
  "exclude": ["dist", "coverage", "**/*.test.ts"],
  "rules": {
    "no-unused": "error",
    "hallucination": "error"
  }
}
```

---



---

## 👨‍💻 Development

If you want to contribute or modify the tool, here are the commands you need:

1. **Build the Project**
   ```bash
   npm run build
   ```
   - **What it does:** Compiles TypeScript (`src/index.ts`) into JavaScript (`dist/index.js`).
   - **Why:** Node.js cannot run TypeScript directly.
   - **When:** Run this after every code change.

2. **Test Locally**
   ```bash
   # Run against the 'fixtures' folder to see it catch errors
   node dist/index.js fixtures
   ```
   - **What it does:** Runs the compiled tool on a test folder.
3. **Stop Testing (Unlink)**
   When you're done testing locally and want to clean up:
   ```bash
   # Remove the global link
   npm uninstall -g ghost-import-hunter
   ```
   - **What it does:** Removes the `ghost-import-hunter` command from your system.


---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📧 Contact

- GitHub: [@01Developer95](https://github.com/01Developer95)
- Repository: [Ghost-Import-Hunter](https://github.com/01Developer95/Ghost-Import-Hunter)

---

**Built with ❤️ to make AI-assisted coding safer.**
