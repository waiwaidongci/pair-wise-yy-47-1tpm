import dayjs from 'dayjs'
import type { EvidenceRecord, Issue } from '../api/types'

/** 每个站点每批核对的问题容量 */
export const SITE_CAPACITY = 2
/** 复测环境有效期（天） */
export const ENV_TTL_DAYS = 30

/** 环境是否过期：环境版本与台账版本不一致，或超出有效期 */
export function isEnvExpired(issue: Issue): boolean {
  if (!issue.retestEnv) return false
  if (issue.retestEnvVersion && issue.retestEnvVersion !== issue.version) return true
  if (issue.retestEnvAt) {
    const days = dayjs().diff(dayjs(issue.retestEnvAt), 'day')
    if (days > ENV_TTL_DAYS) return true
  }
  return false
}

/** 是否已有复测员判定（含历史有效记录） */
export function hasRetester(issue: Issue): boolean {
  if (issue.retester) return true
  return issue.retestRecords.some((record) => record.valid !== false && record.actorRole === '复测员')
}

export type BlockReason = '缺复测员' | '缺复测环境' | '环境过期' | '证据缺失' | '版本不匹配' | '证据已变更'

/**
 * 报告阻塞项：已通过的问题若缺复测员、环境过期或与证据对不上，
 * 一律不得进入整改报告，导出前列入阻塞项。
 */
export function reportBlockers(issue: Issue, evidence: EvidenceRecord[]): BlockReason[] {
  const reasons: BlockReason[] = []
  if (issue.status !== '已通过') return reasons
  if (!hasRetester(issue)) reasons.push('缺复测员')
  if (!issue.retestEnv) reasons.push('缺复测环境')
  else if (isEnvExpired(issue)) reasons.push('环境过期')
  const ev = evidence.find((item) => item.url === issue.evidence)
  if (!ev) {
    reasons.push('证据缺失')
  } else {
    if (ev.version !== issue.version) reasons.push('版本不匹配')
    const lastValid = [...issue.retestRecords].reverse().find((record) => record.valid !== false && record.actorRole === '复测员')
    if (lastValid?.evidenceHash && lastValid.evidenceHash !== ev.hash) reasons.push('证据已变更')
  }
  return reasons
}

/** 按站点容量分批 */
export function chunkBySite(issues: Issue[], capacity = SITE_CAPACITY): Array<{ site: string; keys: string[] }> {
  const bySite = new Map<string, string[]>()
  for (const issue of issues) {
    const list = bySite.get(issue.site) ?? []
    list.push(issue.key)
    bySite.set(issue.site, list)
  }
  return Array.from(bySite.entries()).flatMap(([site, keys]) => {
    const batches: Array<{ site: string; keys: string[] }> = []
    for (let i = 0; i < keys.length; i += capacity) {
      batches.push({ site, keys: keys.slice(i, i + capacity) })
    }
    return batches
  })
}
