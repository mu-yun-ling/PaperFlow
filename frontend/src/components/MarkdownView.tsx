import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// 转换常见 LaTeX 分隔符；代码围栏和行内代码保持原文。
export function normalizeMath(content: string) {
  return content.replace(/(^ {0,3}~{3,}[^\n]*\n[\s\S]*?^ {0,3}~{3,}\s*$)|(`+)[\s\S]*?\2|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/gm,
    (match, fence, ticks, block, inline) => fence || ticks ? match : block !== undefined ? `\n\n$$\n${block}\n$$\n\n` : `$${inline}$`);
}

export function MarkdownView({ content }: { content: string }) {
  return <div className="markdown-body"><Markdown remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false, maxExpand: 1000, maxSize: 20 }]]} components={{
    a: ({ children, href, title }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
  }}>{normalizeMath(content)}</Markdown></div>;
}

