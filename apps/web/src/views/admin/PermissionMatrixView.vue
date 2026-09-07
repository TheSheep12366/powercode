<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Checkbox from 'fuxsto-design/checkbox';
import CheckboxGroup from 'fuxsto-design/checkbox-group';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import Popconfirm from 'fuxsto-design/popconfirm';
import Radio from 'fuxsto-design/radio';
import RadioGroup from 'fuxsto-design/radio-group';
import Select from 'fuxsto-design/select';
import Table from 'fuxsto-design/table';
import { Pencil, Plus, Shield, Trash2, Users } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createGroup,
  createRole,
  deleteGroup,
  deleteRole,
  getGroupDetail,
  getPermissionMatrix,
  getRoleDetail,
  listGroups,
  listRoles,
  listUsers,
  setPermission,
  updateGroup,
  updateRole,
  type GroupRow,
  type MatrixDirectory,
  type MatrixEntry,
  type MatrixUser,
  type RoleRow
} from '@/api/admin';
import { computeEffectivePermission, permissionLabel, type EffectivePermission } from '@powercode/shared';

type TabKey = 'matrix' | 'groups' | 'roles';
const tab = ref<TabKey>('matrix');

// ============ 权限矩阵 ============
const loading = ref(false);
const matrixUsers = ref<MatrixUser[]>([]);
const matrixDirs = ref<MatrixDirectory[]>([]);
const entries = ref<MatrixEntry[]>([]);
const memberships = ref<Array<{ groupId: number; userId: number }>>([]);
const matrixRoles = ref<Array<{ id: number; name: string; workspaceMode: 'all' | 'selected'; workspaceLevel: 'rw' | 'ro'; workspaceDirIds: number[] }>>([]);

const cellOptions = [
  { label: '无权限', value: 'none' },
  { label: '只读', value: 'ro' },
  { label: '读写', value: 'rw' },
  { label: '禁止', value: 'deny' }
];

const matrixColumns = computed(() => [
  { key: 'username', title: '用户', width: 150 },
  ...matrixDirs.value.map((d) => ({ key: `dir-${d.id}`, title: d.name, width: 130 }))
]);

const userGroupsMap = computed(() => {
  const map = new Map<number, number[]>();
  for (const m of memberships.value) {
    const list = map.get(m.userId) ?? [];
    list.push(m.groupId);
    map.set(m.userId, list);
  }
  return map;
});

const roleById = computed(() => new Map(matrixRoles.value.map((r) => [r.id, r])));

function entryFor(directoryId: number, subjectType: 'user' | 'group', subjectId: number): MatrixEntry | undefined {
  return entries.value.find(
    (e) => e.directoryId === directoryId && e.subjectType === subjectType && e.subjectId === subjectId
  );
}

/** 权限组对该用户在该目录上的授予级别（未授予返回 null） */
function roleGrantFor(userId: number, dirId: number): 'rw' | 'ro' | null {
  const user = matrixUsers.value.find((u) => u.id === userId);
  if (!user?.roleId) return null;
  const role = roleById.value.get(user.roleId);
  if (!role) return null;
  if (role.workspaceMode === 'all' || role.workspaceDirIds.includes(dirId)) return role.workspaceLevel;
  return null;
}

/** 单元格显示值 = 有效权限（管理员显示 admin） */
function cellValue(userId: number, dirId: number): EffectivePermission {
  const user = matrixUsers.value.find((u) => u.id === userId);
  if (!user) return 'none';
  return computeEffectivePermission({
    role: user.role,
    userEntry: entryFor(dirId, 'user', userId)?.mode ?? null,
    roleGrant: roleGrantFor(userId, dirId),
    groupEntries: (userGroupsMap.value.get(userId) ?? [])
      .map((gid) => entryFor(dirId, 'group', gid)?.mode)
      .filter((m): m is 'ro' | 'rw' | 'deny' => Boolean(m))
  });
}

async function loadMatrix(): Promise<void> {
  loading.value = true;
  try {
    const data = await getPermissionMatrix();
    matrixUsers.value = data.users;
    matrixDirs.value = data.directories;
    entries.value = data.entries;
    memberships.value = data.memberships;
    matrixRoles.value = data.roles;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载权限矩阵失败');
  } finally {
    loading.value = false;
  }
}

async function onCellChange(userId: number, directoryId: number, mode: string): Promise<void> {
  try {
    await setPermission({ directoryId, subjectType: 'user', subjectId: userId, mode: mode as 'ro' | 'rw' | 'deny' | 'none' });
    Message.success(`已设为「${mode === 'none' ? '无权限' : permissionLabel(mode as EffectivePermission)}」`);
    await loadMatrix();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '设置失败');
  }
}

// ============ 用户组 ============
const groups = ref<GroupRow[]>([]);
const groupsLoading = ref(false);
const userOptions = ref<Array<{ id: number; username: string }>>([]);

async function loadGroups(): Promise<void> {
  groupsLoading.value = true;
  try {
    const data = await listGroups();
    groups.value = data.items;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载用户组失败');
  } finally {
    groupsLoading.value = false;
  }
}

// ---- 新建组 ----
const createGroupVisible = ref(false);
const creatingGroup = ref(false);
const createGroupForm = reactive({ name: '', memberIds: [] as number[] });

function openCreateGroup(): void {
  createGroupForm.name = '';
  createGroupForm.memberIds = [];
  createGroupVisible.value = true;
}

async function submitCreateGroup(): Promise<void> {
  if (!createGroupForm.name.trim()) {
    Message.warning('请输入组名');
    return;
  }
  creatingGroup.value = true;
  try {
    await createGroup({ name: createGroupForm.name.trim(), memberIds: createGroupForm.memberIds });
    Message.success('用户组已创建');
    createGroupVisible.value = false;
    await Promise.all([loadGroups(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  } finally {
    creatingGroup.value = false;
  }
}

// ---- 编辑组 ----
const editGroupVisible = ref(false);
const editingGroup = ref(false);
const editGroupForm = reactive({ id: 0, name: '', memberIds: [] as number[] });

async function openEditGroup(row: GroupRow): Promise<void> {
  try {
    const detail = await getGroupDetail(row.id);
    editGroupForm.id = row.id;
    editGroupForm.name = detail.group.name;
    editGroupForm.memberIds = detail.memberIds;
    editGroupVisible.value = true;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载组详情失败');
  }
}

async function submitEditGroup(): Promise<void> {
  if (!editGroupForm.name.trim()) {
    Message.warning('请输入组名');
    return;
  }
  editingGroup.value = true;
  try {
    await updateGroup(editGroupForm.id, { name: editGroupForm.name.trim(), memberIds: editGroupForm.memberIds });
    Message.success('已保存');
    editGroupVisible.value = false;
    await Promise.all([loadGroups(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    editingGroup.value = false;
  }
}

async function removeGroup(row: GroupRow): Promise<void> {
  try {
    await deleteGroup(row.id);
    Message.success('已删除');
    await Promise.all([loadGroups(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

// ============ 权限组（角色模板） ============
const roles = ref<RoleRow[]>([]);
const rolesLoading = ref(false);

const CAP_OPTIONS = [
  { value: 'canManageUsers', label: '管理用户 / 用户组' },
  { value: 'canManageDirectories', label: '管理共享目录与目录权限' },
  { value: 'canViewAudit', label: '查看审计日志' },
  { value: 'canManageAnnouncements', label: '管理公告（发布/删除/提醒）' },
  { value: 'canManageGlobalPlans', label: '管理全员计划（倒数日/TODO）' }
];

const roleColumns = [
  { key: 'name', title: '名称' },
  { key: 'caps', title: '管理能力' },
  { key: 'workspace', title: '工作区访问' },
  { key: 'memberCount', title: '成员数', width: 90 },
  { key: 'actions', title: '操作', width: 160 }
];

function capChips(role: RoleRow): string[] {
  const list: string[] = [];
  if (role.canManageUsers) list.push('管用户');
  if (role.canManageDirectories) list.push('管目录');
  if (role.canViewAudit) list.push('看审计');
  if (role.canManageAnnouncements) list.push('管公告');
  if (role.canManageGlobalPlans) list.push('管全员计划');
  return list;
}

function workspaceText(role: RoleRow): string {
  const level = role.workspaceLevel === 'rw' ? '读写' : '只读';
  if (role.workspaceMode === 'all') return `全部工作区 · ${level}`;
  return `指定 ${role.workspaceDirIds.length} 个工作区 · ${level}`;
}

async function loadRoles(): Promise<void> {
  rolesLoading.value = true;
  try {
    const data = await listRoles();
    roles.value = data.items;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载权限组失败');
  } finally {
    rolesLoading.value = false;
  }
}

// ---- 新建权限组 ----
const createRoleVisible = ref(false);
const creatingRole = ref(false);
const createRoleForm = reactive({
  name: '',
  caps: [] as string[],
  workspaceMode: 'all' as 'all' | 'selected',
  workspaceLevel: 'rw' as 'rw' | 'ro',
  workspaceDirIds: [] as number[]
});

function openCreateRole(): void {
  createRoleForm.name = '';
  createRoleForm.caps = [];
  createRoleForm.workspaceMode = 'all';
  createRoleForm.workspaceLevel = 'rw';
  createRoleForm.workspaceDirIds = [];
  createRoleVisible.value = true;
}

async function submitCreateRole(): Promise<void> {
  if (!createRoleForm.name.trim()) {
    Message.warning('请输入权限组名称');
    return;
  }
  creatingRole.value = true;
  try {
    await createRole({
      name: createRoleForm.name.trim(),
      canManageUsers: createRoleForm.caps.includes('canManageUsers'),
      canManageDirectories: createRoleForm.caps.includes('canManageDirectories'),
      canViewAudit: createRoleForm.caps.includes('canViewAudit'),
      canManageAnnouncements: createRoleForm.caps.includes('canManageAnnouncements'),
      canManageGlobalPlans: createRoleForm.caps.includes('canManageGlobalPlans'),
      workspaceMode: createRoleForm.workspaceMode,
      workspaceLevel: createRoleForm.workspaceLevel,
      workspaceDirIds: createRoleForm.workspaceDirIds
    });
    Message.success('权限组已创建');
    createRoleVisible.value = false;
    await Promise.all([loadRoles(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  } finally {
    creatingRole.value = false;
  }
}

// ---- 编辑权限组 ----
const editRoleVisible = ref(false);
const editingRole = ref(false);
const editRoleForm = reactive({
  id: 0,
  name: '',
  caps: [] as string[],
  workspaceMode: 'all' as 'all' | 'selected',
  workspaceLevel: 'rw' as 'rw' | 'ro',
  workspaceDirIds: [] as number[]
});

async function openEditRole(row: RoleRow): Promise<void> {
  try {
    const detail = await getRoleDetail(row.id);
    const r = detail.role;
    editRoleForm.id = r.id;
    editRoleForm.name = r.name;
    editRoleForm.caps = [
      ...(r.canManageUsers ? ['canManageUsers'] : []),
      ...(r.canManageDirectories ? ['canManageDirectories'] : []),
      ...(r.canViewAudit ? ['canViewAudit'] : [])
    ];
    editRoleForm.workspaceMode = r.workspaceMode;
    editRoleForm.workspaceLevel = r.workspaceLevel;
    editRoleForm.workspaceDirIds = [...r.workspaceDirIds];
    editRoleVisible.value = true;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载权限组详情失败');
  }
}

async function submitEditRole(): Promise<void> {
  if (!editRoleForm.name.trim()) {
    Message.warning('请输入权限组名称');
    return;
  }
  editingRole.value = true;
  try {
    await updateRole(editRoleForm.id, {
      name: editRoleForm.name.trim(),
      canManageUsers: editRoleForm.caps.includes('canManageUsers'),
      canManageDirectories: editRoleForm.caps.includes('canManageDirectories'),
      canViewAudit: editRoleForm.caps.includes('canViewAudit'),
      workspaceMode: editRoleForm.workspaceMode,
      workspaceLevel: editRoleForm.workspaceLevel,
      workspaceDirIds: editRoleForm.workspaceDirIds
    });
    Message.success('已保存');
    editRoleVisible.value = false;
    await Promise.all([loadRoles(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    editingRole.value = false;
  }
}

async function removeRole(row: RoleRow): Promise<void> {
  try {
    await deleteRole(row.id);
    Message.success('已删除，关联用户已解除授权');
    await Promise.all([loadRoles(), loadMatrix()]);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(async () => {
  await Promise.all([loadMatrix(), loadGroups(), loadRoles()]);
  try {
    const data = await listUsers({ page: 1, pageSize: 100 });
    userOptions.value = data.items.map((u) => ({ id: u.id, username: u.username }));
  } catch {
    // 用户选项加载失败不阻塞页面
  }
});
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-2">
      <Button :variant="tab === 'matrix' ? 'primary' : 'ghost'" size="sm" @click="tab = 'matrix'">权限矩阵</Button>
      <Button :variant="tab === 'groups' ? 'primary' : 'ghost'" size="sm" @click="tab = 'groups'">用户组</Button>
      <Button :variant="tab === 'roles' ? 'primary' : 'ghost'" size="sm" @click="tab = 'roles'">权限组</Button>
    </div>

    <!-- 权限矩阵 -->
    <Card v-show="tab === 'matrix'" shadow="sm" padding="md">
      <div class="mb-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        有效权限优先级：管理员 &gt; 用户级条目（含禁止）&gt; 权限组授予 &gt; 组级条目（同级冲突时 禁止 &gt; 读写 &gt; 只读）。
        单元格下拉修改的是用户级条目，选「无权限」即删除该条目并回退到权限组/组级授权。
      </div>
      <div class="overflow-auto">
        <Table
          :columns="matrixColumns"
          :data="matrixUsers"
          row-key="id"
          :loading="loading"
          striped
          hover
          rounded
          :empty-text="matrixDirs.length === 0 ? '暂无共享目录，请先在「目录管理」添加' : '暂无用户'"
        >
          <template #cell-username="{ row }">
            <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ row.username }}</span>
            <Chip v-if="row.role === 'admin'" variant="primary" size="sm" class="ml-2">管理员</Chip>
            <Chip v-if="row.status === 'disabled'" variant="outline" size="sm" class="ml-2 opacity-60">已禁用</Chip>
          </template>
          <template v-for="d in matrixDirs" :key="d.id" #[`cell-dir-${d.id}`]="{ row }">
            <Chip v-if="row.role === 'admin'" variant="secondary" size="sm">全部读写</Chip>
            <Select
              v-else
              size="sm"
              class="w-[104px]!"
              :model-value="cellValue(row.id, d.id)"
              :options="cellOptions"
              :disabled="row.status === 'disabled'"
              @update:model-value="(v: string | number) => onCellChange(row.id, d.id, String(v))"
            />
          </template>
        </Table>
      </div>
    </Card>

    <!-- 用户组 -->
    <Card v-show="tab === 'groups'" shadow="sm" padding="md">
      <div class="mb-4 flex items-center justify-end">
        <Button variant="primary" size="sm" :icon="Users" @click="openCreateGroup">新建用户组</Button>
      </div>
      <Table
        :columns="[
          { key: 'name', title: '组名' },
          { key: 'memberCount', title: '成员数', width: 100 },
          { key: 'createdAt', title: '创建时间', width: 180 },
          { key: 'actions', title: '操作', width: 160 }
        ]"
        :data="groups"
        row-key="id"
        :loading="groupsLoading"
        striped
        hover
        rounded
        empty-text="暂无用户组"
      >
        <template #cell-name="{ row }">
          <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ row.name }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="text-zinc-500 dark:text-zinc-400">{{ new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1">
            <Button variant="ghost" size="sm" :icon="Pencil" @click="openEditGroup(row)">编辑</Button>
            <Popconfirm
              title="删除用户组"
              :description="`确定删除 ${row.name} 吗？其权限条目将一并清除。`"
              danger
              confirm-text="删除"
              cancel-text="取消"
              @confirm="removeGroup(row)"
            >
              <Button variant="ghost" size="sm" danger :icon="Trash2">删除</Button>
            </Popconfirm>
          </div>
        </template>
      </Table>

      <DialogDefault v-model:open="createGroupVisible" title="新建用户组" size="sm" :show-confirm="false" :show-cancel="false">
        <div class="space-y-4">
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">组名</div>
            <Input v-model="createGroupForm.name" placeholder="如：前端组" />
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">成员</div>
            <CheckboxGroup
              v-model="createGroupForm.memberIds"
              direction="vertical"
              class="max-h-44 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
            >
              <Checkbox v-for="u in userOptions" :key="u.id" :value="u.id" :animate="false">{{ u.username }}</Checkbox>
            </CheckboxGroup>
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="createGroupVisible = false">取消</Button>
          <Button variant="primary" :loading="creatingGroup" @click="submitCreateGroup">创建</Button>
        </template>
      </DialogDefault>

      <DialogDefault v-model:open="editGroupVisible" :title="`编辑用户组：${editGroupForm.name}`" size="sm" :show-confirm="false" :show-cancel="false">
        <div class="space-y-4">
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">组名</div>
            <Input v-model="editGroupForm.name" />
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">成员</div>
            <CheckboxGroup
              v-model="editGroupForm.memberIds"
              direction="vertical"
              class="max-h-44 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
            >
              <Checkbox v-for="u in userOptions" :key="u.id" :value="u.id" :animate="false">{{ u.username }}</Checkbox>
            </CheckboxGroup>
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="editGroupVisible = false">取消</Button>
          <Button variant="primary" :loading="editingGroup" @click="submitEditGroup">保存</Button>
        </template>
      </DialogDefault>
    </Card>

    <!-- 权限组 -->
    <Card v-show="tab === 'roles'" shadow="sm" padding="md">
      <div class="mb-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        权限组 = 一套可复用的授权模板：勾选管理能力（面板功能），并可选授予工作区访问级别（目录权限的默认来源）。
        在「用户管理」里把权限组分配给用户后立即生效。
      </div>
      <div class="mb-4 flex items-center justify-end">
        <Button variant="primary" size="sm" :icon="Plus" @click="openCreateRole">新建权限组</Button>
      </div>
      <Table
        :columns="roleColumns"
        :data="roles"
        row-key="id"
        :loading="rolesLoading"
        striped
        hover
        rounded
        empty-text="暂无权限组"
      >
        <template #cell-name="{ row }">
          <span class="inline-flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
            <Shield :size="15" class="text-zinc-400" />
            {{ row.name }}
          </span>
        </template>
        <template #cell-caps="{ row }">
          <div class="flex flex-wrap gap-1">
            <Chip v-for="c in capChips(row)" :key="c" variant="secondary" size="sm">{{ c }}</Chip>
            <span v-if="capChips(row).length === 0" class="text-xs text-zinc-400">仅工作区授权</span>
          </div>
        </template>
        <template #cell-workspace="{ row }">
          <span class="text-[13px] text-zinc-600 dark:text-zinc-300">{{ workspaceText(row) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="flex items-center gap-1">
            <Button variant="ghost" size="sm" :icon="Pencil" @click="openEditRole(row)">编辑</Button>
            <Popconfirm
              title="删除权限组"
              :description="`确定删除 ${row.name} 吗？${row.memberCount > 0 ? `${row.memberCount} 个成员将解除授权。` : ''}`"
              danger
              confirm-text="删除"
              cancel-text="取消"
              @confirm="removeRole(row)"
            >
              <Button variant="ghost" size="sm" danger :icon="Trash2">删除</Button>
            </Popconfirm>
          </div>
        </template>
      </Table>

      <!-- 新建权限组 -->
      <DialogDefault v-model:open="createRoleVisible" title="新建权限组" size="md" :show-confirm="false" :show-cancel="false">
        <div class="space-y-4">
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">名称</div>
            <Input v-model="createRoleForm.name" placeholder="如：运维助手 / 目录管理员" />
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">管理能力（可多选）</div>
            <CheckboxGroup v-model="createRoleForm.caps" direction="vertical">
              <Checkbox v-for="c in CAP_OPTIONS" :key="c.value" :value="c.value" :animate="false">{{ c.label }}</Checkbox>
            </CheckboxGroup>
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">工作区访问</div>
            <RadioGroup v-model="createRoleForm.workspaceMode" direction="horizontal">
              <Radio value="all">全部工作区</Radio>
              <Radio value="selected">只允许访问指定工作区</Radio>
            </RadioGroup>
            <div v-if="createRoleForm.workspaceMode === 'selected'" class="mt-3 space-y-2">
              <div class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">访问级别</div>
              <RadioGroup v-model="createRoleForm.workspaceLevel" direction="horizontal">
                <Radio value="rw">读写</Radio>
                <Radio value="ro">只读</Radio>
              </RadioGroup>
              <div class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">允许访问的工作区</div>
              <CheckboxGroup
                v-model="createRoleForm.workspaceDirIds"
                direction="vertical"
                class="max-h-40 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
              >
                <Checkbox v-for="d in matrixDirs" :key="d.id" :value="d.id" :animate="false">{{ d.name }}</Checkbox>
              </CheckboxGroup>
              <div v-if="matrixDirs.length === 0" class="text-xs text-zinc-400">暂无共享目录，可先到「目录管理」添加</div>
            </div>
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="createRoleVisible = false">取消</Button>
          <Button variant="primary" :loading="creatingRole" @click="submitCreateRole">创建</Button>
        </template>
      </DialogDefault>

      <!-- 编辑权限组 -->
      <DialogDefault v-model:open="editRoleVisible" :title="`编辑权限组：${editRoleForm.name}`" size="md" :show-confirm="false" :show-cancel="false">
        <div class="space-y-4">
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">名称</div>
            <Input v-model="editRoleForm.name" />
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">管理能力（可多选）</div>
            <CheckboxGroup v-model="editRoleForm.caps" direction="vertical">
              <Checkbox v-for="c in CAP_OPTIONS" :key="c.value" :value="c.value" :animate="false">{{ c.label }}</Checkbox>
            </CheckboxGroup>
          </div>
          <div>
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">工作区访问</div>
            <RadioGroup v-model="editRoleForm.workspaceMode" direction="horizontal">
              <Radio value="all">全部工作区</Radio>
              <Radio value="selected">只允许访问指定工作区</Radio>
            </RadioGroup>
            <div v-if="editRoleForm.workspaceMode === 'selected'" class="mt-3 space-y-2">
              <div class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">访问级别</div>
              <RadioGroup v-model="editRoleForm.workspaceLevel" direction="horizontal">
                <Radio value="rw">读写</Radio>
                <Radio value="ro">只读</Radio>
              </RadioGroup>
              <div class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">允许访问的工作区</div>
              <CheckboxGroup
                v-model="editRoleForm.workspaceDirIds"
                direction="vertical"
                class="max-h-40 overflow-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
              >
                <Checkbox v-for="d in matrixDirs" :key="d.id" :value="d.id" :animate="false">{{ d.name }}</Checkbox>
              </CheckboxGroup>
            </div>
          </div>
        </div>
        <template #footer>
          <Button variant="ghost" @click="editRoleVisible = false">取消</Button>
          <Button variant="primary" :loading="editingRole" @click="submitEditRole">保存</Button>
        </template>
      </DialogDefault>
    </Card>
  </div>
</template>
