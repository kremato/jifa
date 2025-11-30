import {
  parse,
  type Node as AcornNode,
  type ExportNamedDeclaration,
} from 'acorn';
import * as walk from 'acorn-walk';

export type ExportKind = 'named' | 'default';

export interface JifaExport {
  name: string;
  exportedAs: string;
  exportKind: ExportKind;
  loc: { line: number | null; column: number | null };
}

type BlockComment = {
  type: 'Block' | 'Line';
  value: string;
  start: number;
  end: number;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
};

// JSDoc comment starts with "/**"
function isJSDocBlock(code: string, c: BlockComment): boolean {
  if (c.type !== 'Block') return false;
  // guard for short comments
  if (c.start + 2 >= code.length) return false;
  return code.slice(c.start, c.start + 3) === '/**';
}

// nearest JSDoc block immediately above node (only whitespace in between) + @jifa present
function hasJifaJsdocLeading(
  code: string,
  comments: BlockComment[],
  node: { start: number }
): boolean {
  const before = comments
    .filter((c) => c.type === 'Block' && c.end <= node.start)
    .sort((a, b) => b.end - a.end)[0];
  if (!before) return false;

  const gap = code.slice(before.end, node.start);
  if (!/^\s*$/.test(gap)) return false;

  // require true JSDoc opener and @jifa somewhere in the block
  return isJSDocBlock(code, before) && /@jifa\b/.test(before.value);
}

function isFn(
  n: AcornNode | null | undefined
): n is AcornNode &
  (
    | { type: 'FunctionDeclaration' }
    | { type: 'FunctionExpression' }
    | { type: 'ArrowFunctionExpression' }
  ) {
  return (
    !!n &&
    (n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression')
  );
}

function locOf(n: any): { line: number | null; column: number | null } {
  return { line: n.loc?.start?.line ?? null, column: n.loc?.start?.column ?? null };
}

export function findExportsForContextMenu(code: string): JifaExport[] {
  const comments: BlockComment[] = [];

  const ast = parse(code, {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
    ranges: true,
    onComment: comments
  });

  const results: JifaExport[] = [];
  const add = (name: string, exportedAs: string, node: any) => {
    results.push({
      name,
      exportedAs,
      exportKind: 'named',
      loc: locOf(node)
    });
  };

  const visitors: Parameters<typeof walk.simple>[1] = {
    ExportNamedDeclaration(node: AcornNode) {
      const n = node as unknown as ExportNamedDeclaration;

      const decl = n.declaration;
      if (!decl) return;

      // e.g. export function foo() {}
      if (decl.type === 'FunctionDeclaration') {
        if (
          hasJifaJsdocLeading(code, comments, decl as any) ||
          hasJifaJsdocLeading(code, comments, n as any)
        ) {
          const name = decl.id?.name ?? '(anonymous)';
          add(name, name, decl);
        }
      }

      // e.g. export const foo = () => {}
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          const a = d.init
          const init = d.init as AcornNode | null | undefined;
          if (isFn(init)) {
            if (
              hasJifaJsdocLeading(code, comments, init as any) ||
              hasJifaJsdocLeading(code, comments, d as any) ||
              hasJifaJsdocLeading(code, comments, decl as any) ||
              hasJifaJsdocLeading(code, comments, n as any)
            ) {
              const id = d.id as AcornNode;
              const localName = id.type === 'Identifier' ? (id as any).name : '(pattern)';
              add(localName, localName, init);
            }
          }
        }
      }
    }
  };

  walk.simple(ast as unknown as AcornNode, visitors);
  return results;
}
