import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Space, Spin, Tabs } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { AIAction, AIResult, PaperDetail } from '../types/api';
import { MarkdownView } from './MarkdownView';

const actions: { key: AIAction; label: string; button: string }[] = [
  { key: 'analysis', label: '论文分析', button: 'AI 分析论文' },
  { key: 'keywords', label: '关键词', button: '生成关键词' },
  { key: 'reading-summary', label: '我的阅读总结', button: '生成阅读总结' },
];

export function AIPanel({ paperId, onTagsChanged, onNoteSaved }: {
  paperId: number; onTagsChanged: (paper: PaperDetail) => void; onNoteSaved: () => void;
}) {
  const { message } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.ai.status(signal), []);
  const { data: status, error: statusError, loading, reload } = useResource(load);
  const [active, setActive] = useState<AIAction>('analysis');
  const [results, setResults] = useState<Partial<Record<AIAction, AIResult>>>({});
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => () => controller.current?.abort(), []);

  async function generate(action: AIAction) {
    if (busy.current) return;
    busy.current = true;
    setPending(action); setActive(action); setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await api.ai.generate(paperId, action, request.signal);
      if (request.signal.aborted) return;
      setResults(previous => ({ ...previous, [action]: result }));
      if (action === 'keywords') { setSelected([]); setApplied([]); }
      if (action === 'reading-summary') setSaved(false);
    } catch (reason) {
      if (!request.signal.aborted) setError(errorMessage(reason));
    } finally { busy.current = false; setPending(null); }
  }

  async function applyKeywords() {
    if (busy.current || !selected.length) return;
    busy.current = true; setPending('apply'); setError('');
    try {
      const paper = await api.ai.applyKeywords(paperId, selected);
      onTagsChanged(paper);
      setApplied(previous => [...previous, ...selected]); setSelected([]);
      message.success('已添加所选标签');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { busy.current = false; setPending(null); }
  }

  async function saveSummary() {
    const content = results['reading-summary']?.markdown;
    if (busy.current || saved || !content) return;
    busy.current = true; setPending('save'); setError('');
    try {
      await api.notes.create(paperId, content);
      setSaved(true); onNoteSaved(); message.success('已保存为一条新的阅读笔记');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { busy.current = false; setPending(null); }
  }

  async function copy(content: string) {
    try { await navigator.clipboard.writeText(content); message.success('已复制 Markdown'); }
    catch { message.error('无法访问剪贴板，请选择下方文字手动复制。'); }
  }

  const result = results[active];
  return <section className="ai-panel" aria-label="AI 文献辅助" aria-busy={!!pending}>
    <div className="section-caption">READ WITH AI</div><div className="ai-panel-heading"><h2>AI 文献辅助</h2><Button type="link" href="#/settings/ai">AI 设置 ↗</Button></div>
    <p className="section-description">梳理论文，也整理自己的思考。点击生成会将论文信息和正文片段发送到已配置的 AI 服务；阅读总结还会使用在线笔记。</p>
    {loading ? <Spin size="small" /> : (statusError || !status?.available) && <Alert type="info" showIcon
      title={statusError ? errorMessage(statusError) : status?.message}
      action={<Button size="small" onClick={reload}>重新检查</Button>} />}
    <Space wrap className="ai-actions">{actions.map(action => <Button key={action.key} type={action.key === 'analysis' ? 'primary' : 'default'}
      loading={pending === action.key} disabled={!status?.available || !!pending} onClick={() => generate(action.key)}>{action.button}</Button>)}</Space>
    {!!pending && <p className="muted" role="status">{pending === 'apply' || pending === 'save' ? '正在保存…' : '正在解析论文并生成结果，请稍候…'}</p>}
    {error && <Alert type="error" showIcon title={error} />}
    <Tabs activeKey={active} onChange={key => setActive(key as AIAction)} items={actions.map(action => ({ key: action.key, label: action.label }))} />
    {result ? <Card size="small" className="ai-result">
      <div className="ai-source">{result.source.kind === 'pdf' ? `依据 PDF 正文 · ${result.source.pages.length}/${result.source.total_pages} 页 · ${result.source.text_chars} 字符` : '依据论文信息与摘要'}
        {active === 'reading-summary' && ` · ${result.source.notes_used} 条在线笔记`}</div>
      {!!result.source.warnings.length && <Alert type="warning" showIcon title="输入范围说明" description={result.source.warnings.join(' ')} />}
      {active === 'keywords' ? <>
        <p className="section-description">勾选希望保留的关键词，再添加为标签。</p>
        <Checkbox.Group value={selected} onChange={values => setSelected(values as string[])} disabled={!!pending}
          options={(result.keywords ?? []).map(word => ({ label: applied.includes(word) ? `${word}（已添加）` : word, value: word, disabled: applied.includes(word) }))} />
        <div className="ai-result-actions"><Button onClick={applyKeywords} disabled={!selected.length || !!pending} loading={pending === 'apply'}>添加所选标签{selected.length ? `（${selected.length}）` : ''}</Button></div>
      </> : <><MarkdownView content={result.markdown ?? ''} /><Space wrap className="ai-result-actions">
        <Button onClick={() => copy(result.markdown ?? '')}>复制 Markdown</Button>
        {active === 'reading-summary' && <Button type="primary" onClick={saveSummary} loading={pending === 'save'} disabled={saved || !!pending}>{saved ? '已保存为新笔记' : '保存为新阅读笔记'}</Button>}
      </Space></>}
      <p className="ai-footnote">AI 生成内容，请结合原文核对。结果暂存于当前页面，离开前可复制或将阅读总结保存为笔记。</p>
    </Card> : <p className="ai-empty">{active === 'analysis' ? '从研究问题到局限性，用六个角度梳理论文。' : active === 'keywords' ? '发现 3～8 个关键词，为文献建立阅读线索。' : '结合论文与在线笔记，回顾你的理解、疑问和下一步。'}</p>}
  </section>;
}
