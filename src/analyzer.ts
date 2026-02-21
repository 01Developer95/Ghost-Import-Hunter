
import * as ts from 'typescript';
import * as path from 'path';
import { glob } from 'glob';

export interface Hallucination {
    file: string;
    line: number;
    start: number;
    end: number;
    module: string;
    member: string;
}

export interface Unused {
    file: string;
    line: number;
    start: number;
    end: number;
    module: string;
    member: string;
}

export interface AnalysisReport {
    hallucinations: Hallucination[];
    unused: Unused[];
    usedModules: string[];
}

export async function analyzeProject(directory: string): Promise<AnalysisReport> {
    const report: AnalysisReport = { hallucinations: [], unused: [], usedModules: [] };

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
    const allUsedModules = new Set<string>();

    // 3. Analyze each file
    for (const sourceFile of program.getSourceFiles()) {
        // Skip external library files (node_modules)
        if (sourceFile.fileName.includes('node_modules')) continue;

        // Also ensure we are only analyzing files we actually found (extra safety)
        const normalizedFilePath = path.resolve(sourceFile.fileName);
        const isProjectFile = files.some(f => path.resolve(f) === normalizedFilePath);

        if (!isProjectFile) continue;

        // Track imports to find unused ones
        // Map<Symbol, UnusedItem>
        const trackedImports = new Map<ts.Symbol, Unused>();

        // Pass 1: Collect Imports & Check Hallucinations
        ts.forEachChild(sourceFile, (node) => {
            if (ts.isImportDeclaration(node)) {
                visitImportDeclaration(node, sourceFile, checker, report, trackedImports, allUsedModules);
            }
        });

        // Pass 2: Check Usage
        // We visit all nodes EXCEPT ImportDeclarations (which we already processed)
        // If we find an identifier that resolves to a symbol in 'trackedImports', delete it from the map.
        const visitUsage = (node: ts.Node) => {
            if (ts.isIdentifier(node)) {
                const symbol = checker.getSymbolAtLocation(node);
                if (symbol) {
                    // Check direct match
                    if (trackedImports.has(symbol)) {
                        trackedImports.delete(symbol);
                    } else {
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

function visitImportDeclaration(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    report: AnalysisReport,
    trackedImports: Map<ts.Symbol, Unused>,
    allUsedModules: Set<string>
) {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) return;

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
        if (defaultSymbol) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(defaultImport.getStart());
            trackedImports.set(defaultSymbol, {
                file: sourceFile.fileName,
                line: line + 1,
                start: defaultImport.getStart(),
                end: defaultImport.getEnd(),
                module: moduleName,
                member: 'default'
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
                let aliasedSymbol: ts.Symbol | undefined;
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
            } else {
                // Hallucination
                report.hallucinations.push({
                    file: sourceFile.fileName,
                    line: line + 1,
                    start: element.getStart(),
                    end: element.getEnd(),
                    module: moduleName,
                    member: importName
                });
            }
        });
    }
}
