export type Role = '审核员' | '开发' | '复测员' | '负责人'

export type IssueStatus = '待分配' | '修复中' | '待复测' | '已通过' | '已退回' | '不适用'

export type RetestRecord = {
  id: string
  actor: string
  actorRole?: Role
  result: string
  note: string
  at: string
  /** 结论所依据的外部证据哈希，证据变更后用于判定结论失效 */
  evidenceHash?: string
  invalidated?: boolean
  invalidReason?: string
}

export type HistoryEvent = {
  at: string
  actor: string
  actorRole?: Role
  action: string
  detail: string
}

export type ReconcileState = {
  batchId: string
  checkedAt: string
  versionMatch: boolean
  evidenceHash: string
}

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
  createdBy?: string
  createdByRole?: Role
  fixNote?: string
  fixSubmittedBy?: string
  retestEnv?: string
  /** 复测环境有效期，过期后不得据此下结论或进入整改报告 */
  retestEnvExpiresAt?: string
  /** 对账发现证据版本不一致，需按新证据重算 */
  needsRecalc?: boolean
  reconcile?: ReconcileState
  retestRecords: RetestRecord[]
  history: HistoryEvent[]
}

export type EvidenceRecord = {
  issueKey: string
  version: string
  hash: string
  updatedAt: string
}

export type ReconcileItemResult = {
  key: string
  versionMatch: boolean
  evidenceChanged: boolean
  evidenceHash: string
}

export type ReconcileBatchResponse = {
  batchId: string
  site: string
  items: ReconcileItemResult[]
  reused: boolean
  finishedAt: string
}
