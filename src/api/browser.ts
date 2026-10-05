import { setupWorker } from 'msw/browser'
import { http, HttpResponse } from 'msw'
import { seedEvidence, seedIssues } from './seed'
import type { EvidenceRecord, Issue, ReconcileBatch, Role } from './types'

let issues: Issue[] = structuredClone(seedIssues)
let evidence: EvidenceRecord[] = structuredClone(seedEvidence)
let batches: ReconcileBatch[] = []

const actorOf = (request: Request, fallback: string) => request.headers.get('x-actor') ?? fallback
const roleOf = (request: Request): Role | null => (request.headers.get('x-role') as Role | null) ?? null

const fingerprintOf = (site: string, keys: string[]) => `${site}|${[...keys].sort().join(',')}`

function findIssue(key: string) {
  return issues.find((item) => item.key === key)
}

export const worker = setupWorker(
  http.get('/api/issues', ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get('query')?.toLowerCase() ?? ''
    const status = url.searchParams.get('status') ?? ''
    const site = url.searchParams.get('site') ?? ''
    const filtered = issues.filter((issue) => (!query || `${issue.key}${issue.title}${issue.rootCause}`.toLowerCase().includes(query)) && (!status || issue.status === status) && (!site || issue.site === site))
    return HttpResponse.json(filtered)
  }),

  http.get('/api/evidence', () => HttpResponse.json(evidence)),

  http.get('/api/batches', () => HttpResponse.json(batches)),

  /** 开发提交修复说明与复测环境（仅开发） */
  http.post('/api/issues/:key/fix-note', async ({ params, request }) => {
    if (roleOf(request) !== '开发') {
      return HttpResponse.json({ error: '仅开发可提交修复说明与复测环境' }, { status: 403 })
    }
    const issue = findIssue(params.key as string)
    if (!issue) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { fixNote: string; environment: string; envVersion: string; envDate: string; actor: string }
    issue.fixNote = body.fixNote
    issue.fixer = actorOf(request, body.actor)
    issue.retestEnv = body.environment
    issue.retestEnvVersion = body.envVersion
    issue.retestEnvAt = body.envDate
    issue.status = '待复测'
    issue.history.push({ at: '刚刚', actor: `${body.actor} / 开发`, action: '提交修复说明', detail: body.fixNote })
    issue.history.push({ at: '刚刚', actor: `${body.actor} / 开发`, action: '提交复测环境', detail: `${body.environment}（${body.envVersion}，${body.envDate}）` })
    return HttpResponse.json(issue)
  }),

  /** 复测判定（仅复测员）：判定时固化证据版本与哈希，证据一变结论立即失效 */
  http.post('/api/issues/:key/review', async ({ params, request }) => {
    if (roleOf(request) !== '复测员') {
      return HttpResponse.json({ error: '仅复测员可判定复测结论，负责人/开发不可替复测员下结论' }, { status: 403 })
    }
    const issue = findIssue(params.key as string)
    if (!issue) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { result: string; note: string; actor: string }
    const ev = evidence.find((item) => item.url === issue.evidence)
    issue.status = body.result as Issue['status']
    issue.retester = body.actor
    issue.retestRecords.push({
      id: `RT-${Date.now()}`,
      actor: body.actor,
      actorRole: '复测员',
      result: body.result,
      note: body.note,
      at: '刚刚',
      evidenceVersion: ev?.version,
      evidenceHash: ev?.hash,
      valid: true,
    })
    issue.history.push({ at: '刚刚', actor: `${body.actor} / 复测员`, action: `复测${body.result}`, detail: body.note })
    return HttpResponse.json(issue)
  }),

  /** 批量分配（仅负责人） */
  http.post('/api/issues/bulk-assign', async ({ request }) => {
    if (roleOf(request) !== '负责人') {
      return HttpResponse.json({ error: '仅负责人可批量分配' }, { status: 403 })
    }
    const body = (await request.json()) as { keys: string[]; team: string; owner: string; dueDate: string; priority: string }
    issues = issues.map((issue) =>
      body.keys.includes(issue.key)
        ? { ...issue, team: body.team, owner: body.owner, dueDate: body.dueDate, priority: body.priority as Issue['priority'], status: '修复中', history: [...issue.history, { at: '刚刚', actor: `${actorOf(request, '当前用户')} / 负责人`, action: '批量分配', detail: `指派至 ${body.team} / ${body.owner}` }] }
        : issue,
    )
    return HttpResponse.json({ updated: body.keys.length })
  }),

  /**
   * 按站点容量分批对账。
   * - 幂等：同站点同批次重复提交沿用首次结果（duplicate=true）。
   * - 失败整批保留：证据缺失或首次尝试失败时整批不应用任何问题。
   * - 重试：retry=true 时整批重新尝试。
   */
  http.post('/api/reconcile', async ({ request }) => {
    const body = (await request.json()) as { site: string; keys: string[]; retry?: boolean }
    const fingerprint = fingerprintOf(body.site, body.keys)
    const existing = batches.find((item) => item.fingerprint === fingerprint)

    if (existing && !body.retry) {
      return HttpResponse.json({ batch: { ...existing, duplicate: true } })
    }

    const attempt = existing ? existing.attempt + 1 : 1
    const base: ReconcileBatch = {
      id: existing?.id ?? `B-${Date.now()}`,
      fingerprint,
      site: body.site,
      keys: body.keys,
      capacity: body.keys.length,
      attempt,
      status: 'failed',
      createdAt: '刚刚',
    }

    // 模拟首次尝试失败（上游证据服务暂不可用），整批保留重试
    if (attempt === 1) {
      const failed: ReconcileBatch = { ...base, status: 'failed', reason: '证据服务暂时不可用（模拟 504），整批未应用' }
      batches = existing ? batches.map((item) => (item.fingerprint === fingerprint ? failed : item)) : [...batches, failed]
      return HttpResponse.json({ batch: failed })
    }

    // 整批校验：任一问题证据缺失则整批失败，不应用任何结果
    const missing = body.keys.filter((key) => !evidence.some((item) => item.url === findIssue(key)?.evidence))
    if (missing.length) {
      const failed: ReconcileBatch = { ...base, status: 'failed', reason: `证据缺失（${missing.join('、')}），整批未应用` }
      batches = batches.map((item) => (item.fingerprint === fingerprint ? failed : item))
      return HttpResponse.json({ batch: failed })
    }

    const results: ReconcileBatch['results'] = []
    for (const key of body.keys) {
      const issue = findIssue(key)!
      const ev = evidence.find((item) => item.url === issue.evidence)!
      const actions: string[] = []
      if (ev.version !== issue.version) {
        if (['已通过', '已退回', '不适用'].includes(issue.status)) {
          issue.status = '待复测'
          issue.retestRecords = issue.retestRecords.map((record) =>
            record.actorRole === '复测员' && record.valid !== false ? { ...record, valid: false, invalidReason: '证据版本不匹配，结论失效' } : record,
          )
          actions.push('证据版本不匹配，结论重算为待复测')
        } else {
          actions.push('证据版本不匹配，已标记待按新版本重算')
        }
        issue.reconcileStatus = 'version_mismatch'
      } else {
        const lastValid = [...issue.retestRecords].reverse().find((record) => record.valid !== false && record.actorRole === '复测员')
        if (lastValid?.evidenceHash && lastValid.evidenceHash !== ev.hash) {
          issue.status = '待复测'
          issue.retestRecords = issue.retestRecords.map((record) =>
            record.id === lastValid.id ? { ...record, valid: false, invalidReason: '证据已变更，结论立即失效' } : record,
          )
          issue.reconcileStatus = 'hash_changed'
          actions.push('证据已变更，结论立即失效')
        } else {
          issue.reconcileStatus = 'ok'
          actions.push('对账一致')
        }
      }
      issue.history.push({ at: '刚刚', actor: '系统', action: '证据对账', detail: actions.join('；') })
      results.push({ key, actions })
    }

    const succeeded: ReconcileBatch = { ...base, status: 'succeeded', results }
    batches = batches.map((item) => (item.fingerprint === fingerprint ? succeeded : item))
    return HttpResponse.json({ batch: succeeded })
  }),
)

export { issues, evidence, batches }
