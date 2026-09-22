import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** Dev panel posts the live numbers here. The fight keeps running; this file is not hot-reloaded. */
function propLayout(): Plugin {
  const file = new URL('./src/render/propLayout.data.ts', import.meta.url);
  return {
    name: 'prop-layout',
    configureServer(server) {
      server.middlewares.use('/__prop-layout', (req, res, next) => {
        if (req.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const text = serialize(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
            res.statusCode = 204;
            res.end();
          } catch (err) {
            res.statusCode = 400;
            res.end(err instanceof Error ? err.message : 'bad layout');
          }
        });
      });
    },
    handleHotUpdate(ctx) {
      if (ctx.file.replaceAll('\\', '/').endsWith('/src/render/propLayout.data.ts')) return [];
    },
  };
}

function serialize(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('layout must be an object');
  const entries = Object.entries(raw as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length > 80) throw new Error('too many props');
  const lines = entries.map(([id, v]) => {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('bad id');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad place');
    const p = v as Record<string, unknown>;
    const num = (k: string, d: number) => {
      const n = Number(p[k]);
      if (!Number.isFinite(n) || Math.abs(n) > 4000) throw new Error('bad ' + k);
      const f = 10 ** d;
      return Math.round(n * f) / f;
    };
    return `  '${id}': { x: ${num('x', 1)}, y: ${num('y', 1)}, rot: ${num('rot', 3)}, size: ${num('size', 1)} },`;
  });
  return `import type { PropPlace } from './propLayout.ts';

/** 部件相对角色的位置。用开发面板「部件」改，改完会写回这个文件。手改后刷新页面。
    x：扫弦朝面向为正；大招向屏幕右为正。y：相对脚底，向上为负。rot：弧度，正数让远端往下倒。size：图宽像素。 */
export const PROP_LAYOUT: Record<string, PropPlace> = {
${lines.join('\n')}
};
`;
}

export default defineConfig({ plugins: [propLayout()] });
