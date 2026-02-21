#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ts = __importStar(require("typescript"));
const readline = __importStar(require("readline"));
const analyzer_1 = require("./analyzer");
const program = new commander_1.Command();
program
    .name('ghost-import-hunter')
    .description('A deterministic tool to find AI hallucinations and unused code')
    .version('3.0.0')
    .argument('[directory]', 'Directory to scan', '.')
    .option('--fix', 'Automatically fix unused imports')
    .option('--interactive', 'Interactively fix unused imports and hallucinations')
    .option('--prune', 'Uninstall completely unused dependencies from package.json')
    .option('--uninstall-self', 'Uninstall ghost-import-hunter globally from your system')
    .action(async (directory, options) => {
    if (options.uninstallSelf) {
        console.log(chalk_1.default.red('\n⚠️ WARNING: This will completely remove ghost-import-hunter from your system.'));
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const answer = await new Promise(resolve => {
            rl.question(chalk_1.default.yellow(`❓ Are you sure you want to uninstall ghost-import-hunter? (y/N) `), resolve);
        });
        rl.close();
        if (answer.toLowerCase() === 'y') {
            console.log(chalk_1.default.blue('\n🗑️ Uninstalling ghost-import-hunter...'));
            try {
                const { execSync } = require('child_process');
                execSync('npm uninstall -g ghost-import-hunter', { stdio: 'inherit' });
                console.log(chalk_1.default.green('✨ Successfully uninstalled ghost-import-hunter. Goodbye! 👋'));
            }
            catch (err) {
                console.error(chalk_1.default.red('❌ Failed to uninstall:'), err);
            }
        }
        else {
            console.log(chalk_1.default.green('ℹ️ Uninstall cancelled. Thank you for keeping me around! 👻'));
        }
        return;
    }
    console.log(chalk_1.default.blue(`👻 Ghost Import Hunter scanning: ${directory}...`));
    try {
        // New v2 Engine using TS Compiler API
        const report = await (0, analyzer_1.analyzeProject)(directory);
        let hasError = false;
        if (report.hallucinations.length > 0) {
            console.log(chalk_1.default.red('\n🚨 Hallucinations Detected (AI Lied!):'));
            report.hallucinations.forEach(h => {
                console.log(`  - ${chalk_1.default.bold(h.module)}: Used member ${chalk_1.default.bold(h.member)} does not exist.`);
                console.log(`    File: ${h.file}:${h.line}`);
            });
            hasError = true;
        }
        else {
            console.log(chalk_1.default.green('\n✅ No Hallucinations detected.'));
        }
        if (report.unused.length > 0) {
            console.log(chalk_1.default.yellow('\n⚠️  Unused Imports (Bloat):'));
            report.unused.forEach(u => {
                console.log(`  - ${chalk_1.default.bold(u.module)}: Imported but never used.`);
                console.log(`    File: ${u.file}:${u.line}`);
            });
        }
        if (options.interactive) {
            const fixes = [];
            const allIssues = [...report.hallucinations, ...report.unused];
            if (allIssues.length === 0) {
                console.log(chalk_1.default.green('\n✨ No issues to fix!'));
                return;
            }
            console.log(chalk_1.default.blue(`\n🕵️ Interactive Mode: Found ${allIssues.length} issues.`));
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            for (const issue of allIssues) {
                const isHallucination = 'member' in issue && report.hallucinations.includes(issue);
                const type = isHallucination ? chalk_1.default.red('Hallucination') : chalk_1.default.yellow('Unused');
                console.log(chalk_1.default.gray('--------------------------------------------------'));
                console.log(`${type}: ${chalk_1.default.bold(issue.module)} (${issue.member})`);
                console.log(`  File: ${issue.file}:${issue.line}`);
                const answer = await new Promise(resolve => {
                    rl.question(chalk_1.default.cyan('  Action? [d]elete, [s]kip (default: skip): '), resolve);
                });
                if (answer.toLowerCase() === 'd') {
                    fixes.push(issue);
                    console.log(chalk_1.default.green('  -> Marked for deletion.'));
                }
                else {
                    console.log(chalk_1.default.gray('  -> Skipped.'));
                }
            }
            rl.close();
            if (fixes.length > 0) {
                console.log(chalk_1.default.blue(`\n🔧 Applying ${fixes.length} fixes...`));
                await fixImports(fixes);
                console.log(chalk_1.default.green('✨ Fixes applied!'));
            }
            else {
                console.log(chalk_1.default.yellow('\nℹ️ No changes made.'));
            }
            // Skip the batch block below if we ran interactive
            return;
        }
        if (options.fix && report.unused.length > 0) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            const answer = await new Promise(resolve => {
                rl.question(chalk_1.default.yellow(`\n❓ Found ${report.unused.length} unused imports. Do you want to fix them? (y/N) `), resolve);
            });
            rl.close();
            if (answer.toLowerCase() === 'y') {
                console.log(chalk_1.default.blue('\n🔧 Fixing unused imports...'));
                await fixImports(report.unused);
                console.log(chalk_1.default.green('✨ Auto-fix complete!'));
            }
            else {
                console.log(chalk_1.default.yellow('ℹ️ Auto-fix cancelled.'));
            }
        }
        if (options.prune) {
            const packageJsonPath = path.join(directory, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                console.log(chalk_1.default.blue('\n🔍 Checking for completely unused dependencies...'));
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const deps = Object.keys(pkg.dependencies || {});
                // Filter out types and our own tool just in case
                const projectDeps = deps.filter(d => !d.startsWith('@types/') && d !== 'ghost-import-hunter');
                const toRemove = projectDeps.filter(dep => !report.usedModules.includes(dep));
                if (toRemove.length > 0) {
                    console.log(chalk_1.default.yellow(`\n🗑️ Found ${toRemove.length} unused dependencies:`));
                    toRemove.forEach(d => console.log(`  - ${chalk_1.default.bold(d)}`));
                    const rl = readline.createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    const answer = await new Promise(resolve => {
                        rl.question(chalk_1.default.red(`\n❓ Are you sure you want to uninstall these packages? (y/N) `), resolve);
                    });
                    rl.close();
                    if (answer.toLowerCase() === 'y') {
                        console.log(chalk_1.default.blue(`\n📦 Uninstalling ${toRemove.join(', ')}...`));
                        try {
                            const { execSync } = require('child_process');
                            execSync(`npm uninstall ${toRemove.join(' ')}`, { stdio: 'inherit', cwd: directory });
                            console.log(chalk_1.default.green('✨ Pruning complete!'));
                        }
                        catch (err) {
                            console.error(chalk_1.default.red('❌ Failed to uninstall packages:'), err);
                        }
                    }
                    else {
                        console.log(chalk_1.default.yellow('ℹ️ Pruning cancelled.'));
                    }
                }
                else {
                    console.log(chalk_1.default.green('\n✨ No unused dependencies found in package.json!'));
                }
            }
            else {
                console.log(chalk_1.default.yellow('\n⚠️ No package.json found in the specified directory. Cannot prune dependencies.'));
            }
        }
        if (hasError) {
            process.exit(1);
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('Error scanning project:'), error);
        process.exit(1);
    }
});
async function fixImports(unused) {
    // Group by file
    const fileMap = new Map();
    unused.forEach(u => {
        if (!fileMap.has(u.file))
            fileMap.set(u.file, []);
        fileMap.get(u.file).push(u);
    });
    for (const [file, items] of fileMap) {
        if (!fs.existsSync(file))
            continue;
        const content = fs.readFileSync(file, 'utf-8');
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const replacements = [];
        // Helper: Check usage
        // usage is defined by matching line and member
        // items contains the UNUSED ones.
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                const lineNum = line + 1;
                const moduleName = node.moduleSpecifier.text;
                // Find unused items for this import declaration
                // (Note: duplicate logic with analyzer?) a bit, but we are fixing now.
                // We assume strict line match is safe enough.
                const unusedItems = items.filter(u => u.line === lineNum && u.module === moduleName);
                if (unusedItems.length === 0)
                    return;
                // Determine what to remove
                let shouldRemoveWhole = false;
                const importClause = node.importClause;
                if (!importClause) {
                    // Import "mod"; -> side effect.
                    // If analyzer reported it as unused, it means it's unused. (Wait, analyzer skips side effects? No, visitImportDeclaration checks string literal.)
                    // But our Unused logic tracks SYMBOLS. Side effect imports usually don't introduce symbols.
                    // If analyzer reported it, we should remove it.
                    // Check if member is '*'?
                    if (unusedItems.some(u => u.member === '*')) {
                        shouldRemoveWhole = true;
                    }
                }
                else {
                    // Check Default
                    let removeDefault = false;
                    if (importClause.name) {
                        // Check if default is unused
                        if (unusedItems.some(u => u.member === 'default')) {
                            removeDefault = true;
                        }
                    }
                    // Check Namespace
                    let removeNamespace = false;
                    if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
                        const txt = '* as ' + importClause.namedBindings.name.text;
                        if (unusedItems.some(u => u.member === txt)) {
                            removeNamespace = true;
                        }
                    }
                    // Check Named
                    let newNamedElements = [];
                    let hasNamed = false;
                    if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
                        hasNamed = true;
                        importClause.namedBindings.elements.forEach(el => {
                            const name = el.propertyName?.text || el.name.text;
                            // Is this specific named import unused?
                            const isUnused = unusedItems.some(u => u.member === name);
                            if (!isUnused) {
                                newNamedElements.push(el);
                            }
                        });
                    }
                    // Decision Logic
                    const keptDefault = importClause.name && !removeDefault;
                    const keptNamespace = importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings) && !removeNamespace;
                    const keptNamed = hasNamed && newNamedElements.length > 0;
                    // If nothing kept, remove whole
                    if (!keptDefault && !keptNamespace && !keptNamed) {
                        shouldRemoveWhole = true;
                    }
                    else {
                        // Reconstruct Import
                        // We use ts.factory to create a new node
                        // But we need to handle "Default, Named" vs "Default" vs "Named"
                        const newImportClause = ts.factory.updateImportClause(importClause, importClause.isTypeOnly, keptDefault ? importClause.name : undefined, keptNamespace
                            ? importClause.namedBindings
                            // Mixed default + named?
                            : (keptNamed
                                ? ts.factory.createNamedImports(newNamedElements)
                                : undefined));
                        // Create new declaration
                        const newDecl = ts.factory.updateImportDeclaration(node, node.modifiers, newImportClause, node.moduleSpecifier, node.assertClause);
                        // Print
                        const printer = ts.createPrinter();
                        const newText = printer.printNode(ts.EmitHint.Unspecified, newDecl, sourceFile);
                        replacements.push({
                            start: node.getStart(),
                            end: node.getEnd(),
                            text: newText
                        });
                        return; // Done with this node
                    }
                }
                if (shouldRemoveWhole) {
                    // Remove the whole line(s) to avoid empty gaps
                    // node.getFullStart() includes previous newlines?
                    // Safe approach: remove node.getStart() to node.getEnd(), then cleanup empty lines later or just leave usage of prettier to user?
                    // "getFullStart" keeps leading trivia.
                    replacements.push({
                        start: node.getFullStart(),
                        end: node.getEnd(),
                        text: '' // Delete
                    });
                }
            }
        });
        // Apply replacements from bottom to top
        replacements.sort((a, b) => b.start - a.start);
        let newContent = content;
        for (const r of replacements) {
            newContent = newContent.substring(0, r.start) + r.text + newContent.substring(r.end);
        }
        fs.writeFileSync(file, newContent);
    }
}
program.parse();
