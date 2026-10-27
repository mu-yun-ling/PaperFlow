import { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './MarkdownView';

export function ReadingExcerpt({ content }: { content: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setLong(element.scrollHeight > 63));
    observer.observe(element); return () => observer.disconnect();
  }, [content]);
  return <section className="reading-excerpt" aria-label="原文摘录">
    <div className={`excerpt-window${expanded ? ' expanded' : ''}`}><div ref={body}><MarkdownView content={content} /></div></div>
    {long && <button className="excerpt-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起摘录' : '展开摘录'}</button>}
  </section>;
}
