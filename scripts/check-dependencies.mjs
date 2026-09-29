import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";
import ts from "typescript";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", "generated", ".turbo"].includes(entry.name)) return [];
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.[cm]?tsx?$/.test(file) ? [file] : [];
  });
}
const dirs = ["seed", "e2e"].map((group) => join(root, group));
for (const group of ["packages", "services", "apps"]) {
  for (const entry of readdirSync(join(root, group))) dirs.push(join(root, group, entry));
}
let checked = 0;
let failures = 0;
for (const dir of dirs) {
  if (!existsSync(join(dir, "package.json"))) continue;
  checked++;
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const declared = new Set([
    pkg.name,
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
  const imports = new Set();
  for (const file of walk(dir)) {
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      let specifier;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifier = node.moduleSpecifier.text;
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifier = node.arguments[0].text;
      }
      if (
        specifier &&
        !specifier.startsWith(".") &&
        !specifier.startsWith("/") &&
        !isBuiltin(specifier)
      ) {
        imports.add(
          specifier
            .split("/")
            .slice(0, specifier.startsWith("@") ? 2 : 1)
            .join("/"),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  for (const name of imports) {
    if (!declared.has(name)) {
      failures++;
      console.error(`${pkg.name}: undeclared dependency ${name}`);
    }
  }
}
console.log(`${checked} workspaces checked; ${failures} undeclared dependencies.`);
process.exitCode = failures ? 1 : 0;
