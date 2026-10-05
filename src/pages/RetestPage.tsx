import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Form, Input, Radio, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { LockOutlined } from '@ant-design/icons'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import type { Issue } from '../api/types'
import { isEnvExpired } from '../utils/remediation'

export default function RetestPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const currentRole = useWorkspaceStore((state) => state.currentRole)
  const recordRetest = useWorkspaceStore((state) => state.recordRetest)
  const canJudge = currentRole === '复测员'
  const queue = issues.filter((item) => ['待复测', '已退回'].includes(item.status))
  const [active, setActive] = useState<Issue | null>(queue[0] ?? null)
  const [form] = Form.useForm()

  useEffect(() => {
    if (active && !queue.some((item) => item.key === active.key)) setActive(queue[0] ?? null)
  }, [queue, active])

  const submit = async (values: { result: '已通过' | '已退回' | '不适用'; note: string }) => {
    if (!active) return
    try {
      const data = await recordRetest(active.key, values.result, values.note)
      setActive(data)
      form.resetFields()
      message.success(`复测结果已记录：${values.result}`)
    } catch (error) {
      message.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '提交失败')
    }
  }

  const columns: ColumnsType<Issue> = [
    { title: '问题', dataIndex: 'key', render: (_, record) => <div><Typography.Text strong>{record.key}</Typography.Text><div>{record.title}</div></div> },
    { title: '修复说明', dataIndex: 'fixNote', width: 240, render: (value) => value ?? '未提交' },
    {
      title: '复测环境', dataIndex: 'retestEnv', width: 200,
      render: (_, record) => record.retestEnv ? (
        <Space direction="vertical" size={2}>
          <span>{record.retestEnv}</span>
          {isEnvExpired(record)
            ? <Tag color="error">环境过期</Tag>
            : <Tag color="green">有效</Tag>}
        </Space>
      ) : '待开发提交',
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value) => <Tag color={value === '已退回' ? 'error' : 'orange'}>{value}</Tag> },
  ]

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">RETEST / 复测工作台</p>
          <h1>逐项验证修复结果</h1>
          <p className="muted">开发提交修复说明与环境，复测员逐项判定；负责人不可替复测员下结论。</p>
        </div>
        <Tag color="orange">{queue.length} 项待复测</Tag>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="复测规则" description="键盘问题必须覆盖 Tab、Shift+Tab、Esc 和焦点返回；屏幕阅读器问题需保留截图或播报日志。证据变更后结论立即失效。" />

      <div className="review-grid">
        <div className="panel">
          <div className="panel-head"><h3>复测队列</h3><span className="muted">点击选择问题</span></div>
          <Table rowKey="key" columns={columns} dataSource={queue} pagination={false} rowClassName={(record) => record.key === active?.key ? 'ant-table-row-selected' : ''} onRow={(record) => ({ onClick: () => { setActive(record); form.resetFields() } })} scroll={{ x: 760 }} />
        </div>

        <div className="panel review-box">
          <Typography.Title level={4}>{active?.key ?? '暂无可复测项'}</Typography.Title>
          {active && (
            <>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="问题">{active.title}</Descriptions.Item>
                <Descriptions.Item label="根因">{active.rootCause}</Descriptions.Item>
                <Descriptions.Item label="修复说明">{active.fixNote ?? '开发尚未提交'}{active.fixer ? `（${active.fixer}）` : ''}</Descriptions.Item>
                <Descriptions.Item label="复测环境">
                  {active.retestEnv
                    ? <Space>{active.retestEnv}{active.retestEnvVersion ? ` · ${active.retestEnvVersion}` : ''}{isEnvExpired(active) && <Tag color="error">环境过期</Tag>}</Space>
                    : '待开发提交'}
                </Descriptions.Item>
                <Descriptions.Item label="复测员">{active.retester ?? '未指定'}</Descriptions.Item>
              </Descriptions>

              {canJudge ? (
                <Form form={form} layout="vertical" style={{ marginTop: 18 }} onFinish={submit} initialValues={{ result: '已通过' }}>
                  <Form.Item name="result" label="复测结论" rules={[{ required: true }]}>
                    <Radio.Group><Radio.Button value="已通过">通过</Radio.Button><Radio.Button value="已退回">退回</Radio.Button><Radio.Button value="不适用">不适用</Radio.Button></Radio.Group>
                  </Form.Item>
                  <Form.Item name="note" label="复测记录" rules={[{ required: true, message: '请填写可验证的复测记录' }]}><Input.TextArea rows={5} placeholder="记录实际操作、结果与证据位置" /></Form.Item>
                  <Button type="primary" htmlType="submit" block>提交复测记录</Button>
                </Form>
              ) : (
                <Alert
                  style={{ marginTop: 18 }}
                  type="warning"
                  showIcon
                  icon={<LockOutlined />}
                  message="仅复测员可判定复测结论"
                  description={`当前角色为「${currentRole}」。开发只提交修复说明，负责人不可替复测员下结论；请切换到复测员角色后再判定。`}
                />
              )}

              <Typography.Title level={5} style={{ marginTop: 20 }}>历史复测</Typography.Title>
              {active.retestRecords.length === 0 && <Typography.Text type="secondary">暂无历史记录</Typography.Text>}
              {active.retestRecords.map((record) => (
                <div className="timeline-item" key={record.id}>
                  <Space>
                    <Tag color={record.result === '通过' ? 'success' : record.result === '退回' ? 'error' : 'default'}>{record.result}</Tag>
                    {record.valid === false && <Tag color="warning">已失效{record.invalidReason ? `：${record.invalidReason}` : ''}</Tag>}
                  </Space>
                  <Typography.Text strong>{record.actor}{record.actorRole ? ` / ${record.actorRole}` : ''}</Typography.Text>
                  <div>{record.note}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{record.at}{record.evidenceHash ? ` · 证据 ${record.evidenceHash}` : ''}</Typography.Text>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
