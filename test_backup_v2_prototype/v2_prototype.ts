
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

function validateFile(filePath: string) {
    const program = ts.createProgram([filePath], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs
    });

    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);

    if (!sourceFile) {
        console.error(`Could not find source file: ${filePath}`);
        return;
    }

    console.log(`Analyzing ${filePath}...`);

    ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const moduleName = moduleSpecifier.text;
                console.log(`\nImport from: '${moduleName}'`);

                // Check if module resolves
                const symbol = checker.getSymbolAtLocation(moduleSpecifier);
                if (!symbol) {
                    console.error(`  ❌ Module '${moduleName}' not found or not resolved.`);
                    return;
                }

                // Iterate over named imports
                if (node.importClause && node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                    node.importClause.namedBindings.elements.forEach(element => {
                        const importName = element.propertyName?.text || element.name.text;
                        console.log(`  Checking import: ${importName}`);

                        const importSymbol = checker.getSymbolAtLocation(element.name);
                        if (importSymbol) {
                            const aliasedSymbol = checker.getAliasedSymbol(importSymbol);
                            if (aliasedSymbol) {
                                // Check if the aliased symbol is valid (resolves to something)
                                if (aliasedSymbol.name === 'unknown' || !aliasedSymbol.declarations || aliasedSymbol.declarations.length === 0) {
                                    console.error(`    ❌ Hallucination detected: '${importName}' resolved to 'unknown' symbol (likely missing export)`);
                                } else {
                                    console.log(`    ✅ Found (aliased to): ${aliasedSymbol.name}`);
                                    const decl = aliasedSymbol.declarations[0];
                                    const declFile = decl.getSourceFile().fileName;
                                    console.log(`       Defined in: ${declFile}`);
                                }
                            } else {
                                console.log(`    ✅ Found: ${importSymbol.name}`);
                            }
                        } else {
                            // Fallback check
                            const moduleExports = checker.getExportsOfModule(symbol);
                            if (moduleExports.some(e => e.name === importName)) {
                                console.log(`    ✅ Verified in module exports.`);
                            } else {
                                console.error(`    ❌ Hallucination detected: '${importName}' not exported by '${moduleName}'`);
                            }
                        }
                    });
                }
            }
        }
    });
}

const fixturePath = path.join(__dirname, 'fixtures', 'index.ts');
validateFile(fixturePath);
