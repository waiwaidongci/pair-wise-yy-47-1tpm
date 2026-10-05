import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '../api/types'

type SessionState = {
  user: string
  role: Role
  setUser: (user: string, role: Role) => void
}

/** 当前登录身份：所有写操作按此角色做权限收口 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      user: '苏禾',
      role: '复测员',
      setUser: (user, role) => set({ user, role }),
    }),
    { name: 'accessibility-remediation-session' },
  ),
)
