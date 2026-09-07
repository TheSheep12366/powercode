<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import Pagination from 'fuxsto-design/pagination';
import Popconfirm from 'fuxsto-design/popconfirm';
import Radio from 'fuxsto-design/radio';
import RadioGroup from 'fuxsto-design/radio-group';
import Select from 'fuxsto-design/select';
import Table from 'fuxsto-design/table';
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  updateUser,
  type RoleRow,
  type UserRow
} from '@/api/admin';
import { useAuthStore } from '@/stores/auth';
import UserAvatar from '@/components/UserAvatar.vue';
import UserHomeDialog from '@/components/UserHomeDialog.vue';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();
const homeOpen = ref(false);
const homeUserId = ref<number | null>(null);
function openHome(id: number): void {
  homeUserId.value = id;
  homeOpen.value = true;
}

const loading = ref(false);
const items = ref<UserRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const q = ref('');
const roleFilter = ref<string>('');
const statusFilter = ref<string>('');
const roles = ref<RoleRow[]>([]);
const sortBy = ref<'username' | 'role' | 'status' | 'createdAt'>('createdAt');
const order = ref<'asc' | 'desc'>('desc');

let searchTimer: number | undefined;

const columns = [
  { key: 'username', title: '用户名', sortable: true },
  { key: 'role', title: '角色', sortable: true, width: 120 },
  { key: 'status', title: '状态', sortable: true, width: 100 },
  { key: 'createdAt', title: '创建时间', sortable: true, width: 180 },
  { key: 'actions', title: '操作', width: 160 }
];

async function fetchList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listUsers({
      page: page.value,
      pageSize: pageSize.value,
      q: q.value || undefined,
      role: (roleFilter.value || undefined) as 'admin' | 'user' | undefined,
      status: (statusFilter.value || undefined) as 'active' | 'disabled' | undefined,
      sortBy: sortBy.value,
      order: order.value
    });
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载用户列表失败');
  } finally {
    loading.value = false;
  }
}

function onSearchInput(): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
    void fetchList();
  }, 300);
}

function onFilterChange(): void {
  page.value = 1;
  void fetchList();
}

function onSortChange(column: { key: string }, sort: 'asc' | 'desc' | null): void {
  if (sort === null) {
    sortBy.value = 'createdAt';
    order.value = 'desc';
  } else {
    sortBy.value = column.key as typeof sortBy.value;
    order.value = sort;
  }
  fetchList();
}

function roleLabel(role: string): string {
  return role === 'admin' ? '管理员' : '普通用户';
}
function statusLabel(status: string): string {
  return status === 'active' ? '启用' : '禁用';
}

const roleGroupOptions = computed(() => [
  { label: '（无权限组）', value: 0 },
  ...roles.value.map((r) => ({ label: r.name, value: r.id }))
]);

async function loadRoles(): Promise<void> {
  try {
    const data = await listRoles();
    roles.value = data.items;
  } catch {
    // 权限组加载失败不阻塞页面
  }
}

// ---- 新建用户 ----
const createVisible = ref(false);
const creating = ref(false);
const createForm = reactive({
  username: '',
  password: '',
  role: 'user' as 'admin' | 'user',
  status: 'active' as 'active' | 'disabled',
  roleId: 0
});

function openCreate(): void {
  createForm.username = '';
  createForm.password = '';
  createForm.role = 'user';
  createForm.status = 'active';
  createForm.roleId = 0;
  createVisible.value = true;
}

async function submitCreate(): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(createForm.username.trim())) {
    Message.warning('用户名需 3-32 位，仅限字母、数字、下划线和连字符');
    return;
  }
  if (createForm.password.length < 8) {
    Message.warning('初始密码至少 8 位');
    return;
  }
  creating.value = true;
  try {
    await createUser({ ...createForm, username: createForm.username.trim(), roleId: createForm.roleId || null });
    Message.success('用户已创建');
    createVisible.value = false;
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  } finally {
    creating.value = false;
  }
}

// ---- 编辑用户 ----
const editVisible = ref(false);
const editing = ref(false);
const editForm = reactive<{
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  password: string;
  roleId: number | null;
}>({ id: 0, username: '', role: 'user', status: 'active', password: '', roleId: null });
const editSelf = computed(() => editForm.id === auth.user?.id);

function openEdit(row: UserRow): void {
  editForm.id = row.id;
  editForm.username = row.username;
  editForm.role = row.role;
  editForm.status = row.status;
  editForm.password = '';
  editForm.roleId = row.roleId ?? null;
  editVisible.value = true;
}

async function submitEdit(): Promise<void> {
  if (editForm.password && editForm.password.length < 8) {
    Message.warning('重置密码至少 8 位');
    return;
  }
  editing.value = true;
  const payload: { password?: string; role: 'admin' | 'user'; status: 'active' | 'disabled'; roleId: number | null } = {
    role: editForm.role,
    status: editForm.status,
    roleId: editForm.roleId
  };
  if (editForm.password) payload.password = editForm.password;
  try {
    await updateUser(editForm.id, payload);
    Message.success('已保存');
    editVisible.value = false;
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    editing.value = false;
  }
}

// ---- 删除用户 ----
async function remove(row: UserRow): Promise<void> {
  try {
    await deleteUser(row.id);
    Message.success('已删除');
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(() => {
  void fetchList();
  void loadRoles();
});
</script>

<template>
  <Card shadow="sm" padding="md">
    <div class="mb-4 flex flex-wrap items-center gap-2.5">
      <Input
        v-model="q"
        class="w-56!"
        placeholder="按用户名搜索"
        clearable
        @update:model-value="onSearchInput"
      />
      <Select
        v-model="roleFilter"
        class="w-36!"
        placeholder="角色"
        clearable
        :options="[
          { label: '管理员', value: 'admin' },
          { label: '普通用户', value: 'user' }
        ]"
        @change="onFilterChange"
        @clear="onFilterChange"
      />
      <Select
        v-model="statusFilter"
        class="w-36!"
        placeholder="状态"
        clearable
        :options="[
          { label: '启用', value: 'active' },
          { label: '禁用', value: 'disabled' }
        ]"
        @change="onFilterChange"
        @clear="onFilterChange"
      />
      <div class="flex-1" />
      <Button variant="primary" size="sm" :icon="Plus" @click="openCreate">新建用户</Button>
    </div>

    <Table
      :columns="columns"
      :data="items"
      row-key="id"
      :loading="loading"
      striped
      hover
      rounded
      empty-text="暂无用户"
      @sort-change="onSortChange"
    >
      <template #cell-username="{ row }">
        <span class="inline-flex items-center gap-2">
          <UserAvatar :user-id="row.id" :name="row.username" :avatar-ext="row.avatarExt" :avatar-version="row.avatarVersion" :size="26" :online="row.online" />
          <button class="font-medium text-zinc-900 hover:underline dark:text-zinc-100" @click="openHome(row.id)">
            {{ row.username }}
          </button>
          <Chip v-if="row.id === auth.user?.id" variant="secondary" size="sm">当前用户</Chip>
          <Chip v-if="row.roleName" variant="outline" size="sm">{{ row.roleName }}</Chip>
        </span>
      </template>
      <template #cell-role="{ row }">
        <Chip :variant="row.role === 'admin' ? 'primary' : 'secondary'" size="sm">
          {{ roleLabel(row.role) }}
        </Chip>
      </template>
      <template #cell-status="{ row }">
        <Chip :variant="row.status === 'active' ? 'default' : 'secondary'" size="sm" :class="row.status === 'active' ? '' : 'opacity-60'">
          {{ statusLabel(row.status) }}
        </Chip>
      </template>
      <template #cell-createdAt="{ row }">
        <span class="text-zinc-500 dark:text-zinc-400">{{ formatDateTime(row.createdAt) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" :icon="Pencil" @click="openEdit(row)">编辑</Button>
          <Popconfirm
            title="删除用户"
            :description="`确定删除 ${row.username} 吗？其会话与关联数据将一并清除。`"
            danger
            confirm-text="删除"
            cancel-text="取消"
            @confirm="remove(row)"
          >
            <Button variant="ghost" size="sm" danger :icon="Trash2" :disabled="row.id === auth.user?.id">删除</Button>
          </Popconfirm>
        </div>
      </template>
    </Table>

    <div class="mt-4 flex justify-end">
      <Pagination
        v-model:current="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        show-size-changer
        show-total
        @change="(_, ps) => { if (ps !== pageSize) { page = 1; } fetchList(); }"
      />
    </div>

    <!-- 新建用户 -->
    <DialogDefault v-model:open="createVisible" title="新建用户" size="sm" :show-confirm="false" :show-cancel="false">
      <div class="space-y-4">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">用户名</div>
          <Input v-model="createForm.username" placeholder="3-32 位字母/数字/_/-" />
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">初始密码</div>
          <Input v-model="createForm.password" type="password" placeholder="至少 8 位" />
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">角色</div>
          <RadioGroup v-model="createForm.role" direction="horizontal">
            <Radio value="user">普通用户</Radio>
            <Radio value="admin">管理员</Radio>
          </RadioGroup>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">权限组</div>
          <Select v-model="createForm.roleId" class="w-full!" :options="roleGroupOptions" />
          <div class="mt-1 text-xs text-zinc-400">权限组决定其管理能力与工作区授权；管理员不受影响</div>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">状态</div>
          <RadioGroup v-model="createForm.status" direction="horizontal">
            <Radio value="active">启用</Radio>
            <Radio value="disabled">禁用</Radio>
          </RadioGroup>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="createVisible = false">取消</Button>
        <Button variant="primary" :loading="creating" @click="submitCreate">创建</Button>
      </template>
    </DialogDefault>

    <!-- 编辑用户 -->
    <DialogDefault v-model:open="editVisible" :title="`编辑用户：${editForm.username}`" size="sm" :show-confirm="false" :show-cancel="false">
      <div class="space-y-4">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            角色 <span v-if="editSelf" class="font-normal text-zinc-400">（不能修改自己的角色或状态）</span>
          </div>
          <RadioGroup v-model="editForm.role" direction="horizontal" :disabled="editSelf">
            <Radio value="user">普通用户</Radio>
            <Radio value="admin">管理员</Radio>
          </RadioGroup>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">状态</div>
          <RadioGroup v-model="editForm.status" direction="horizontal" :disabled="editSelf">
            <Radio value="active">启用</Radio>
            <Radio value="disabled">禁用</Radio>
          </RadioGroup>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">权限组</div>
          <Select v-model="editForm.roleId" class="w-full!" :options="roleGroupOptions" />
          <div class="mt-1 text-xs text-zinc-400">权限组决定其管理能力与工作区授权；管理员不受影响</div>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">重置密码</div>
          <Input v-model="editForm.password" type="password" placeholder="留空表示不修改" />
          <div class="mt-1 text-xs text-zinc-400">重置后该用户所有登录会话将被踢出</div>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="editVisible = false">取消</Button>
        <Button variant="primary" :loading="editing" @click="submitEdit">保存</Button>
      </template>
    </DialogDefault>

    <UserHomeDialog v-model:open="homeOpen" :user-id="homeUserId" />
  </Card>
</template>
