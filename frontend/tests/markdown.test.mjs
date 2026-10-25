import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// 编译实际组件以复用既有 Node 测试入口，无需添加另一套测试框架。
const source = await readFile(new URL('../src/components/MarkdownView.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
const { MarkdownView } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const render = (content) => renderToStaticMarkup(createElement(MarkdownView, { content }));

test('Markdown 实际组件渲染标题、引用、列表和代码块', () => {
  const html = render('# 阅读记录\n\n> 核心观点\n\n- **重点**\n\n```python\nprint("hello")\n```');
  assert.match(html, /<h1>阅读记录<\/h1>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /<pre><code class="language-python">/);
  assert.doesNotMatch(html, /```/);
});

test('GFM 表格、任务清单和删除线正常显示', () => {
  const html = render('| 方法 | 结果 |\n| --- | --- |\n| A | 90% |\n\n- [x] 已阅读\n- [ ] 待复现\n\n~~旧结论~~');
  assert.match(html, /<table>/);
  assert.match(html, /<th>方法<\/th>/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /<del>旧结论<\/del>/);
});

test('用户 Markdown 不能注入脚本、事件或 javascript 链接', () => {
  const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert%281%29)');
  assert.doesNotMatch(html, /<script|<img[^>]+onerror|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});

test('外部链接安全打开，普通文本和中文继续显示', () => {
  const html = render('第一行\n第二行\n\n[论文](https://example.org/paper)');
  assert.match(html, /第一行\n第二行/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/example.org\/paper"/);
});

test('行内公式与块级公式渲染为 KaTeX 和可访问 MathML', () => {
  const html = render('能量 $E=mc^2$\n\n$$\n\\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$');
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<math/);
  assert.match(html, /<mfrac>/);
});

test('LaTeX 括号分隔符受支持，代码块不当作公式执行', () => {
  const html = render('行内 \\(x^2\\)\n\n\\[\\int_0^1 x dx\\]\n\n```tex\n\\(literal\\)\n```\n\n`$literal$`');
  assert.match(html, /class="katex-display"/);
  assert.match(html, /<code class="language-tex">\\\(literal\\\)/);
  assert.match(html, /<code>\$literal\$<\/code>/);
});

test('危险 LaTeX 命令不能注入 HTML 或外部链接，错误公式仍可阅读', () => {
  const html = render('$\\href{javascript:alert(1)}{bad}$\n\n$\\htmlClass{evil}{x}$\n\n$\\notacommand{x}$');
  assert.doesNotMatch(html, /href="javascript:|class="evil"/);
  assert.match(html, /\\notacommand/);
});
