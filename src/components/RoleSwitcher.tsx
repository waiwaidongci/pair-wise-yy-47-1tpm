import { Select, Tag } from 'antd'
import { SafetyCertificateOutlined } from '@ant-design/icons'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import { ROLES } from '../api/types'

const roleColor: Record<string, string> = { 审核员: 'blue', 开发: 'geekblue', 复测员: 'green', 负责人: 'gold' }

export default function RoleSwitcher() {
  const currentRole = useWorkspaceStore((state) => state.currentRole)
  const setCurrentRole = useWorkspaceStore((state) => state.setCurrentRole)

  return (
    <div className="role-switcher">
      <Tag icon={<SafetyCertificateOutlined />} color={roleColor[currentRole]}>
        当前角色
      </Tag>
      <Select
        value={currentRole}
        onChange={setCurrentRole}
        style={{ width: 120 }}
        options={ROLES.map((role) => ({ value: role, label: role }))}
      />
    </div>
  )
}
