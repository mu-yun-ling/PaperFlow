import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Select, Space, Spin, Tabs, Upload } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { Attachment } from '../types/api';
import { MarkdownPreview } from './MarkdownPreview';
import { NotesPanel, type NotesPanelProps } from './NotesPanel';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';

const PdfReader = lazy(() => import('./PdfReader'));

function AttachmentContent({ file }: { file: Attachment }) {
  const resource = useResource(useCallback(async (signal: AbortSignal) => {
    const blob = await api.files.read(file.id, signal);
    const text = /\.(md|txt)$/i.test(file.filename) ? await blob.text() : '';
    return { blob, text };
  }, [file.id, file.filename]));
  const [downloadUrl, setDownloadUrl] = useState('');
  useEffect(() => {
    if (!resource.data) return;
    const url = URL.createObjectURL(resource.data.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resource.data]);

  if (resource.loading) return <div className="pdf-loading" role="status"><Spin /> 正在打开笔记…</div>;
  if (resource.error) return <Alert type="error" title={errorMessage(resource.error)} action={<Button onClick={resource.reload}>重试加载</Button>} />;
  if (!resource.data) return null;
  return <div className="reader-attachment-content">
    <div className="reader-attachment-meta"><span>{file.filename}</span><Button type="link" size="small" href={downloadUrl || undefined} download={file.filename} disabled={!downloadUrl}>下载笔记</Button></div>
    {/\.pdf$/i.test(file.filename) ? <PreviewErrorBoundary><Suspense fallback={<div className="pdf-loading" role="status"><Spin /> 正在加载笔记阅读器…</div>}><PdfReader blob={resource.data.blob} /></Suspense></PreviewErrorBoundary>
      : /\.md$/i.test(file.filename) ? <MarkdownPreview content={resource.data.text} />
      : /\.txt$/i.test(file.filename) ? <pre className="text-preview">{resource.data.text}</pre>
      : <Alert type="info" title="此格式需要本地阅读器" description="DOCX 笔记请下载后使用 Word 打开。需要并排阅读时，可以上传 PDF、Markdown 或 TXT 版本。" />}
  </div>;
}

function UploadedNotes({ files, paperId, onUploaded }: { files: Attachment[]; paperId: number; onUploaded: () => void }) {
  const [selected, setSelected] = useState(files[0]?.id);
  const [uploading, setUploading] = useState(false);
  const { message } = App.useApp();
  const uploadingRef = useRef(false);
  const upload = <Upload accept=".pdf,.docx,.md,.txt" showUploadList={false} disabled={uploading} beforeUpload={file => {
    if (uploadingRef.current) return false;
    if (!file.size || file.size > 25 * 1024 * 1024) { message.error('请选择非空且不超过 25 MB 的笔记附件'); return false; }
    uploadingRef.current = true; setUploading(true);
    void api.files.uploadNote(paperId, file).then(saved => { setSelected(saved.id); onUploaded(); message.success('笔记附件已上传'); }).catch(reason => message.error(errorMessage(reason))).finally(() => { uploadingRef.current = false; setUploading(false); });
    return false;
  }}><Button loading={uploading}>上传笔记附件</Button></Upload>;
  const file = files.find(item => item.id === selected) ?? files[0];
  if (!file) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="上传 PDF、Markdown 或 TXT，在这里与原文对照阅读。">{upload}</Empty>;
  return <section className="reader-attachments" aria-label="上传笔记预览">
    <Space className="reader-attachment-picker" wrap><Select aria-label="选择上传的笔记" value={file.id} onChange={setSelected} options={files.map(item => ({ value: item.id, label: item.filename }))} />{upload}</Space>
    <AttachmentContent key={file.id} file={file} />
  </section>;
}

export function ReaderNotes({ paperId, tab, onTabChange, ...noteProps }: NotesPanelProps & { tab: string; onTabChange: (tab: string) => void }) {
  const resource = useResource(useCallback((signal: AbortSignal) => api.papers.get(paperId, signal), [paperId]));
  if (resource.loading && !resource.data) return <div className="pdf-loading" role="status"><Spin /> 正在读取笔记…</div>;
  if (resource.error && !resource.data) return <Alert type="error" title={errorMessage(resource.error)} action={<Button onClick={resource.reload}>重试加载</Button>} />;
  const files = resource.data?.note_attachments ?? [];
  return <Tabs activeKey={tab} onChange={onTabChange} items={[
    { key: 'online', label: '在线笔记', children: <NotesPanel paperId={paperId} compact {...noteProps} /> },
    { key: 'uploaded', label: '笔记附件', children: <UploadedNotes paperId={paperId} files={files} onUploaded={resource.reload} /> },
  ]} />;
}
