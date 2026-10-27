import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { App, Button, Card, Dropdown, Modal, Progress, Space, Spin, Upload } from 'antd';
import { api, errorMessage } from '../api/client';
import type { Attachment } from '../types/api';
import { MarkdownPreview } from './MarkdownPreview';
import { ReadingWorkspace } from './ReadingWorkspace';
import { formatTime } from '../utils/papers';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';

const PdfReader = lazy(() => import('./PdfReader'));

function fileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }

export function FilesPanel({ paperId, paperFile, notes, onChanged, openRequest, onOpenHandled }: {
  paperId: number; paperFile?: Attachment | null; notes?: Attachment[]; onChanged: () => void;
  openRequest?: { page: number; token: number }; onOpenHandled?: () => void;
}) {
  const isNotes = notes !== undefined;
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [preview, setPreview] = useState<{ file: Attachment; blob?: Blob; text?: string; initialPage?: number }>();
  const lastOpen = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (openRequest && paperFile && lastOpen.current !== openRequest.token && !busy) {
      lastOpen.current = openRequest.token;
      void open(paperFile, false, openRequest.page);
      onOpenHandled?.();
    }
  }, [openRequest, paperFile, busy]);
  const urls = useRef(new Set<string>());
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); }, []);

  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { lock.current = false; setBusy(false); }
  }

  function closePreview() {
    setPreview(undefined);
    if (!isNotes) onChanged();
  }

  async function open(file: Attachment, download: boolean, initialPage?: number) {
    await perform(async () => {
      const blob = await api.files.read(file.id);
      const docx = file.filename.toLowerCase().endsWith('.docx');
      if (!download && !docx && file.mime_type !== 'application/pdf') {
        setPreview({ file, text: await blob.text() }); return;
      }
      if (download || docx) {
        const url = URL.createObjectURL(blob); urls.current.add(url);
        const link = document.createElement('a'); link.href = url; link.download = file.filename;
        document.body.appendChild(link); link.click(); link.remove();
        message.success(docx && !download ? '已交给浏览器下载，请用 Word 或兼容阅读器打开。' : '已交给浏览器下载');
        window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60000);
      } else setPreview({ file, blob, initialPage });
    });
  }

  async function remove(file: Attachment) {
    await perform(async () => { await api.files.delete(file.id); message.success('附件已删除'); onChanged(); });
  }

  function confirmRemove(file: Attachment) {
    modal.confirm({ title: `删除${isNotes ? '笔记附件' : '论文原文'}？`, content: '文献信息和其他笔记会保留，此文件删除后无法撤销。',
      okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => remove(file) });
  }

  const items = isNotes ? notes : paperFile ? [paperFile] : [];
  return <section className={isNotes ? 'attachment-section' : 'source-section'} aria-label={isNotes ? '上传的笔记附件' : '论文原文'}>
    <Card className={isNotes ? 'attachment-card' : 'source-card'}>
      {isNotes && <div className="section-heading"><p className="section-description">收集批注、摘录与阅读报告</p>
        <Upload accept=".pdf,.docx,.md,.txt" showUploadList={false} disabled={busy} beforeUpload={(file) => {
          if (!file.size || file.size > 25 * 1024 * 1024) { message.error('请选择非空且不超过 25 MB 的文件'); return false; }
          void perform(async () => { await api.files.uploadNote(paperId, file); message.success('笔记附件已上传'); onChanged(); }); return false;
        }}><Button type="primary" loading={busy}>上传笔记</Button></Upload>
      </div>}
      {items.length ? <div className="file-list">{items.map((file) => <div className="file-row" key={file.id}>
        <span className="file-badge" aria-hidden="true">{file.filename.split('.').pop()?.toUpperCase()}</span>
        <div className="file-info">{!isNotes && <span className="source-kicker">你的下一段阅读，从这里继续</span>}
          <strong>{file.filename}</strong><small>{isNotes ? fileSize(file.size) : `PDF 原文 · ${fileSize(file.size)}${file.reading_progress ? ` · 共 ${file.reading_progress.total_pages} 页` : ''}`}</small>
          {!isNotes && <div className="source-progress"><Progress percent={file.reading_progress?.percent ?? 0} format={value => `${value}%`} size="small" />
            <span>{file.reading_progress?.last_read_at ? `最近阅读 ${formatTime(file.reading_progress.last_read_at)} · 上次停在第 ${file.reading_progress.current_page} 页` : '尚未开始阅读 · 打开后自动记录位置'}</span></div>}
        </div>
        <Space wrap><Button type={!isNotes ? 'primary' : 'default'} onClick={() => open(file, false)} disabled={busy}>
          {file.filename.toLowerCase().endsWith('.docx') ? '查看（本地打开）' : isNotes ? '查看' : file.reading_progress?.max_page ? '继续阅读' : '开始阅读'}</Button>
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'download', label: '下载文件', onClick: () => void open(file, true) },
            ...(!isNotes ? [{ key: 'replace', label: <a href={`#/papers/${paperId}/edit`}>替换原文</a> }] : []),
            { key: 'delete', label: '删除文件', danger: true, onClick: () => confirmRemove(file) },
          ] }}><Button type="text" disabled={busy} aria-label={`${file.filename}的更多操作`}>···</Button></Dropdown></Space>
      </div>)}</div> : <div className="file-empty"><div><strong>{isNotes ? '还没有笔记附件' : '还没有论文原文'}</strong>
        <p>{isNotes ? '上传 Markdown，让阅读记录有自己的排版。' : '添加 PDF，随时打开阅读。'}</p></div>
        {!isNotes && <Button href={`#/papers/${paperId}/edit`}>添加 PDF</Button>}</div>}
      {isNotes && <p className="attachment-help">PDF / DOCX / MD / TXT · 每个文件 ≤ 25 MB · DOCX 使用本地阅读器打开</p>}
    </Card>
    {!isNotes && preview?.blob ? <ReadingWorkspace file={preview.file} blob={preview.blob} initialPage={preview.initialPage} onClose={closePreview} onDownload={() => void open(preview.file, true)} /> :
    <Modal open={!!preview} title={preview?.file.filename} onCancel={closePreview} footer={<Space><Button disabled={busy} onClick={() => preview && open(preview.file, true)}>下载文件</Button><Button onClick={closePreview}>关闭</Button></Space>} width={1000} destroyOnHidden>
      {preview?.blob ? <PreviewErrorBoundary><Suspense fallback={<div className="pdf-loading" role="status"><Spin /> 正在加载阅读器…</div>}><PdfReader blob={preview.blob} /></Suspense></PreviewErrorBoundary>
        : preview?.file.filename.toLowerCase().endsWith('.md') ? <MarkdownPreview content={preview.text ?? ''} /> : <pre className="text-preview">{preview?.text}</pre>}
    </Modal>}
  </section>;
}
