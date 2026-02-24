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
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeProject = analyzeProject;
const ts = __importStar(require("typescript"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
async function analyzeProject(directory, options = {}) {
    const report = { hallucinations: [], unused: [], usedModules: [] };
    // 1. Find all files in the project
    let files = await (0, glob_1.glob)('**/*.{ts,tsx,js,jsx}', {
        cwd: directory,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        absolute: true
    });
    if (options.changedOnly) {
        try {
            const { execSync } = require('child_process');
            // Get modified, deleted, and untracked files
            const gitDiff = execSync('git diff --name-only HEAD && git ls-files --others --exclude-standard', { cwd: directory, encoding: 'utf8' });
            const changedFiles = new Set(gitDiff.split('\n').map((f) => f.trim()).filter(Boolean).map((f) => path.resolve(directory, f)));
            files = files.filter(f => changedFiles.has(path.resolve(f)));
        }
        catch (err) {
            console.warn('⚠️ Could not determine git changed files. Falling back to scanning all files.');
        }
    }
    if (files.length === 0) {
        return report;
    }
    // 2. Create TypeScript Program
    const program = ts.createProgram(files, {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowJs: true,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
        skipLibCheck: true
    });
    const checker = program.getTypeChecker();
    const allUsedModules = new Set();
    // 3. Analyze each file
    for (const sourceFile of program.getSourceFiles()) {
        // Skip external library files (node_modules)
        if (sourceFile.fileName.includes('node_modules'))
            continue;
        // Also ensure we are only analyzing files we actually found (extra safety)
        const normalizedFilePath = path.resolve(sourceFile.fileName);
        const isProjectFile = files.some(f => path.resolve(f) === normalizedFilePath);
        if (!isProjectFile)
            continue;
        // Track imports to find unused ones
        // Map<Symbol, UnusedItem>
        const trackedImports = new Map();
        // Pass 1: Collect Imports & Check Hallucinations
        const visitPass1 = (node) => {
            if (ts.isImportDeclaration(node)) {
                visitImportDeclaration(node, sourceFile, checker, report, trackedImports, allUsedModules);
            }
            else if (ts.isCallExpression(node)) {
                visitCallExpression(node, sourceFile, checker, report, allUsedModules);
                ts.forEachChild(node, visitPass1);
            }
            else {
                ts.forEachChild(node, visitPass1);
            }
        };
        visitPass1(sourceFile);
        // Pass 2: Check Usage
        // We visit all nodes EXCEPT ImportDeclarations (which we already processed)
        // If we find an identifier that resolves to a symbol in 'trackedImports', delete it from the map.
        const visitUsage = (node) => {
            if (ts.isIdentifier(node)) {
                const symbol = checker.getSymbolAtLocation(node);
                if (symbol) {
                    // Check direct match
                    if (trackedImports.has(symbol)) {
                        trackedImports.delete(symbol);
                    }
                    else {
                        // Handle aliased symbols (e.g. import { a as b } ... b usage checks alias a)
                        // Actually, 'getSymbolAtLocation' on the usage 'b' returns the local symbol for 'b'.
                        // And that IS the key in our map.
                        // However, TypeScript sometimes handles equality strictly.
                        // What if it's a shorthand property? { b } -> uses b.
                        if (symbol.flags & ts.SymbolFlags.Alias) {
                            const aliased = checker.getAliasedSymbol(symbol);
                            if (aliased && trackedImports.has(aliased)) {
                                trackedImports.delete(aliased);
                            }
                        }
                    }
                }
            }
            // Recurse, but don't enter ImportDeclarations again
            if (!ts.isImportDeclaration(node)) {
                ts.forEachChild(node, visitUsage);
            }
        };
        ts.forEachChild(sourceFile, (node) => {
            if (!ts.isImportDeclaration(node)) {
                visitUsage(node);
            }
        });
        // Any remaining imports are unused
        trackedImports.forEach((unusedItem) => {
            report.unused.push(unusedItem);
        });
    }
    report.usedModules = Array.from(allUsedModules);
    return report;
}
function visitImportDeclaration(node, sourceFile, checker, report, trackedImports, allUsedModules) {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier))
        return;
    const moduleName = moduleSpecifier.text;
    allUsedModules.add(moduleName);
    // Resolve Module Symbol (Hallucination Check)
    const symbol = checker.getSymbolAtLocation(moduleSpecifier);
    if (!symbol) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        report.hallucinations.push({
            file: sourceFile.fileName,
            line: line + 1,
            start: node.getStart(),
            end: node.getEnd(),
            module: moduleName,
            member: '*' // Whole module missing
        });
        return; // Can't check usage if module missing
    }
    // Default Import
    if (node.importClause?.name) {
        const defaultImport = node.importClause.name;
        const defaultSymbol = checker.getSymbolAtLocation(defaultImport);
        // Check if module actually has a default export
        const moduleSymbol = checker.getSymbolAtLocation(moduleSpecifier);
        let hasDefaultExport = true;
        if (moduleSymbol && moduleSymbol.exports) {
            hasDefaultExport = moduleSymbol.exports.has(ts.escapeLeadingUnderscores('default'));
        }
        if (moduleSymbol && !hasDefaultExport) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(defaultImport.getStart());
            report.hallucinations.push({
                file: sourceFile.fileName,
                line: line + 1,
                start: defaultImport.getStart(),
                end: defaultImport.getEnd(),
                module: moduleName,
                member: node.importClause.isTypeOnly ? 'default (type)' : 'default'
            });
        }
        else if (defaultSymbol) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(defaultImport.getStart());
            trackedImports.set(defaultSymbol, {
                file: sourceFile.fileName,
                line: line + 1,
                start: defaultImport.getStart(),
                end: defaultImport.getEnd(),
                module: moduleName,
                member: node.importClause.isTypeOnly ? 'default (type)' : 'default'
            });
        }
    }
    // Namespace Import (* as name)
    if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
        const namespaceImport = node.importClause.namedBindings.name;
        const nsSymbol = checker.getSymbolAtLocation(namespaceImport);
        if (nsSymbol) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(namespaceImport.getStart());
            trackedImports.set(nsSymbol, {
                file: sourceFile.fileName,
                line: line + 1,
                start: namespaceImport.getStart(),
                end: namespaceImport.getEnd(),
                module: moduleName,
                member: '* as ' + namespaceImport.text
            });
        }
    }
    // Named Imports
    if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        node.importClause.namedBindings.elements.forEach(element => {
            const importName = element.propertyName?.text || element.name.text;
            const localName = element.name; // The identifier in the code
            const importSymbol = checker.getSymbolAtLocation(localName);
            const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart());
            if (importSymbol) {
                // Hallucination Check for Named Exports
                let aliasedSymbol;
                if (importSymbol.flags & ts.SymbolFlags.Alias) {
                    aliasedSymbol = checker.getAliasedSymbol(importSymbol);
                }
                if (aliasedSymbol) {
                    if (aliasedSymbol.escapedName === 'unknown' || !aliasedSymbol.declarations || aliasedSymbol.declarations.length === 0) {
                        report.hallucinations.push({
                            file: sourceFile.fileName,
                            line: line + 1,
                            start: element.getStart(),
                            end: element.getEnd(),
                            module: moduleName,
                            member: importName
                        });
                        return; // Don't track unused if it's a hallucination
                    }
                }
                // Add to tracked imports for usage check
                trackedImports.set(importSymbol, {
                    file: sourceFile.fileName,
                    line: line + 1,
                    start: element.getStart(),
                    end: element.getEnd(),
                    module: moduleName,
                    member: importName
                });
            }
            else {
                // Hallucination
                report.hallucinations.push({
                    file: sourceFile.fileName,
                    line: line + 1,
                    start: element.getStart(),
                    end: element.getEnd(),
                    module: moduleName,
                    member: (node.importClause?.isTypeOnly || element.isTypeOnly) ? `${importName} (type)` : importName
                });
            }
        });
    }
}
function visitCallExpression(node, sourceFile, checker, report, allUsedModules) {
    // Check for require('module')
    if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
            const moduleName = node.arguments[0].text;
            allUsedModules.add(moduleName);
            // Hallucination Check
            const symbol = checker.getSymbolAtLocation(node.arguments[0]);
            if (!symbol) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                report.hallucinations.push({
                    file: sourceFile.fileName,
                    line: line + 1,
                    start: node.getStart(),
                    end: node.getEnd(),
                    module: moduleName,
                    member: 'require()'
                });
            }
        }
    }
    // Check for import('module')
    else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
            const moduleName = node.arguments[0].text;
            allUsedModules.add(moduleName);
            // Hallucination Check
            const symbol = checker.getSymbolAtLocation(node.arguments[0]);
            if (!symbol) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                report.hallucinations.push({
                    file: sourceFile.fileName,
                    line: line + 1,
                    start: node.getStart(),
                    end: node.getEnd(),
                    module: moduleName,
                    member: 'import()'
                });
            }
        }
    }
}
