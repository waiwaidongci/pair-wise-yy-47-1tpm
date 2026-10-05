import { http, HttpResponse } from 'msw'
import { seedIssues } from './seed'
import type { EvidenceRecord, Issue, ReconcileBatchResponse, ReconcileItemResult, Role } from './types'

let issues = structuredClone(seedIssues)

/** 外部证据登记处：对账基准，证据一变结论立即失效 */
let evidenceRegistry: EvidenceRecord[] = [
  { issueKey: 'A11Y-1048', version: 'v4.18', hash: 'EV-1048-7F3A', updatedAt: '09-22 10:30' },
  { issueKey: 'A11Y-1052', version: 'v4.18', hash: 'EV-1052-9C1B', updatedAt: '09-29 08:50' },
  { issueKey: 'A11Y-1061', version: 'v3.9', hash: 'EV-1061-22D0', updatedAt: '09-22 10:31' },
  { issueKey: 'A11Y-1074', version: 'v2.8', hash: 'EV-1074-B801', updatedAt: '09-27 15:44' },
  { issueKey: 'A11Y-1083', version: 'v1.12', hash: 'EV-1083-4E5F', updatedAt: '09-23 11:02' },
]

/** 证据变更后：基于旧证据（或缺少证据依据）的复测结论立即失效，已通过的问题退回待复测 */
const invalidateConclusions = (issue: Issue, evidence: EvidenceRecord, reason: string) => {
  let changed = false
  issue.retestRecords = issue.retestRecords.map((record) => {
    if (!record.invalidated && record.evidenceHash !== evidence.hash) {
      changed = true
      return { ...record, invalidated: true, invalidReason: reason }
    }
    return record
  })
  if (changed) {
    if (issue.status === '已通过') issue.status = '待复测'
    issue.history.push({ at: '刚刚', actor: '系统', action: '结论失效', detail: reason })
  }
  return changed
}

/** 已完成核对的批次缓存：重复批次沿用首次结果 */
const reconciledBatches = new Map<string, ReconcileBatchResponse>()

export const handlers = [
  http.get('*/api/issues', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')?.toLowerCase() ?? ''
    const status = url.searchParams.get('status') ?? ''
    const site = url.searchParams.get('site') ?? ''
    const filtered = issues.filter((issue) => (!query || `${issue.key}${issue.title}${issue.rootCause}`.toLowerCase().includes(query)) && (!status || issue.status === status) && (!site || issue.site === site))
    return HttpResponse.json(filtered)
  }),

  http.post('*/api/issues/:key/fix', async ({ params, request }) => {
    const issue = issues.find((item) => item.key === params.key)
    const body = (await request.json()) as { fixNote: string; retestEnv: string; retestEnvExpiresAt: string; actor: string; role: Role }
    if (!issue) return new HttpResponse(null, { status: 404 })
    if (body.role !== '开发') {
      return HttpResponse.json({ message: '权限不足：只有开发角色可以提交修复说明' }, { status: 403 })
    }
    issue.fixNote = body.fixNote
    issue.retestEnv = body.retestEnv
    issue.retestEnvExpiresAt = body.retestEnvExpiresAt
    issue.fixSubmittedBy = body.actor
    issue.status = '待复测'
    if (issue.needsRecalc) {
      issue.needsRecalc = false
      issue.history.push({ at: '刚刚', actor: body.actor, actorRole: body.role, action: '完成重算', detail: '已按最新证据重算并重新提交修复说明。' })
    }
    issue.history.push({ at: '刚刚', actor: body.actor, actorRole: body.role, action: '提交修复说明', detail: `${body.fixNote}（环境有效期至 ${body.retestEnvExpiresAt}）` })
    return HttpResponse.json(issue)
  }),

  http.post('*/api/issues/:key/review', async ({ params, request }) => {
    const issue = issues.find((item) => item.key === params.key)
    const body = (await request.json()) as { result: string; note: string; actor: string; role: Role }
    if (!issue) return new HttpResponse(null, { status: 404 })
    if (body.role !== '复测员') {
      return HttpResponse.json({ message: '权限不足：只有复测员可以提交复测结论，负责人也不能代判' }, { status: 403 })
    }
    const today = new Date().toISOString().slice(0, 10)
    if (issue.retestEnvExpiresAt && issue.retestEnvExpiresAt < today) {
      return HttpResponse.json({ message: '复测环境已过期，需开发重新提交环境后再判定' }, { status: 409 })
    }
    const evidence = evidenceRegistry.find((item) => item.issueKey === issue.key)
    issue.status = body.result as Issue['status']
    issue.retestRecords.push({ id: `RT-${Date.now()}`, actor: body.actor, actorRole: body.role, result: body.result, note: body.note, at: '刚刚', evidenceHash: evidence?.hash })
    issue.history.push({ at: '刚刚', actor: body.actor, actorRole: body.role, action: `复测${body.result}`, detail: body.note })
    return HttpResponse.json(issue)
  }),

  http.post('*/api/issues/bulk-assign', async ({ request }) => {
    const body = (await request.json()) as { keys: string[]; team: string; owner: string; dueDate: string; priority: string; actor: string; role: Role }
    issues = issues.map((issue) =>
      body.keys.includes(issue.key)
        ? { ...issue, team: body.team, owner: body.owner, dueDate: body.dueDate, priority: body.priority as Issue['priority'], status: '修复中', history: [...issue.history, { at: '刚刚', actor: body.actor, actorRole: body.role, action: '批量分配', detail: `指派至 ${body.team} / ${body.owner}` }] }
        : issue,
    )
    return HttpResponse.json({ updated: body.keys.length })
  }),

  http.get('*/api/evidence', () => HttpResponse.json(evidenceRegistry)),

  http.post('*/api/evidence/:key/rotate', async ({ params, request }) => {
    const evidence = evidenceRegistry.find((item) => item.issueKey === params.key)
    const issue = issues.find((item) => item.key === params.key)
    if (!evidence || !issue) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { bumpVersion?: boolean }
    evidence.hash = `EV-${issue.key.slice(5)}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`
    evidence.updatedAt = '刚刚'
    if (body.bumpVersion) evidence.version = `${evidence.version}.1`
    const invalidated = invalidateConclusions(issue, evidence, `外部证据已更新（新哈希 ${evidence.hash}），原结论立即失效`)
    return HttpResponse.json({ evidence, issueKey: issue.key, invalidated })
  }),

  http.post('*/api/reconcile/batch', async ({ request }) => {
    const body = (await request.json()) as { batchId: string; site: string; keys: string[] }
    const cached = reconciledBatches.get(body.batchId)
    if (cached) return HttpResponse.json({ ...cached, reused: true })
    // 模拟外部证据服务不稳定：失败时不写缓存，整批保留待重试
    if (Math.random() < 0.35) {
      return HttpResponse.json({ message: '证据服务暂时不可用' }, { status: 503 })
    }
    const items: ReconcileItemResult[] = body.keys.map((key) => {
      const issue = issues.find((item) => item.key === key)
      const evidence = evidenceRegistry.find((item) => item.issueKey === key)
      if (!issue || !evidence) return { key, versionMatch: false, evidenceChanged: false, evidenceHash: '' }
      const versionMatch = evidence.version === issue.version
      if (!versionMatch && !issue.needsRecalc) {
        issue.history.push({ at: '刚刚', actor: '系统', action: '对账需重算', detail: `证据版本 ${evidence.version} 与台账版本 ${issue.version} 不一致，需按新证据重算。` })
      }
      issue.needsRecalc = !versionMatch
      const evidenceChanged = invalidateConclusions(issue, evidence, `对账发现证据哈希已变为 ${evidence.hash}，原结论立即失效`)
      issue.reconcile = { batchId: body.batchId, checkedAt: '刚刚', versionMatch, evidenceHash: evidence.hash }
      return { key, versionMatch, evidenceChanged, evidenceHash: evidence.hash }
    })
    const result: ReconcileBatchResponse = { batchId: body.batchId, site: body.site, items, reused: false, finishedAt: new Date().toISOString() }
    reconciledBatches.set(body.batchId, result)
    return HttpResponse.json(result)
  }),
]

export { issues }
