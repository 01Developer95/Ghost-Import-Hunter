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
async function analyzeProject(directory) {
    const report = { hallucinations: [], unused: [] };
    // 1. Find all files in the project
    const files = await (0, glob_1.glob)('**/*.{ts,tsx,js,jsx}', {
        cwd: directory,
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        absolute: true
    });
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
    // 3. Analyze each file
    for (const sourceFile of program.getSourceFiles()) {
        // Skip external library files (node_modules)
        if (sourceFile.fileName.includes('node_modules'))
            continue;
        // Also ensure we are only analyzing files we actually found (extra safety)
        // Normalize paths for comparison
        const normalizedFilePath = path.resolve(sourceFile.fileName);
        const isProjectFile = files.some(f => path.resolve(f) === normalizedFilePath);
        if (!isProjectFile)
            continue;
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                visitImportDeclaration(node, sourceFile, checker, report);
            }
        });
    }
    return report;
}
function visitImportDeclaration(node, sourceFile, checker, report) {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier))
        return;
    const moduleName = moduleSpecifier.text;
    // Resolve Module Symbol
    const symbol = checker.getSymbolAtLocation(moduleSpecifier);
    if (!symbol) {
        // Module not found at all
        // Get line number
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        report.hallucinations.push({
            file: sourceFile.fileName,
            line: line + 1,
            module: moduleName,
            member: '*' // Whole module missing
        });
        return;
    }
    // Check Named Imports
    if (node.importClause && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        node.importClause.namedBindings.elements.forEach(element => {
            const importName = element.propertyName?.text || element.name.text;
            const importSymbol = checker.getSymbolAtLocation(element.name);
            const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart());
            if (importSymbol) {
                const aliasedSymbol = checker.getAliasedSymbol(importSymbol);
                if (aliasedSymbol) {
                    // Check for "unknown" symbol or missing declarations which indicates a hallucination
                    if (aliasedSymbol.escapedName === 'unknown' || !aliasedSymbol.declarations || aliasedSymbol.declarations.length === 0) {
                        report.hallucinations.push({
                            file: sourceFile.fileName,
                            line: line + 1,
                            module: moduleName,
                            member: importName
                        });
                    }
                }
                else {
                    // If no aliased symbol, it might be a direct interface/type or something we couldn't resolve deeply
                    // For now, if we have a symbol, we assume it exists to avoid false positives unless we are sure.
                    // But in our prototype `ghost` gave a symbol that resolved to `unknown`.
                    // If `getAliasedSymbol` throws or returns undefined, it might be a local symbol.
                    // Double check with module exports if possible
                    // const moduleExports = checker.getExportsOfModule(symbol);
                    // if (!moduleExports.some(e => e.name === importName)) {
                    //      // Potential hallucination or just a type?
                    // }
                }
            }
            else {
                // No symbol found at location - definitely a hallucination
                report.hallucinations.push({
                    file: sourceFile.fileName,
                    line: line + 1,
                    module: moduleName,
                    member: importName
                });
            }
        });
    }
}
