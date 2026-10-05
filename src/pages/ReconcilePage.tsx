import { useState } from 'react'
import { Alert, Button, Checkbox, InputNumber, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlayCircleOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import axios from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useIssues } from '../api/useIssues'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import type { EvidenceRecord, Issue, ReconcileBatchResponse } from '../api/types'

type BatchStatus = '待核对' | '核对中' | '成功' | '沿用首次结果' | '失败'

type Batch = {
  id: string
  site: string
  keys: string[]
  status: BatchStatus
  attempts: number
  items?: ReconcileBatchResponse['items']
  error?: string
}

const DEFAULT_CAPACITY = 2

/** 按站点容量分批：批次号由站点与成员决定，重复批次可沿用首次结果 */
const buildBatches = (issues: Issue[], capacity: Record<string, number>): Batch[] =>
  [...new Set(issues.map((issue) => issue.site))].flatMap((site) => {
    const keys = issues.filter((issue) => issue.site === site).map((issue) => issue.key)
    const size = Math.max(1, capacity[site] ?? DEFAULT_CAPACITY)
    const batches: Batch[] = []
    for (let index = 0; index < keys.length; index += size) {
      const chunk = keys.slice(index, index + size)
      batches.push({ id: `${site}::${[...chunk].sort().join('+')}`, site, keys: chunk, status: '待核对', attempts: 0 })
    }
    return batches
  })

const batchStatusColor: Record<BatchStatus, string> = { 待核对: 'default', 核对中: 'processing', 成功: 'success', 沿用首次结果: 'cyan', 失败: 'error' }

export default function ReconcilePage() {
  useIssues()
  const issues = useWorkspaceStore((state) => state.issues)
  const queryClient = useQueryClient()
  const sites = [...new Set(issues.map((issue) => issue.site))]
  const [capacity, setCapacity] = useState<Record<string, number>>({})
  const [batches, setBatches] = useState<Batch[]>([])
  const [running, setRunning] = useState(false)
  const [rotateKey, setRotateKey] = useState<string>()
  const [bumpVersion, setBumpVersion] = useState(false)

  const evidenceQuery = useQuery({
    queryKey: ['evidence'],
    queryFn: async () => (await axios.get<EvidenceRecord[]>('/api/evidence')).data,
  })
  const evidence = evidenceQuery.data ?? []

  const patchBatch = (id: string, patch: Partial<Batch>) =>
    setBatches((current) => current.map((batch) => (batch.id === id ? { ...batch, ...patch } : batch)))

  const generate = () => {
    setBatches(buildBatches(issues, capacity))
    message.info('已按站点容量生成核对批次')
  }

  const runBatches = async (targets: Batch[]) => {
    if (!targets.length) return
    setRunning(true)
    for (const batch of targets) {
      patchBatch(batch.id, { status: '核对中', attempts: batch.attempts + 1, error: undefined })
      try {
        const { data } = await axios.post<ReconcileBatchResponse>('/api/reconcile/batch', { batchId: batch.id, site: batch.site, keys: batch.keys })
        patchBatch(batch.id, { status: data.reused ? '沿用首次结果' : '成功', items: data.items })
      } catch {
        // 失败不写结果，整批保留待重试
        patchBatch(batch.id, { status: '失败', error: '证据服务暂时不可用，整批保留待重试' })
      }
    }
    setRunning(false)
    await queryClient.invalidateQueries({ queryKey: ['issues'] })
    await queryClient.invalidateQueries({ queryKey: ['evidence'] })
  }

  const rotateEvidence = async () => {
    if (!rotateKey) return
    const { data } = await axios.post<{ evidence: EvidenceRecord; invalidated: boolean }>(`/api/evidence/${rotateKey}/rotate`, { bumpVersion })
    await queryClient.invalidateQueries({ queryKey: ['issues'] })
    await queryClient.invalidateQueries({ queryKey: ['evidence'] })
    if (data.invalidated) {
      message.warning(`${rotateKey} 证据已变更（${data.evidence.hash}），相关复测结论立即失效`)
    } else {
      message.success(`${rotateKey} 证据已变更（${data.evidence.hash}）`)
    }
  }

  const failed = batches.filter((batch) => batch.status === '失败')
  const pending = batches.filter((batch) => batch.status === '待核对' || batch.status === '失败')

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">EVIDENCE RECONCILE / 证据对账</p>
          <h1>与外部证据分批核对</h1>
          <p className="muted">按站点容量分批核对；版本对不上就重算，证据一变结论立即失效；失败批次整批保留重试，重复批次沿用首次结果。</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={generate}>生成核对批次</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} disabled={!pending.length || running} loading={running} onClick={() => runBatches(pending)}>
            开始核对 {pending.length ? `(${pending.length})` : ''}
          </Button>
          <Button danger icon={<ThunderboltOutlined />} disabled={!failed.length || running} onClick={() => runBatches(failed)}>
            重试失败批次 {failed.length ? `(${failed.length})` : ''}
          </Button>
        </Space>
      </div>

      <div className="reconcile-grid">
        <div className="panel">
          <div className="panel-head"><h3>站点容量</h3><span className="muted">每批最多核对条数</span></div>
          <div style={{ padding: 14, display: 'grid', gap: 10 }}>
            {sites.map((site) => (
              <div key={site} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Typography.Text>{site}</Typography.Text>
                <InputNumber min={1} max={10} value={capacity[site] ?? DEFAULT_CAPACITY} onChange={(value) => setCapacity((current) => ({ ...current, [site]: value ?? DEFAULT_CAPACITY }))} />
              </div>
            ))}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>调整容量后需重新生成批次。</Typography.Text>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>核对批次</h3><span className="muted">{batches.length ? `共 ${batches.length} 批` : '请先生成批次'}</span></div>
          <Table
            rowKey="id"
            dataSource={batches}
            pagination={false}
            scroll={{ x: 720 }}
            columns={[
              { title: '批次', dataIndex: 'id', width: 250, render: (value: string, record) => <div><Typography.Text code>{value}</Typography.Text><div><Typography.Text type="secondary" style={{ fontSize: 11 }}>容量内 {record.keys.length} 条 · 第 {record.attempts} 次尝试</Typography.Text></div></div> },
              { title: '问题', dataIndex: 'keys', render: (keys: string[]) => <Space wrap size={4}>{keys.map((key) => <Tag key={key}>{key}</Tag>)}</Space> },
              { title: '状态', dataIndex: 'status', width: 120, render: (value: BatchStatus) => <Tag color={batchStatusColor[value]}>{value}</Tag> },
              {
                title: '核对结果', dataIndex: 'items', width: 300,
                render: (items: Batch['items'], record) => {
                  if (record.status === '失败') return <Typography.Text type="danger">{record.error}</Typography.Text>
                  if (!items) return <span className="muted">—</span>
                  return (
                    <Space direction="vertical" size={2}>
                      {items.map((item) => (
                        <span key={item.key}>
                          <Typography.Text strong>{item.key}</Typography.Text>{' '}
                          {item.versionMatch ? <Tag color="green">版本一致</Tag> : <Tag color="volcano">版本不符 · 需重算</Tag>}
                          {item.evidenceChanged && <Tag color="red">证据变更 · 结论失效</Tag>}
                        </span>
                      ))}
                    </Space>
                  )
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head"><h3>外部证据登记</h3><span className="muted">证据一变，相关结论立即失效</span></div>
        <Table
          rowKey="issueKey"
          dataSource={evidence}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            { title: '问题', dataIndex: 'issueKey', width: 110, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
            { title: '证据版本', dataIndex: 'version', width: 110 },
            {
              title: '版本对账', width: 130,
              render: (_, record) => {
                const issue = issues.find((item) => item.key === record.issueKey)
                if (!issue) return '—'
                return record.version === issue.version ? <Tag color="green">一致</Tag> : <Tag color="volcano">{issue.version} → 需重算</Tag>
              },
            },
            { title: '证据哈希', dataIndex: 'hash', width: 170, render: (value) => <Typography.Text code>{value}</Typography.Text> },
            { title: '更新时间', dataIndex: 'updatedAt', width: 110 },
            {
              title: '台账状态', width: 150,
              render: (_, record) => {
                const issue = issues.find((item) => item.key === record.issueKey)
                if (!issue) return '—'
                return <Space size={4}><Tag>{issue.status}</Tag>{issue.needsRecalc && <Tag color="volcano">需重算</Tag>}</Space>
              },
            },
          ]}
        />
        <div style={{ padding: 14, borderTop: '1px solid #e7ecee' }}>
          <Alert
            type="warning"
            showIcon
            message="模拟外部证据变更"
            description="选择问题后变更证据（可选同时升版本），系统将立即使基于旧证据的复测结论失效。"
            style={{ marginBottom: 10 }}
          />
          <Space wrap>
            <Select placeholder="选择问题" style={{ width: 260 }} value={rotateKey} onChange={setRotateKey} options={issues.map((issue) => ({ value: issue.key, label: `${issue.key} · ${issue.title}` }))} />
            <Checkbox checked={bumpVersion} onChange={(event) => setBumpVersion(event.target.checked)}>同时升级证据版本</Checkbox>
            <Button danger disabled={!rotateKey} onClick={rotateEvidence}>变更证据</Button>
          </Space>
        </div>
      </div>
    </section>
  )
}
