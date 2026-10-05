import { useState } from 'react'
import { Alert, Button, Descriptions, Form, Input, Radio, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import axios from 'axios'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { useSessionStore } from '../store/useSessionStore'
import { permissions } from '../api/directory'
import { isEnvExpired } from '../utils/blockers'
import type { Issue } from '../api/types'

export default function RetestPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const updateIssue = useWorkspaceStore((state) => state.updateIssue)
  const user = useSessionStore((state) => state.user)
  const role = useSessionStore((state) => state.role)
  const allowed = permissions.canRetest(role)
  const queue = issues.filter((item) => ['待复测', '已退回'].includes(item.status))
  const [active, setActive] = useState<Issue | null>(queue[0] ?? null)
  const [form] = Form.useForm()

  const envExpired = active ? isEnvExpired(active) : false
  const envMissing = active ? !active.retestEnv : false

  const submit = async (values: { result: '已通过' | '已退回' | '不适用'; note: string }) => {
    if (!active) return
    try {
      const { data } = await axios.post<Issue>(`/api/issues/${active.key}/review`, { ...values, actor: user, role })
      updateIssue(data)
      setActive(data)
      form.resetFields()
      message.success(`复测结果已记录：${values.result}`)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        message.error(error.response.data.message)
      } else {
        message.error('复测提交失败')
      }
    }
  }

  const columns: ColumnsType<Issue> = [
    { title: '问题', dataIndex: 'key', render: (_, record) => <div><Typography.Text strong>{record.key}</Typography.Text><div>{record.title}</div></div> },
    { title: '修复说明', dataIndex: 'fixNote', width: 260, render: (value) => value ?? '未提交' },
    {
      title: '环境', dataIndex: 'retestEnv', width: 220,
      render: (value, record) => (
        <div>
          {value ?? '待开发提交'}
          {value && (
            <div>{isEnvExpired(record) ? <Tag color="red">已过期 {record.retestEnvExpiresAt}</Tag> : <Tag color="green">有效期至 {record.retestEnvExpiresAt ?? '未设置'}</Tag>}</div>
          )}
        </div>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value) => <Tag color={value === '已退回' ? 'error' : 'orange'}>{value}</Tag> },
  ]

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">RETEST / 复测工作台</p>
          <h1>逐项验证修复结果</h1>
          <p className="muted">复测必须记录环境和结论；退回的问题不可无痕跳过。</p>
        </div>
        <Tag color="orange">{queue.length} 项待复测</Tag>
      </div>

      {!allowed && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`当前身份为「${role}」，无权提交复测结论`}
          description="复测结论只能由复测员判定，负责人也不能代判。请在左侧切换为复测员身份后再操作。"
        />
      )}

      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="复测规则" description="键盘问题必须覆盖 Tab、Shift+Tab、Esc 和焦点返回；屏幕阅读器问题需保留截图或播报日志。" />

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
                <Descriptions.Item label="修复说明">{active.fixNote ?? '未提交'}</Descriptions.Item>
                <Descriptions.Item label="复测环境">
                  <Space direction="vertical" size={4}>
                    <span>{active.retestEnv ?? '待开发提交'}</span>
                    {active.retestEnv && (envExpired ? <Tag color="red">环境已过期（{active.retestEnvExpiresAt}）</Tag> : <Tag color="green">有效期至 {active.retestEnvExpiresAt ?? '未设置'}</Tag>)}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              {envExpired && (
                <Alert type="error" showIcon style={{ marginTop: 12 }} message="复测环境已过期" description="过期的环境不得据此下结论，需开发重新提交修复说明与有效环境。" />
              )}
              <Form form={form} layout="vertical" style={{ marginTop: 18 }} onFinish={submit} initialValues={{ result: '已通过' }} disabled={!allowed || envExpired || envMissing}>
                <Form.Item name="result" label="复测结论" rules={[{ required: true }]}>
                  <Radio.Group><Radio.Button value="已通过">通过</Radio.Button><Radio.Button value="已退回">退回</Radio.Button><Radio.Button value="不适用">不适用</Radio.Button></Radio.Group>
                </Form.Item>
                <Form.Item label="本次复测环境">
                  <Typography.Text type={envExpired ? 'danger' : undefined}>{active.retestEnv ?? '待开发提交后此处自动带入'}</Typography.Text>
                </Form.Item>
                <Form.Item name="note" label="复测记录" rules={[{ required: true, message: '请填写可验证的复测记录' }]}><Input.TextArea rows={5} placeholder="记录实际操作、结果与证据位置" /></Form.Item>
                <Button type="primary" htmlType="submit" block disabled={!allowed || envExpired || envMissing}>
                  {allowed ? '提交复测记录' : `仅复测员可判定（当前：${role}）`}
                </Button>
              </Form>
              <Typography.Title level={5} style={{ marginTop: 20 }}>历史复测</Typography.Title>
              {active.retestRecords.length === 0 && <Typography.Text type="secondary">暂无历史记录</Typography.Text>}
              {active.retestRecords.map((record) => (
                <div className="timeline-item" key={record.id}>
                  <Space size={6}>
                    <Tag color={record.result === '通过' ? 'success' : record.result === '退回' ? 'error' : 'default'}>{record.result}</Tag>
                    {record.invalidated && <Tag color="red">已失效</Tag>}
                    <Typography.Text strong>{record.actor}</Typography.Text>
                    {record.actorRole && <Tag>{record.actorRole}</Tag>}
                  </Space>
                  <div>{record.note}</div>
                  {record.invalidated && <Typography.Text type="danger" style={{ fontSize: 12 }}>{record.invalidReason}</Typography.Text>}
                  <div><Typography.Text type="secondary" style={{ fontSize: 11 }}>{record.at}{record.evidenceHash ? ` · 证据 ${record.evidenceHash}` : ''}</Typography.Text></div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
