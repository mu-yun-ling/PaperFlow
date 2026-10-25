import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Progress, Spin } from 'antd';
import { api, errorMessage } from '../api/client';
import type { Attachment } from '../types/api';
import type { ReadingEvent } from './PdfReader';
import { ReaderNotes } from './ReaderNotes';
import { ReadingSplitPane } from './ReadingSplitPane';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';

const PdfReader = lazy(() => import('./PdfReader'));

export function ReadingWorkspace({ file, blob, onClose, onDownload }: { file: Attachment; blob: Blob; onClose: () => void; onDownload: () => void }) {
  const [progress, setProgress] = useState(file.reading_progress);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const queue = useRef<ReadingEvent[]>([]);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function flush() {
    if (saving.current) return;
    saving.current = true; setPending(true); setError('');
    try {
      while (queue.current.length) {
        const saved = await api.files.progress(file.id, queue.current[0]);
        queue.current.shift();
        if (mounted.current) setProgress(saved);
      }
    } catch (reason) { if (mounted.current) setError(`阅读位置尚未保存：${errorMessage(reason)}`); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }

  function record(event: ReadingEvent) {
    queue.current.push(event);
    void flush();
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (queue.current.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return <Modal open className="reading-workspace" width="96vw" styles={{ body: { padding: 0 } }}
    title={<div className="reader-heading"><span className="reader-brand">PaperFlow / 阅读空间</span><strong>{file.filename}</strong></div>}
    footer={null} onCancel={onClose} closable={!pending && !error} mask={{ closable: false }} keyboard={false}>
    <div className="reader-progress"><Progress percent={progress?.percent ?? 0} format={value => `${value}%`} size="small" />
      <span>{progress ? `历史最远 ${progress.max_page} / ${progress.total_pages} 页` : '正在读取页数'} · {pending ? '正在保存…' : error ? '尚未同步' : '位置已同步'}</span><Button type="text" size="small" onClick={onDownload}>下载原文</Button></div>
    {error && <Alert type="warning" title={error} action={<Button size="small" onClick={() => void flush()}>重试保存</Button>}
      description={<Button type="text" size="small" onClick={onClose}>放弃未保存的位置并关闭</Button>} />}
    <ReadingSplitPane document={<section className="reader-document" aria-label="论文阅读器">
      <PreviewErrorBoundary><Suspense fallback={<div className="pdf-loading" role="status"><Spin /> 正在加载阅读器…</div>}><PdfReader blob={blob} initialPage={file.reading_progress?.current_page ?? 1} onProgress={record} /></Suspense></PreviewErrorBoundary>
      <p className="reader-hint">翻页、跳页或向下读到页底时自动记录。打开文件不增加进度；单页文档也可点击“本页已读”。</p>
    </section>} notes={<aside className="reader-notes"><h2>随读随记</h2><p className="section-description">对照上传的笔记，或记录新的理解。</p><ReaderNotes paperId={file.paper_id} /></aside>} />
  </Modal>;
}
