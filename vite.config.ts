import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import sharp from 'sharp';
import { themeCss } from './src/theme/palette.ts';

/** Match the build's idle crop without writing generated images into public/. */
function idlePortraits(): Plugin {
  const crops = new Map<string, { mtime: number; image: Promise<Buffer> }>();
  return {
    name: 'idle-portraits',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/sprites\/([a-z0-9-]+)\/(?:idle\.png|([a-z0-9-]+)-idle\.png)(?:\?.*)?$/.exec(req.url ?? '');
        if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        const id = match[1];
        const sheet = match[2] ?? 'common';
        try {
          const file = fileURLToPath(new URL(`./public/sprites/${id}/${sheet}.png`, import.meta.url));
          const mtime = statSync(file).mtimeMs;
          const key = id + '/' + sheet;
          let crop = crops.get(key);
          if (!crop || crop.mtime !== mtime) {
            crop = { mtime, image: sharp(file).extract({ left: 0, top: 0, width: 256, height: 256 }).png().toBuffer() };
            crops.set(key, crop);
          }
          const image = await crop.image;
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(req.method === 'HEAD' ? undefined : image);
        } catch {
          crops.delete(id + '/' + sheet);
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

/** 亮色主题：style.css 只写暗色 token，加载时在文件尾追加推导出的亮色块和暗色美术面块。
    开发和构建走同一条，改了暗色 token 亮色立刻跟着变。规则见 src/theme/palette.ts。 */
function themeLight(): Plugin {
  return {
    name: 'theme-light',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/src/style.css')) return;
      return { code: code + themeCss(code), map: null };
    },
  };
}

/** Layout writes are same-origin JSON, including on the LAN phone dev page. */
function layoutWriter(name: string, path: string, serialize: (value: unknown) => string): Plugin {
  const file = new URL(path, import.meta.url);
  const maxBody = 16 * 1024;
  return {
    name,
    configureServer(server) {
      server.middlewares.use('/__' + name, async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const { host, origin } = req.headers;
        if (!host || (origin !== 'http://' + host && origin !== 'https://' + host)) {
          res.writeHead(403).end();
          return;
        }
        if (req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          res.writeHead(415).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of req.iterator({ destroyOnReturn: false })) {
            size += chunk.length;
            if (size > maxBody) {
              res.writeHead(413, { Connection: 'close' }).end();
              return;
            }
            chunks.push(chunk);
          }
          const text = serialize(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
          res.writeHead(204).end();
        } catch {
          if (!res.destroyed) res.writeHead(400).end();
        }
      });
    },
    handleHotUpdate(ctx) {
      if (ctx.file.replaceAll('\\', '/').endsWith(path.slice(1))) return [];
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

/** 部件相对角色的位置。用开发面板改（战斗中 Shift+P），改完会写回这个文件。手改后刷新页面。
    x：扫弦朝面向为正；大招向屏幕右为正。y：相对脚底，向上为负。rot：弧度，正数让远端往下倒。size：图宽像素。 */
export const PROP_LAYOUT: Record<string, PropPlace> = {
${lines.join('\n')}
};
`;
}

const PAD_IDS = ['atk', 'guard', 's1', 's2', 's3', 'stick', 'ult'] as const;

function serializeTouch(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('layout must be an object');
  const src = raw as Record<string, unknown>;
  // 只写这次真正摆放的控件；没拖过的保持 CSS 默认，不进文件。
  const lines = PAD_IDS.filter(id => id in src).map(id => {
    const v = src[id];
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad ' + id);
    const p = v as Record<string, unknown>;
    const num = (k: string) => {
      const n = Number(p[k]);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('bad ' + id);
      return Math.round(n * 10) / 10;
    };
    return `  ${id}: { x: ${num('x')}, y: ${num('y')} },`;
  });
  return `/** 手机按键中心，相对战斗画面宽高的百分比。开发时点「键位」拖动，松手写入这里。手改后刷新。 */
export const TOUCH_LAYOUT: Record<string, { x: number; y: number }> = {
${lines.join('\n')}
};
`;
}

/** Online pairing refuses two pages whose game source differs. Line endings do not count. */
function sourceHash(): string {
  const root = fileURLToPath(new URL('./src/', import.meta.url));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|js|json)$/.test(name) && !/(propLayout|touchLayout)\.data\.ts$/.test(name)) files.push(path);
    }
  };
  walk(root);
  const h = createHash('sha256');
  for (const f of files) h.update(f.slice(root.length).replaceAll('\\', '/') + '\0' + readFileSync(f, 'utf8').replace(/\r\n/g, '\n') + '\0');
  return h.digest('hex').slice(0, 12);
}

export default defineConfig(({ command }) => ({
  define: { __NET_HASH__: JSON.stringify(sourceHash()) },
  // Toy hosts the built page under /toy/<slug>/. Dev stays at the site root.
  base: command === 'build' ? './' : '/',
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'roster', test: /[\\/]src[\\/]data[\\/]/ }] } },
    },
  },
  plugins: [
    themeLight(), idlePortraits(),
    layoutWriter('prop-layout', './src/render/propLayout.data.ts', serialize),
    layoutWriter('touch-layout', './src/ui/touchLayout.data.ts', serializeTouch),
  ],
  server: { host: true },
  preview: { host: true },
}));
