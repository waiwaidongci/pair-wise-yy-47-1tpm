import { useState } from 'react'
import { Alert, Button, Checkbox, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { DownloadOutlined, FilePdfOutlined, StopOutlined } from '@ant-design/icons'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { useSessionStore } from '../store/useSessionStore'
import { permissions } from '../api/directory'
import { computeBlockers } from '../utils/blockers'

export default function ReportPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const role = useSessionStore((state) => state.role)
  const canExport = permissions.canExport(role)
  const [site, setSite] = useState('全部站点')
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const [includeHistory, setIncludeHistory] = useState(true)
  const visible = issues.filter((item) => site === '全部站点' || item.site === site)

  // 导出前阻塞项：缺复测员判定、环境过期、待重算的问题不得进入整改报告
  const blockers = computeBlockers(visible)
  const blockedKeys = new Set(blockers.map((blocker) => blocker.key))
  const exportable = visible.filter((issue) => !blockedKeys.has(issue.key))

  const writeCsv = () => {
    const rows = [
      ['编号', '站点', '版本', '问题', 'WCAG', '影响', '状态', '团队', '负责人', '截止日期'],
      ...exportable.map((issue) => [issue.key, issue.site, issue.version, issue.title, issue.wcag.join(' / '), issue.impact, issue.status, issue.team, issue.owner, issue.dueDate]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `无障碍整改报告-${site}.csv`
    link.click()
    URL.revokeObjectURL(url)
    message.success(`报告已导出（${exportable.length} 项，已排除 ${blockers.length} 项阻塞项）`)
  }

  const exportCsv = () => {
    if (!canExport) {
      message.warning(`当前角色「${role}」无导出权限，仅审核员与负责人可导出整改报告`)
      return
    }
    if (!blockers.length) {
      writeCsv()
      return
    }
    Modal.confirm({
      title: `发现 ${blockers.length} 项阻塞项`,
      icon: <StopOutlined />,
      width: 520,
      content: (
        <div>
          <p>以下问题缺复测员判定或环境已过期，将被排除在本次报告之外：</p>
          <ul style={{ paddingLeft: 18 }}>
            {blockers.map((blocker) => (
              <li key={blocker.key} style={{ marginBottom: 6 }}>
                <strong>{blocker.key}</strong> {blocker.title}
                <div style={{ color: '#b84f32', fontSize: 12 }}>{blocker.reasons.join('；')}</div>
              </li>
            ))}
          </ul>
        </div>
      ),
      okText: `排除阻塞项并导出（${exportable.length} 项）`,
      cancelText: '取消',
      onOk: writeCsv,
    })
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">REPORT / 整改报告</p>
          <h1>可追溯的站点整改报告</h1>
          <p className="muted">按站点、版本和状态汇总问题，保留证据链接与流转记录。</p>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>导出 CSV</Button>
          <Button type="primary" icon={<FilePdfOutlined />} onClick={() => (canExport ? window.print() : message.warning(`当前角色「${role}」无导出权限`))}>打印 / PDF</Button>
        </Space>
      </div>

      {blockers.length > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<StopOutlined />}
          style={{ marginBottom: 14 }}
          message={`${blockers.length} 项阻塞项不会进入整改报告`}
          description="缺复测员判定、复测环境过期或待重算的问题已被拦截，请先完成复测或由开发更新环境。"
        />
      )}

      <div className="panel" style={{ padding: 12, marginBottom: 14 }}>
        <Space wrap>
          <span>报告范围</span>
          <Select value={site} onChange={setSite} style={{ width: 150 }} options={['全部站点', ...new Set(issues.map((item) => item.site))].map((value) => ({ value }))} />
          <Checkbox checked={includeEvidence} onChange={(event) => setIncludeEvidence(event.target.checked)}>包含证据链接</Checkbox>
          <Checkbox checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)}>包含操作历史</Checkbox>
        </Space>
      </div>

      {blockers.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head"><h3>阻塞项（不进入报告）</h3><Tag color="error">{blockers.length} 项</Tag></div>
          <Table
            rowKey="key"
            dataSource={blockers}
            pagination={false}
            size="small"
            columns={[
              { title: '编号', dataIndex: 'key', width: 110, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
              { title: '问题', dataIndex: 'title' },
              { title: '阻塞原因', dataIndex: 'reasons', width: 320, render: (reasons: string[]) => <Space direction="vertical" size={2}>{reasons.map((reason) => <Tag key={reason} color="red">{reason}</Tag>)}</Space> },
            ]}
          />
        </div>
      )}

      <article className="panel report-sheet">
        <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #173e4d', paddingBottom: 16 }}>
          <div><Typography.Text type="secondary">数字体验无障碍治理项目</Typography.Text><h2>网站无障碍整改报告</h2><Typography.Text>生成日期：2026-10-05 · WCAG 2.2 AA</Typography.Text></div>
          <div style={{ textAlign: 'right' }}><Tag color="blue">{site}</Tag><div>问题 {exportable.length} 项</div><div>通过 {exportable.filter((item) => item.status === '已通过').length} 项</div>{blockers.length > 0 && <div style={{ color: '#b84f32' }}>阻塞 {blockers.length} 项（未纳入）</div>}</div>
        </header>
        <table>
          <thead><tr><th>编号</th><th>页面 / 范围</th><th>问题与 WCAG</th><th>影响</th><th>状态 / 责任</th><th>截止</th></tr></thead>
          <tbody>
            {exportable.map((issue) => (
              <tr key={issue.key}>
                <td>{issue.key}</td>
                <td>{issue.site}<br /><Typography.Text type="secondary">{issue.version}</Typography.Text></td>
                <td><strong>{issue.title}</strong><br />{issue.wcag.join(' / ')}{includeEvidence && <><br /><Typography.Link href={issue.evidence}>查看证据</Typography.Link></>}</td>
                <td><Tag color={issue.impact === '致命' ? 'red' : issue.impact === '严重' ? 'volcano' : 'gold'}>{issue.impact}</Tag></td>
                <td>{issue.status}<br />{issue.team} / {issue.owner}</td>
                <td>{issue.dueDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {includeHistory && <div style={{ marginTop: 20 }}><Typography.Title level={5}>最近操作记录</Typography.Title>{exportable.flatMap((issue) => issue.history.slice(-1).map((event) => <div className="timeline-item" key={`${issue.key}-${event.at}`}><strong>{issue.key} · {event.action}</strong><div>{event.detail}</div><span className="muted">{event.actor}{event.actorRole ? ` / ${event.actorRole}` : ''} · {event.at}</span></div>))}</div>}
      </article>
    </section>
  )
}
