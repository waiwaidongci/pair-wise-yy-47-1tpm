import dayjs from 'dayjs'
import type { Issue } from '../api/types'

export const today = () => dayjs().format('YYYY-MM-DD')

export const isEnvExpired = (issue: Issue, now = today()) =>
  Boolean(issue.retestEnv && issue.retestEnvExpiresAt && issue.retestEnvExpiresAt < now)

/** 是否存在复测员提交的、未失效的判定结论 */
export const hasRetesterVerdict = (issue: Issue) =>
  issue.retestRecords.some((record) => !record.invalidated && record.actorRole === '复测员')

export type Blocker = { key: string; title: string; reasons: string[] }

/**
 * 导出前阻塞项：进入复测流程的问题，缺复测员判定、复测环境过期 /
 * 缺有效期、或证据版本不一致待重算的，一律不得进入整改报告。
 */
export function computeBlockers(issues: Issue[], now = today()): Blocker[] {
  return issues
    .filter((issue) => ['待复测', '已退回', '已通过'].includes(issue.status))
    .map((issue) => {
      const reasons: string[] = []
      if (!hasRetesterVerdict(issue)) reasons.push('缺复测员判定')
      if (issue.retestEnv && !issue.retestEnvExpiresAt) reasons.push('复测环境缺有效期')
      if (isEnvExpired(issue, now)) reasons.push(`复测环境已过期（${issue.retestEnvExpiresAt}）`)
      if (issue.needsRecalc) reasons.push('证据版本不一致，待重算')
      return { key: issue.key, title: issue.title, reasons }
    })
    .filter((blocker) => blocker.reasons.length > 0)
}
