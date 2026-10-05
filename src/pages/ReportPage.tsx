import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Select, Space, Table, Tag, Typography, message } from 'antd'
import { DownloadOutlined, FilePdfOutlined, WarningOutlined } from '@ant-design/icons'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { reportBlockers } from '../utils/remediation'

export default function ReportPage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const evidence = useWorkspaceStore((state) => state.evidence)
  const [site, setSite] = useState('全部站点')
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const [includeHistory, setIncludeHistory] = useState(true)
  const visible = issues.filter((item) => site === '全部站点' || item.site === site)

  const blockers = useMemo(
    () =>
      visible
        .map((issue) => ({ issue, reasons: reportBlockers(issue, evidence) }))
        .filter((item) => item.reasons.length > 0),
    [visible, evidence],
  )
  const blockedKeys = new Set(blockers.map((item) => item.issue.key))
  const exportable = visible.filter((issue) => !blockedKeys.has(issue.key))
  const passedCount = exportable.filter((issue) => issue.status === '已通过').length

  const exportCsv = () => {
    if (blockers.length) {
      message.warning(`${blockers.length} 项阻塞项未纳入导出，请先补复测员或更新环境/证据`)
    }
    const rows = [
      ['编号', '站点', '版本', '问题', 'WCAG', '影响', '状态', '团队', '负责人', '截止日期'],
      ...exportable.map((issue) => [issue.key, issue.site, issue.version, issue.title, issue.wcag.join(' / '), issue.impact, issue.status, issue.team, issue.owner, issue.dueDate]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `无障碍整改报告-${site}.csv`
    link.click()
    URL.revokeObjectURL(url)
    message.success('报告已导出（已剔除阻塞项）')
  }

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">REPORT / 整改报告</p>
          <h1>可追溯的站点整改报告</h1>
          <p className="muted">按站点、版本和状态汇总问题；缺复测员、环境过期或证据对不上的已通过项列入阻塞项，不进报告。</p>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>导出 CSV</Button>
          <Button type="primary" icon={<FilePdfOutlined />} onClick={() => window.print()}>打印 / PDF</Button>
        </Space>
      </div>

      {blockers.length > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 14 }}
          message={`${blockers.length} 项阻塞项未纳入报告导出`}
          description={
            <ul className="blocker-list">
              {blockers.map(({ issue, reasons }) => (
                <li key={issue.key}>
                  <Typography.Text strong>{issue.key}</Typography.Text> {issue.title}
                  <Space size={4} wrap style={{ marginInlineStart: 8 }}>
                    {reasons.map((reason) => <Tag key={reason} color="error">{reason}</Tag>)}
                  </Space>
                </li>
              ))}
            </ul>
          }
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

      <article className="panel report-sheet">
        <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #173e4d', paddingBottom: 16 }}>
          <div><Typography.Text type="secondary">数字体验无障碍治理项目</Typography.Text><h2>网站无障碍整改报告</h2><Typography.Text>生成日期：2026-10-05 · WCAG 2.2 AA</Typography.Text></div>
          <div style={{ textAlign: 'right' }}><Tag color="blue">{site}</Tag><div>问题 {exportable.length} 项</div><div>通过 {passedCount} 项</div>{blockers.length > 0 && <div><Tag color="error">{blockers.length} 项阻塞</Tag></div>}</div>
        </header>
        <Table
          rowKey="key"
          pagination={false}
          dataSource={exportable}
          columns={[
            { title: '编号', dataIndex: 'key', width: 110, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
            { title: '页面 / 范围', dataIndex: 'site', width: 150, render: (_, record) => <>{record.site}<br /><Typography.Text type="secondary">{record.version}</Typography.Text></> },
            {
              title: '问题与 WCAG', dataIndex: 'title',
              render: (_, record) => <><strong>{record.title}</strong><br />{record.wcag.join(' / ')}{includeEvidence && <><br /><Typography.Link href={record.evidence}>查看证据</Typography.Link></>}</>,
            },
            { title: '影响', dataIndex: 'impact', width: 80, render: (value) => <Tag color={value === '致命' ? 'red' : value === '严重' ? 'volcano' : 'gold'}>{value}</Tag> },
            { title: '状态 / 责任', dataIndex: 'status', width: 160, render: (_, record) => <>{record.status}{blockedKeys.has(record.key) && <Tag color="error" style={{ marginInlineStart: 6 }}>阻塞</Tag>}<br />{record.team} / {record.owner}</> },
            { title: '截止', dataIndex: 'dueDate', width: 110 },
          ]}
        />
        {includeHistory && <div style={{ marginTop: 20 }}><Typography.Title level={5}>最近操作记录</Typography.Title>{exportable.flatMap((issue) => issue.history.slice(-1).map((event) => <div className="timeline-item" key={`${issue.key}-${event.at}`}><strong>{issue.key} · {event.action}</strong><div>{event.detail}</div><span className="muted">{event.actor} · {event.at}</span></div>))}</div>}
      </article>
    </section>
  )
}
