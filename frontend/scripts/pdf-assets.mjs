import { cp, mkdir } from 'node:fs/promises';

// PDF 字体、CMap 和解码器随项目提供，不请求外部 CDN。
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = new URL(`../public/pdfjs/${name}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  await cp(new URL(`../node_modules/pdfjs-dist/${name}/`, import.meta.url), target, { recursive: true });
}
