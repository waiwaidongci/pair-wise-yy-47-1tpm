import { useMemo, useState } from 'react'
import axios from 'axios'
import dayjs from 'dayjs'
import {
  Alert,
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
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilterOutlined, MergeCellsOutlined, SaveOutlined, TeamOutlined, ToolOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { useSessionStore } from '../store/useSessionStore'
import { permissions } from '../api/directory'
import { isEnvExpired, today } from '../utils/blockers'
import type { Issue } from '../api/types'

const impactColor: Record<string, string> = { 致命: 'red', 严重: 'volcano', 中等: 'gold', 轻微: 'blue' }
const statusColor: Record<string, string> = { 待分配: 'default', 修复中: 'processing', 待复测: 'orange', 已通过: 'success', 已退回: 'error', 不适用: 'default' }

export default function IssuesPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const selectedKeys = useWorkspaceStore((state) => state.selectedKeys)
  const setSelectedKeys = useWorkspaceStore((state) => state.setSelectedKeys)
  const savedFilters = useWorkspaceStore((state) => state.savedFilters)
  const saveFilter = useWorkspaceStore((state) => state.saveFilter)
  const removeFilter = useWorkspaceStore((state) => state.removeFilter)
  const mergeIssues = useWorkspaceStore((state) => state.mergeIssues)
  const user = useSessionStore((state) => state.user)
  const role = useSessionStore((state) => state.role)
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ query: '', site: '', status: '', priority: '' })
  const [detail, setDetail] = useState<Issue | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)
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
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: (value, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={statusColor[value]}>{value}</Tag>
          {record.needsRecalc && <Tag color="volcano">需重算</Tag>}
        </Space>
      ),
    },
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

  const submitFix = async (values: { fixNote: string; retestEnv: string; retestEnvExpiresAt: dayjs.Dayjs }) => {
    if (!detail) return
    try {
      await axios.post(`/api/issues/${detail.key}/fix`, {
        fixNote: values.fixNote,
        retestEnv: values.retestEnv,
        retestEnvExpiresAt: values.retestEnvExpiresAt.format('YYYY-MM-DD'),
        actor: user,
        role,
      })
      message.success(`${detail.key} 修复说明已提交，流转至待复测`)
      setFixOpen(false)
      setDetail(null)
      fixForm.resetFields()
      await queryClient.invalidateQueries({ queryKey: ['issues'] })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        message.error(error.response.data.message)
      } else {
        message.error('提交失败')
      }
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
          <Tooltip title={permissions.canMerge(role) ? '' : `当前角色「${role}」无合并权限`}>
            <Button icon={<MergeCellsOutlined />} disabled={selectedKeys.length < 2 || !permissions.canMerge(role)} onClick={() => setMergeOpen(true)}>合并重复问题</Button>
          </Tooltip>
          <Tooltip title={permissions.canAssign(role) ? '' : `当前角色「${role}」无分配权限`}>
            <Button type="primary" icon={<TeamOutlined />} disabled={!selectedKeys.length || !permissions.canAssign(role)} onClick={() => setAssignOpen(true)}>批量分配</Button>
          </Tooltip>
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
            <Space wrap>
              <Tag color={impactColor[detail.impact]}>{detail.impact}</Tag>
              <Tag>{detail.priority}</Tag>
              <Tag color={statusColor[detail.status]}>{detail.status}</Tag>
              {detail.needsRecalc && <Tag color="volcano">证据版本不一致 · 需重算</Tag>}
              {detail.retestEnv && isEnvExpired(detail) && <Tag color="red">环境已过期</Tag>}
            </Space>
            {detail.needsRecalc && (
              <Alert type="warning" showIcon message="对账发现证据版本与台账版本不一致" description="需按新证据重算后再进入复测与报告流程。" />
            )}
            <dl className="detail-list">
              <dt>站点版本</dt><dd>{detail.site} / {detail.version}</dd>
              <dt>WCAG</dt><dd>{detail.wcag.join('、')}</dd>
              <dt>影响范围</dt><dd>{detail.affected}</dd>
              <dt>复现条件</dt><dd>{detail.reproduction}</dd>
              <dt>证据链接</dt><dd><Typography.Link href={detail.evidence} target="_blank">{detail.evidence}</Typography.Link></dd>
              <dt>根因</dt><dd>{detail.rootCause}</dd>
              <dt>关联重复</dt><dd>{detail.mergedKeys.length ? detail.mergedKeys.join('、') : '无'}</dd>
              <dt>创建人</dt><dd>{detail.createdBy ? `${detail.createdBy}${detail.createdByRole ? ` / ${detail.createdByRole}` : ''}` : '未知（旧数据未升级）'}</dd>
              <dt>修复说明</dt><dd>{detail.fixNote ?? '开发尚未提交'}{detail.fixSubmittedBy ? `（${detail.fixSubmittedBy} 提交）` : ''}</dd>
              <dt>复测环境</dt>
              <dd>
                {detail.retestEnv ?? '待开发提交'}
                {detail.retestEnv && (
                  isEnvExpired(detail)
                    ? <Tag color="red" style={{ marginLeft: 6 }}>已过期 {detail.retestEnvExpiresAt}</Tag>
                    : <Tag color="green" style={{ marginLeft: 6 }}>有效期至 {detail.retestEnvExpiresAt ?? '未设置'}</Tag>
                )}
              </dd>
            </dl>
            {permissions.canSubmitFix(role) ? (
              <Button type="primary" icon={<ToolOutlined />} onClick={() => setFixOpen(true)} block>
                {detail.fixNote ? '重新提交修复说明与环境' : '提交修复说明与环境'}
              </Button>
            ) : (
              <Alert type="info" showIcon message={`修复说明只能由开发角色提交（当前：${role}）`} />
            )}
            <div>
              <Typography.Title level={5}>操作历史</Typography.Title>
              {detail.history.map((event, index) => (
                <div className="timeline-item" key={index}>
                  <Typography.Text strong>{event.action}</Typography.Text>
                  <div>{event.detail}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{event.actor}{event.actorRole ? ` / ${event.actorRole}` : ''} · {event.at}</Typography.Text>
                </div>
              ))}
            </div>
          </Space>
        )}
      </Drawer>

      <Modal title={`提交修复说明 · ${detail?.key ?? ''}`} open={fixOpen} onCancel={() => setFixOpen(false)} onOk={() => fixForm.submit()} okText="提交并流转待复测" destroyOnClose>
        <Form
          form={fixForm}
          layout="vertical"
          preserve={false}
          onFinish={submitFix}
          initialValues={{ fixNote: detail?.fixNote, retestEnv: detail?.retestEnv, retestEnvExpiresAt: detail?.retestEnvExpiresAt ? dayjs(detail.retestEnvExpiresAt) : undefined }}
        >
          <Form.Item name="fixNote" label="修复说明" rules={[{ required: true, message: '请填写修复说明' }]}>
            <Input.TextArea rows={4} placeholder="描述修复方案、涉及组件与自测结果" />
          </Form.Item>
          <Form.Item name="retestEnv" label="复测环境" rules={[{ required: true, message: '请填写复测环境' }]}>
            <Input placeholder="浏览器 / 辅助技术 / 版本号" />
          </Form.Item>
          <Form.Item name="retestEnvExpiresAt" label="环境有效期" rules={[{ required: true, message: '请设置环境有效期' }]} extra="过期后复测员不得据此下结论，该问题也不会进入整改报告。">
            <DatePicker style={{ width: '100%' }} disabledDate={(date) => date.isBefore(dayjs(today()), 'day')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="批量分配整改项" open={assignOpen} onCancel={() => setAssignOpen(false)} onOk={() => form.submit()} okText="确认分配">
        <Form form={form} layout="vertical" onFinish={async (values) => {
          await axios.post('/api/issues/bulk-assign', { keys: selectedKeys, ...values, dueDate: values.dueDate.format('YYYY-MM-DD'), actor: user, role })
          message.success(`已分配 ${selectedKeys.length} 条问题`)
          setSelectedKeys([])
          setAssignOpen(false)
          await queryClient.invalidateQueries({ queryKey: ['issues'] })
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
    </section>
  )
}
