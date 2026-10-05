import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import type { EvidenceRecord, Issue, ReconcileBatch, Role } from '../api/types'
import { ROLES } from '../api/types'
import { seedEvidence, seedIssues } from '../api/seed'
import { chunkBySite } from '../utils/remediation'

type SavedFilter = { id: string; name: string; query: string; site: string; status: string; priority: string }

type WorkspaceState = {
  issues: Issue[]
  evidence: EvidenceRecord[]
  batches: ReconcileBatch[]
  currentRole: Role
  currentUser: string
  selectedKeys: string[]
  savedFilters: SavedFilter[]
  draft: string
  mergeKeys: string[]
  setIssues: (issues: Issue[]) => void
  setCurrentRole: (role: Role) => void
  setSelectedKeys: (keys: string[]) => void
  saveFilter: (filter: Omit<SavedFilter, 'id'>) => void
  removeFilter: (id: string) => void
  setDraft: (draft: string) => void
  mergeIssues: (keys: string[]) => void
  updateIssue: (issue: Issue) => void
  /** 开发提交修复说明与复测环境 */
  submitFixNote: (key: string, fixNote: string, env: string, envVersion: string, envDate: string) => Promise<void>
  /** 复测员判定结论（服务端按角色收口） */
  recordRetest: (key: string, result: string, note: string) => Promise<Issue>
  /** 负责人批量分配 */
  bulkAssign: (keys: string[], team: string, owner: string, dueDate: string, priority: string) => Promise<void>
  /** 按站点容量分批对账；retry=true 时整批重试，否则重复批次沿用首次结果 */
  reconcileSite: (site: string, keys: string[], retry?: boolean) => Promise<ReconcileBatch>
  reconcileAll: () => Promise<void>
  retryBatch: (batch: ReconcileBatch) => Promise<void>
}

const roleHeader = (role: Role) => ({ headers: { 'x-role': role } })

/** 旧数据升级：按创建人补角色归属，按历史补复测员，并标记非复测员判定 */
function migrateIssues(issues: Issue[]): Issue[] {
  return issues.map((issue) => {
    const next: Issue = { ...issue }
    if (!next.createdBy) {
      const created = next.history.find((event) => event.action === '创建问题')
      if (created) {
        const [name, role] = created.actor.split(' / ')
        next.createdBy = name
        if (role && (ROLES as readonly string[]).includes(role)) next.createdByRole = role as Role
      }
    }
    if (!next.retester) {
      const lastValid = [...next.retestRecords].reverse().find((record) => record.actorRole === '复测员')
      if (lastValid) next.retester = lastValid.actor
    }
    next.retestRecords = next.retestRecords.map((record) => {
      if (record.actorRole && record.actorRole !== '复测员') {
        return { ...record, valid: false, invalidReason: record.invalidReason ?? '非复测员判定' }
      }
      return record
    })
    return next
  })
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      issues: structuredClone(seedIssues),
      evidence: structuredClone(seedEvidence),
      batches: [],
      currentRole: '复测员',
      currentUser: '当前用户',
      selectedKeys: [],
      savedFilters: [
        { id: 'f1', name: 'P0/P1 未关闭', query: '', site: '', status: '', priority: 'P0' },
        { id: 'f2', name: '基础组件组待复测', query: '基础组件', site: '', status: '待复测', priority: '' },
      ],
      draft: 'A11Y-1048：需同时验证 Esc 关闭与 Tab/Shift+Tab 环绕顺序，移动端抽屉也需复测。',
      mergeKeys: [],
      setIssues: (issues) => set({ issues }),
      setCurrentRole: (currentRole) => set({ currentRole }),
      setSelectedKeys: (selectedKeys) => set({ selectedKeys }),
      saveFilter: (filter) => set((state) => ({ savedFilters: [...state.savedFilters, { ...filter, id: crypto.randomUUID() }] })),
      removeFilter: (id) => set((state) => ({ savedFilters: state.savedFilters.filter((item) => item.id !== id) })),
      setDraft: (draft) => set({ draft }),
      mergeIssues: (keys) =>
        set((state) => {
          const primary = state.issues.find((issue) => issue.key === keys[0])
          if (!primary) return state
          return {
            issues: state.issues.map((issue) =>
              keys.includes(issue.key)
                ? {
                    ...issue,
                    rootCause: primary.rootCause,
                    status: issue.key === primary.key ? issue.status : '不适用',
                    mergedKeys: issue.key === primary.key ? keys.slice(1) : [primary.key],
                    history: [...issue.history, { at: '刚刚', actor: '当前用户', action: '重复问题合并', detail: `合并至 ${primary.key}` }],
                  }
                : issue,
            ),
            selectedKeys: [],
          }
        }),
      updateIssue: (updated) => set((state) => ({ issues: state.issues.map((issue) => (issue.key === updated.key ? updated : issue)) })),

      submitFixNote: async (key, fixNote, env, envVersion, envDate) => {
        const { currentRole, currentUser } = get()
        const { data } = await axios.post<Issue>(
          `/api/issues/${key}/fix-note`,
          { fixNote, environment: env, envVersion, envDate, actor: currentUser },
          roleHeader(currentRole),
        )
        set((state) => ({ issues: state.issues.map((issue) => (issue.key === key ? data : issue)) }))
      },

      recordRetest: async (key, result, note) => {
        const { currentRole, currentUser } = get()
        const { data } = await axios.post<Issue>(`/api/issues/${key}/review`, { result, note, actor: currentUser }, roleHeader(currentRole))
        set((state) => ({ issues: state.issues.map((issue) => (issue.key === key ? data : issue)) }))
        return data
      },

      bulkAssign: async (keys, team, owner, dueDate, priority) => {
        const { currentRole } = get()
        await axios.post('/api/issues/bulk-assign', { keys, team, owner, dueDate, priority }, roleHeader(currentRole))
        const { data } = await axios.get<Issue[]>('/api/issues')
        set({ issues: data })
      },

      reconcileSite: async (site, keys, retry = false) => {
        const { data } = await axios.post<{ batch: ReconcileBatch }>('/api/reconcile', { site, keys, retry })
        const batch = data.batch
        set((state) => ({
          batches: state.batches.some((item) => item.fingerprint === batch.fingerprint)
            ? state.batches.map((item) => (item.fingerprint === batch.fingerprint ? batch : item))
            : [...state.batches, batch],
        }))
        const [issues, evidence] = await Promise.all([axios.get<Issue[]>('/api/issues'), axios.get<EvidenceRecord[]>('/api/evidence')])
        set({ issues: issues.data, evidence: evidence.data })
        return batch
      },

      reconcileAll: async () => {
        const { issues, reconcileSite } = get()
        for (const batch of chunkBySite(issues)) {
          await reconcileSite(batch.site, batch.keys, false)
        }
      },

      retryBatch: async (batch) => {
        const { reconcileSite } = get()
        await reconcileSite(batch.site, batch.keys, true)
      },
    }),
    {
      name: 'accessibility-remediation-v1',
      version: 2,
      partialize: (state) => ({
        issues: state.issues,
        currentRole: state.currentRole,
        currentUser: state.currentUser,
        savedFilters: state.savedFilters,
        draft: state.draft,
        selectedKeys: state.selectedKeys,
      }),
      migrate: (persisted, version) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          const state = persisted as { issues?: Issue[] }
          if (Array.isArray(state.issues)) state.issues = migrateIssues(state.issues)
        }
        return persisted as WorkspaceState
      },
    },
  ),
)
