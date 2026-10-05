import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilterOutlined, MergeCellsOutlined, SaveOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import type { Issue } from '../api/types'

const impactColor: Record<string, string> = { 致命: 'red', 严重: 'volcano', 中等: 'gold', 轻微: 'blue' }
const statusColor: Record<string, string> = { 待分配: 'default', 修复中: 'processing', 待复测: 'orange', 已通过: 'success', 已退回: 'error', 不适用: 'default' }

export default function IssuesPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const currentRole = useWorkspaceStore((state) => state.currentRole)
  const selectedKeys = useWorkspaceStore((state) => state.selectedKeys)
  const setSelectedKeys = useWorkspaceStore((state) => state.setSelectedKeys)
  const savedFilters = useWorkspaceStore((state) => state.savedFilters)
  const saveFilter = useWorkspaceStore((state) => state.saveFilter)
  const removeFilter = useWorkspaceStore((state) => state.removeFilter)
  const mergeIssues = useWorkspaceStore((state) => state.mergeIssues)
  const bulkAssign = useWorkspaceStore((state) => state.bulkAssign)
  const submitFixNote = useWorkspaceStore((state) => state.submitFixNote)
  const [filters, setFilters] = useState({ query: '', site: '', status: '', priority: '' })
  const [detail, setDetail] = useState<Issue | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [fixNoteOpen, setFixNoteOpen] = useState(false)
  const [fixNoteTarget, setFixNoteTarget] = useState<Issue | null>(null)
  const [form] = Form.useForm()
  const [fixForm] = Form.useForm()

  const data = useMemo(
    () =>
      issues.filter(
        (issue) =>
          (!filters.query || `${issue.key}${issue.title}${issue.rootCause}`.toLowerCase().includes(filters.query.toLowerCase())) &&
          (!filters.site || issue.site === filters.site) &&
          (!filters.status || issue.status === filters.status) &&
          (!filters.priority || issue.priority === filters.priority),
      ),
    [issues, filters],
  )

  const columns: ColumnsType<Issue> = [
    {
      title: '问题',
      dataIndex: 'title',
      width: 290,
      render: (_, record) => (
        <div><Typography.Text strong>{record.key}</Typography.Text><div>{record.title}</div><Typography.Text type="secondary" style={{ fontSize: 11 }}>{record.wcag.join(' / ')}</Typography.Text></div>
      ),
    },
    { title: '站点 / 版本', dataIndex: 'site', width: 130, render: (_, record) => <div>{record.site}<br /><Typography.Text type="secondary">{record.version}</Typography.Text></div> },
    { title: '影响', dataIndex: 'impact', width: 86, render: (value) => <Tag color={impactColor[value]}>{value}</Tag> },
    { title: '根因', dataIndex: 'rootCause', width: 220, render: (value) => <span className="root-cause" title={value}>{value}</span> },
    { title: '优先级', dataIndex: 'priority', width: 76, render: (value) => <Tag>{value}</Tag> },
    { title: '团队 / 负责人', dataIndex: 'team', width: 160, render: (_, record) => <div>{record.team}<br /><Typography.Text type="secondary">{record.owner}</Typography.Text></div> },
    { title: '状态', dataIndex: 'status', width: 95, render: (value) => <Tag color={statusColor[value]}>{value}</Tag> },
    { title: '截止', dataIndex: 'dueDate', width: 105 },
    { title: '', width: 76, fixed: 'right', render: (_, record) => <Button type="link" onClick={() => setDetail(record)}>详情</Button> },
  ]

  const applyFilter = () => {
    const input = window.prompt('筛选方案名称')
    if (input?.trim()) {
      saveFilter({ name: input.trim(), ...filters })
      message.success('筛选条件已保存')
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">ISSUE LEDGER / 问题台账</p>
          <h1>问题流转与批量处理</h1>
          <p className="muted">筛选条件可复用；选择多条问题后可合并同根因项或批量指派。</p>
        </div>
        <Space>
          <Button icon={<MergeCellsOutlined />} disabled={selectedKeys.length < 2} onClick={() => setMergeOpen(true)}>合并重复问题</Button>
          <Button
            icon={<ToolOutlined />}
            disabled={currentRole !== '开发' || selectedKeys.length !== 1}
            title={currentRole !== '开发' ? '仅开发可提交修复说明' : undefined}
            onClick={() => {
              const target = issues.find((item) => item.key === selectedKeys[0]) ?? null
              setFixNoteTarget(target)
              fixForm.setFieldsValue({ fixNote: target?.fixNote, environment: target?.retestEnv, envVersion: target?.retestEnvVersion, envDate: target?.retestEnvAt ? dayjs(target.retestEnvAt) : undefined })
              setFixNoteOpen(true)
            }}
          >
            提交修复说明
          </Button>
          <Button
            type="primary"
            icon={<TeamOutlined />}
            disabled={currentRole !== '负责人' || !selectedKeys.length}
            title={currentRole !== '负责人' ? '仅负责人可批量分配' : undefined}
            onClick={() => setAssignOpen(true)}
          >
            批量分配
          </Button>
        </Space>
      </div>

      <div className="toolbar panel">
        <Input.Search placeholder="搜索编号、标题或根因" allowClear style={{ width: 270 }} value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
        <Select placeholder="站点" allowClear style={{ width: 130 }} value={filters.site || undefined} onChange={(value) => setFilters({ ...filters, site: value ?? '' })} options={[...new Set(issues.map((item) => item.site))].map((value) => ({ value }))} />
        <Select placeholder="状态" allowClear style={{ width: 120 }} value={filters.status || undefined} onChange={(value) => setFilters({ ...filters, status: value ?? '' })} options={['待分配', '修复中', '待复测', '已通过', '已退回', '不适用'].map((value) => ({ value }))} />
        <Select placeholder="优先级" allowClear style={{ width: 110 }} value={filters.priority || undefined} onChange={(value) => setFilters({ ...filters, priority: value ?? '' })} options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value }))} />
        <Button icon={<SaveOutlined />} onClick={applyFilter}>保存筛选</Button>
        <span className="spacer" />
        <Typography.Text type="secondary">已选 {selectedKeys.length} 条 · 共 {data.length} 条</Typography.Text>
      </div>

      <div className="panel">
        <div className="saved-filters">
          <FilterOutlined />
          {savedFilters.map((filter) => (
            <Tag key={filter.id} closable onClose={(event) => { event.preventDefault(); removeFilter(filter.id) }} onClick={() => setFilters({ query: filter.query, site: filter.site, status: filter.status, priority: filter.priority })} style={{ cursor: 'pointer' }}>
              {filter.name}
            </Tag>
          ))}
        </div>
        <div className="table-wrap">
          <Table
            rowKey="key"
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as string[]) }}
            scroll={{ x: 1250 }}
          />
        </div>
      </div>

      <Drawer title={detail ? `${detail.key} · ${detail.title}` : ''} open={Boolean(detail)} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Space wrap><Tag color={impactColor[detail.impact]}>{detail.impact}</Tag><Tag>{detail.priority}</Tag><Tag color={statusColor[detail.status]}>{detail.status}</Tag></Space>
            <dl className="detail-list">
              <dt>创建人</dt><dd>{detail.createdBy ? `${detail.createdBy}${detail.createdByRole ? ` / ${detail.createdByRole}` : ''}` : '—'}</dd>
              <dt>站点版本</dt><dd>{detail.site} / {detail.version}</dd>
              <dt>WCAG</dt><dd>{detail.wcag.join('、')}</dd>
              <dt>影响范围</dt><dd>{detail.affected}</dd>
              <dt>复现条件</dt><dd>{detail.reproduction}</dd>
              <dt>证据链接</dt><dd><Typography.Link href={detail.evidence} target="_blank">{detail.evidence}</Typography.Link></dd>
              <dt>根因</dt><dd>{detail.rootCause}</dd>
              <dt>关联重复</dt><dd>{detail.mergedKeys.length ? detail.mergedKeys.join('、') : '无'}</dd>
              <dt>修复说明</dt><dd>{detail.fixNote ?? '开发尚未提交'}{detail.fixer ? `（${detail.fixer} 提交）` : ''}</dd>
              <dt>复测环境</dt><dd>{detail.retestEnv ?? '待开发提交'}{detail.retestEnvVersion ? ` · ${detail.retestEnvVersion}` : ''}{detail.retestEnvAt ? ` · ${detail.retestEnvAt}` : ''}</dd>
              <dt>复测员</dt><dd>{detail.retester ?? '未指定'}</dd>
              <dt>对账状态</dt><dd>{detail.reconcileStatus === 'version_mismatch' ? <Tag color="red">版本不匹配，已重算</Tag> : detail.reconcileStatus === 'hash_changed' ? <Tag color="red">证据已变更，结论失效</Tag> : detail.reconcileStatus === 'ok' ? <Tag color="green">对账一致</Tag> : '未对账'}</dd>
            </dl>
            <div>
              <Typography.Title level={5}>复测记录</Typography.Title>
              {detail.retestRecords.length === 0 && <Typography.Text type="secondary">暂无复测记录</Typography.Text>}
              {detail.retestRecords.map((record) => (
                <div className="timeline-item" key={record.id}>
                  <Space><Tag color={record.result === '通过' ? 'success' : record.result === '退回' ? 'error' : 'default'}>{record.result}</Tag>{record.valid === false && <Tag color="warning">已失效{record.invalidReason ? `：${record.invalidReason}` : ''}</Tag>}</Space>
                  <div>{record.note}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{record.actor}{record.actorRole ? ` / ${record.actorRole}` : ''} · {record.at}{record.evidenceHash ? ` · 证据 ${record.evidenceHash}` : ''}</Typography.Text>
                </div>
              ))}
            </div>
            <div>
              <Typography.Title level={5}>操作历史</Typography.Title>
              {detail.history.map((event, index) => <div className="timeline-item" key={index}><Typography.Text strong>{event.action}</Typography.Text><div>{event.detail}</div><Typography.Text type="secondary" style={{ fontSize: 11 }}>{event.actor} · {event.at}</Typography.Text></div>)}
            </div>
          </Space>
        )}
      </Drawer>

      <Modal title="批量分配整改项" open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={() => form.submit()} okText="确认分配">
        <Form form={form} layout="vertical" onFinish={async (values) => {
          try {
            await bulkAssign(selectedKeys, values.team, values.owner, values.dueDate.format('YYYY-MM-DD'), values.priority)
            message.success(`已分配 ${selectedKeys.length} 条问题`)
            setSelectedKeys([])
            setAssignOpen(false)
          } catch (error) {
            message.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '分配失败')
          }
        }}>
          <Form.Item name="team" label="目标团队" rules={[{ required: true }]}><Select options={['前端基础组件组', '结算体验组', '数据可视化组', '供应链前端组'].map((value) => ({ value }))} /></Form.Item>
          <Form.Item name="owner" label="负责人" rules={[{ required: true }]}><Input placeholder="输入负责人姓名" /></Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select style={{ width: 140 }} options={['P0', 'P1', 'P2', 'P3'].map((value) => ({ value }))} /></Form.Item>
            <Form.Item name="dueDate" label="截止日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal title="合并为同一整改项" open={mergeOpen} onCancel={() => setMergeOpen(false)} onOk={() => { mergeIssues(selectedKeys); setMergeOpen(false); message.success('问题已按根因合并，子项仍可追溯') }} okText="确认合并">
        <Typography.Paragraph>将以 <Typography.Text code>{selectedKeys[0]}</Typography.Text> 为主问题，其余 {selectedKeys.length - 1} 项保留历史并关联到该主问题。</Typography.Paragraph>
        <Space wrap>{selectedKeys.map((key) => <Tag key={key}>{key}</Tag>)}</Space>
      </Modal>

      <Modal
        title={`提交修复说明 · ${fixNoteTarget?.key ?? ''}`}
        open={fixNoteOpen}
        onCancel={() => setFixNoteOpen(false)}
        onOk={() => fixForm.submit()}
        okText="提交修复说明"
      >
        <Typography.Paragraph type="secondary">开发仅提交修复说明与复测环境；复测结论由复测员判定。</Typography.Paragraph>
        <Form form={fixForm} layout="vertical" onFinish={async (values) => {
          if (!fixNoteTarget) return
          try {
            await submitFixNote(fixNoteTarget.key, values.fixNote, values.environment, values.envVersion, values.envDate.format('YYYY-MM-DD'))
            message.success('修复说明已提交，状态流转为待复测')
            setFixNoteOpen(false)
            setSelectedKeys([])
          } catch (error) {
            message.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '提交失败')
          }
        }}>
          <Form.Item name="fixNote" label="修复说明" rules={[{ required: true, message: '请填写修复说明' }]}><Input.TextArea rows={3} placeholder="说明修复方式与改动点" /></Form.Item>
          <Form.Item name="environment" label="复测环境" rules={[{ required: true, message: '请填写复测环境' }]}><Input placeholder="浏览器 / 辅助技术 / 版本号" /></Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="envVersion" label="环境版本" rules={[{ required: true, message: '请填写环境版本' }]}><Input placeholder="如 v4.18" /></Form.Item>
            <Form.Item name="envDate" label="环境日期" rules={[{ required: true, message: '请选择环境日期' }]}><DatePicker /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </section>
  )
}
