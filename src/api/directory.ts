import type { Role } from './types'

export type Person = { name: string; role: Role }

/** 人员目录：角色归属的唯一来源，旧数据升级时也按此补全 */
export const people: Person[] = [
  { name: '李予', role: '审核员' },
  { name: '何沐', role: '开发' },
  { name: '赵屿', role: '开发' },
  { name: '顾雪', role: '开发' },
  { name: '苏禾', role: '复测员' },
  { name: '林岚', role: '负责人' },
]

export const roleOf = (name?: string): Role | undefined => people.find((person) => person.name === name)?.role

export const roleColor: Record<Role, string> = {
  审核员: 'geekblue',
  开发: 'cyan',
  复测员: 'purple',
  负责人: 'gold',
}

/**
 * 角色权限矩阵（收口规则）：
 * - 开发只提交修复说明与复测环境
 * - 仅复测员可提交复测结论，负责人也不能代判
 * - 分配 / 合并归审核员与负责人
 * - 整改报告导出归审核员与负责人
 */
export const permissions = {
  canSubmitFix: (role?: Role) => role === '开发',
  canRetest: (role?: Role) => role === '复测员',
  canAssign: (role?: Role) => role === '审核员' || role === '负责人',
  canMerge: (role?: Role) => role === '审核员' || role === '负责人',
  canExport: (role?: Role) => role === '审核员' || role === '负责人',
}
