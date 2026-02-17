#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const analyzer_1 = require("./analyzer");
const program = new commander_1.Command();
program
    .name('ghost-hunter')
    .description('A deterministic tool to find AI hallucinations and unused code')
    .version('1.0.0')
    .argument('[directory]', 'Directory to scan', '.')
    .action(async (directory) => {
    console.log(chalk_1.default.blue(`👻 Ghost Hunter scanning: ${directory}...`));
    try {
        // New v2 Engine using TS Compiler API
        const report = await (0, analyzer_1.analyzeProject)(directory);
        if (report.hallucinations.length > 0) {
            console.log(chalk_1.default.red('\n🚨 Hallucinations Detected (AI Lied!):'));
            report.hallucinations.forEach(h => {
                console.log(`  - ${chalk_1.default.bold(h.module)}: Used member ${chalk_1.default.bold(h.member)} does not exist.`);
                console.log(`    File: ${h.file}:${h.line}`);
            });
            process.exit(1); // Fail the build
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
    }
    catch (error) {
        console.error(chalk_1.default.red('Error scanning project:'), error);
        process.exit(1);
    }
});
program.parse();
