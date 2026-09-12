import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

const INCLUDE = /^[ \t]*#include[ \t]+["<]([^">]+)[">].*$/gm;

/**
 * Inlines `#include "foo.glsl"` directives so shader sources can be split into
 * modules. Included files are registered with Vite so editing one triggers an
 * HMR reload of every shader that pulls it in.
 */
export function glslInclude(): Plugin {
  const resolveIncludes = (
    source: string,
    fromFile: string,
    deps: Set<string>,
    stack: string[] = [],
  ): string =>
    source.replace(INCLUDE, (_line, rel: string) => {
      const target = resolve(dirname(fromFile), rel);
      if (!existsSync(target)) {
        throw new Error(`#include target not found: ${rel} (from ${fromFile})`);
      }
      if (stack.includes(target)) {
        throw new Error(`Circular #include: ${[...stack, target].join(' -> ')}`);
      }
      deps.add(target);
      const body = readFileSync(target, 'utf8');
      return resolveIncludes(body, target, deps, [...stack, target]);
    });

  return {
    name: 'glsl-include',
    transform(code, id) {
      if (!/\.(glsl|vert|frag)$/.test(id)) return null;
      const deps = new Set<string>();
      const out = resolveIncludes(code, id, deps);
      for (const dep of deps) this.addWatchFile(dep);
      return {
        code: `export default ${JSON.stringify(out)};`,
        map: null,
      };
    },
  };
}
