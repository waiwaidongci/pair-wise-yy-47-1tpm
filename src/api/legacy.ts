import type { Issue, Role } from './types'
import { roleOf } from './directory'

/** 兼容旧格式 "李予 / 审核员"，返回姓名与角色 */
const splitActor = (actor: string): { name: string; role?: Role } => {
  const [name, role] = actor.split('/').map((part) => part.trim())
  return { name, role: (role as Role) || roleOf(name) }
}

/**
 * 旧数据升级：按创建人补角色归属。
 * - 从「创建问题」历史事件解析创建人，回填 createdBy / createdByRole
 * - 历史事件与复测记录按人员目录补 actorRole
 * - 旧复测环境一律视为已过期，需开发重新提交确认
 */
export function upgradeLegacyIssue(issue: Issue): Issue {
  const createEvent = issue.history.find((event) => event.action === '创建问题')
  const creator = createEvent ? splitActor(createEvent.actor) : undefined
  return {
    ...issue,
    createdBy: issue.createdBy ?? creator?.name,
    createdByRole: issue.createdByRole ?? creator?.role,
    retestEnvExpiresAt: issue.retestEnvExpiresAt ?? (issue.retestEnv ? '2026-09-30' : undefined),
    retestRecords: issue.retestRecords.map((record) => ({
      ...record,
      actorRole: record.actorRole ?? roleOf(record.actor),
    })),
    history: issue.history.map((event) => {
      const parsed = splitActor(event.actor)
      return { ...event, actor: parsed.name, actorRole: event.actorRole ?? parsed.role }
    }),
  }
}
