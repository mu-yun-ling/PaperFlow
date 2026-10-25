import { useRef, useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Select, Skeleton, Space, Switch, Tag } from 'antd';
import { api, errorMessage } from '../api/client';
import { LoadError } from '../components/LoadError';
import { useResource } from '../hooks/useResource';
import type { AISettings, AISettingsInput } from '../types/api';

export function AISettingsPage() {
  const { data, loading, error, reload } = useResource(api.ai.settings);
  return <div className="ai-settings-page">
    <div className="page-heading"><div><h1>AI 设置</h1><p>接入你的模型服务，让 AI 参与论文阅读。</p></div><Button href="#/papers">返回文献库</Button></div>
    {loading ? <Skeleton active /> : error ? <LoadError error={error} retry={reload} /> : data && <SettingsForm initial={data} />}
  </div>;
}

function SettingsForm({ initial }: { initial: AISettings }) {
  const [form] = Form.useForm<AISettingsInput>();
  const [hasKey, setHasKey] = useState(initial.has_api_key);
  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const busy = useRef(false);
  const clearKey = Form.useWatch('clear_api_key', form);

  async function submit(action: 'save' | 'test') {
    if (busy.current) return;
    busy.current = true;
    let values: AISettingsInput;
    try { values = await form.validateFields(); }
    catch { busy.current = false; return; }
    setPending(action); setFeedback(null);
    try {
      if (action === 'test') {
        const result = await api.ai.testSettings(values);
        setFeedback({ type: 'success', text: result.message });
      } else {
        const result = await api.ai.saveSettings(values);
        setHasKey(result.has_api_key);
        form.setFieldsValue({ ...result, timeout_seconds: Number(result.timeout_seconds), max_output_tokens: Number(result.max_output_tokens), api_key: '', clear_api_key: false });
        setFeedback({ type: 'success', text: result.enabled ? '设置已保存并立即生效，可以返回文献详情使用 AI。' : '设置已保存，AI 已关闭。文献与笔记功能可继续使用。' });
      }
    } catch (reason) { setFeedback({ type: 'error', text: errorMessage(reason) }); }
    finally { busy.current = false; setPending(null); }
  }

  return <Card className="ai-settings-card">
    <Form form={form} layout="vertical" disabled={!!pending} initialValues={{ ...initial,
      timeout_seconds: Number(initial.timeout_seconds) || 45, max_output_tokens: Number(initial.max_output_tokens) || 3000,
      api_key: '', clear_api_key: false }} onValuesChange={changed => {
        setFeedback(null);
        if (changed.clear_api_key) form.setFieldsValue({ api_key: '', enabled: false });
      }} onFinish={() => submit('save')}>
      <div className="ai-settings-intro"><div><h2>模型服务</h2><p>支持 Chat Completions 兼容接口。填写服务商提供的地址、模型名称和 API Key。</p></div>
        <Form.Item name="enabled" label="启用 AI" valuePropName="checked"><Switch checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item></div>
      <Form.Item name="base_url" label="API 基础地址" extra="填写服务商提供的基础地址，例如 https://api.example.com/v1；不要包含 /chat/completions。"
        rules={[{ required: true, whitespace: true, message: '请输入 API 基础地址' }, { max: 2048 }]}>
        <Input placeholder="https://api.example.com/v1" autoComplete="off" /></Form.Item>
      <Form.Item name="model" label="模型名称" extra="填写服务商控制台中的模型标识。"
        rules={[{ max: 200 }]}><Input placeholder="输入模型名称" autoComplete="off" /></Form.Item>
      <div className="ai-key-label">API Key <Tag color={hasKey ? 'green' : 'default'}>{hasKey ? '已配置' : '尚未配置'}</Tag></div>
      <Form.Item name="api_key" label="填写或更换密钥" extra={hasKey ? '留空保留原密钥。更换服务地址时，请重新填写对应密钥。' : '密钥仅保存在本机后端，不会在读取设置时返回浏览器。'}
        rules={[{ max: 4096 }]}><Input.Password placeholder={hasKey ? '已配置；留空保留' : '输入 API Key'} autoComplete="new-password" disabled={clearKey || !!pending} /></Form.Item>
      {hasKey && <Form.Item name="clear_api_key" valuePropName="checked"><Checkbox>清除已保存的密钥，同时关闭 AI</Checkbox></Form.Item>}
      <details className="ai-settings-advanced"><summary>高级设置</summary>
        <div className="ai-settings-grid"><Form.Item name="timeout_seconds" label="请求超时（秒）" rules={[{ required: true }]}><InputNumber min={1} max={60} precision={0} /></Form.Item>
          <Form.Item name="max_output_tokens" label="输出长度上限（tokens）" rules={[{ required: true }]}><InputNumber min={256} max={8000} precision={0} /></Form.Item></div>
        <Form.Item name="token_parameter" label="输出长度参数" extra="如服务商提示不支持当前参数，可切换另一项。">
          <Select options={[{ value: 'max_completion_tokens', label: 'max_completion_tokens' }, { value: 'max_tokens', label: 'max_tokens' }]} /></Form.Item>
      </details>
      <p className="section-description">测试连接只发送简短测试消息，不发送论文或笔记，可能消耗少量模型额度。测试不会保存设置。</p>
      {feedback && <Alert role="status" type={feedback.type} showIcon title={feedback.text} />}
      <Space wrap className="ai-settings-actions"><Button onClick={() => submit('test')} loading={pending === 'test'} disabled={!!pending}>测试连接</Button>
        <Button type="primary" htmlType="submit" loading={pending === 'save'} disabled={!!pending}>保存设置</Button></Space>
      <p className="ai-footnote">保存后立即生效，重启后仍会保留。此设置用于本机个人使用，请勿共享保存配置的后端目录。</p>
    </Form>
  </Card>;
}
