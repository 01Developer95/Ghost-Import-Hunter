
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';

export interface Hallucination {
    file: string;
    line: number;
    module: string;
    member: string;
}

export interface Unused {
    file: string;
    line: number;
    module: string;
}

export interface AnalysisReport {
    hallucinations: Hallucination[];
    unused: Unused[];
}

export async function analyzeProject(directory: string): Promise<AnalysisReport> {
    const report: AnalysisReport = { hallucinations: [], unused: [] };

    // 1. Find all files in the project
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
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
        if (sourceFile.fileName.includes('node_modules')) continue;

        // Also ensure we are only analyzing files we actually found (extra safety)
        // Normalize paths for comparison
        const normalizedFilePath = path.resolve(sourceFile.fileName);
        const isProjectFile = files.some(f => path.resolve(f) === normalizedFilePath);

        if (!isProjectFile) continue;

        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                visitImportDeclaration(node, sourceFile, checker, report);
            }
        });
    }

    return report;
}

function visitImportDeclaration(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    report: AnalysisReport
) {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) return;

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
                } else {
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
            } else {
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
