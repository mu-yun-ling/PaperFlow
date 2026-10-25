import { useState } from 'react';
import { Segmented } from 'antd';
import { MarkdownView } from './MarkdownView';

export function MarkdownPreview({ content }: { content: string }) {
  const [mode, setMode] = useState<string>('预览');
  return <div className="markdown-preview">
    <div className="editor-toolbar"><Segmented options={['预览', '源码']} value={mode} onChange={setMode} /><span>Markdown + LaTeX</span></div>
    <div className="markdown-preview-content">{mode === '预览' ? <MarkdownView content={content} /> : <pre className="markdown-source">{content}</pre>}</div>
  </div>;
}
