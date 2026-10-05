export const ROLES = ['审核员', '开发', '复测员', '负责人'] as const
export type Role = (typeof ROLES)[number]

export type IssueStatus = '待分配' | '修复中' | '待复测' | '已通过' | '已退回' | '不适用'

export type Issue = {
  key: string
  title: string
  site: string
  version: string
  wcag: string[]
  issueType: string
  impact: '致命' | '严重' | '中等' | '轻微'
  affected: string
  reproduction: string
  evidence: string
  rootCause: string
  status: IssueStatus
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  team: string
  owner: string
  dueDate: string
  mergedKeys: string[]
  /** 创建人（按历史补全） */
  createdBy?: string
  createdByRole?: Role | string
  /** 开发提交的修复说明 */
  fixNote?: string
  fixer?: string
  /** 开发提交的复测环境 */
  retestEnv?: string
  retestEnvVersion?: string
  retestEnvAt?: string
  /** 复测员归属 */
  retester?: string
  /** 与证据对账后的状态 */
  reconcileStatus?: 'version_mismatch' | 'hash_changed' | 'ok'
  retestRecords: RetestRecord[]
  history: Array<{ at: string; actor: string; action: string; detail: string }>
}

export type RetestRecord = {
  id: string
  actor: string
  actorRole?: Role | string
  result: string
  note: string
  at: string
  /** 判定时所依据的证据版本与哈希，证据一变结论立即失效 */
  evidenceVersion?: string
  evidenceHash?: string
  valid?: boolean
  invalidReason?: string
}

export type EvidenceRecord = {
  url: string
  version: string
  hash: string
  updatedAt: string
}

/** 按站点容量分批对账的批次 */
export type ReconcileBatch = {
  id: string
  /** 幂等键：站点 + 排序后的问题编号 */
  fingerprint: string
  site: string
  keys: string[]
  capacity: number
  attempt: number
  status: 'failed' | 'succeeded'
  duplicate?: boolean
  reason?: string
  results?: Array<{ key: string; actions: string[] }>
  createdAt: string
}
