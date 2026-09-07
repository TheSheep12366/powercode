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
import Switch from 'fuxsto-design/switch';
import Table from 'fuxsto-design/table';
import { ArrowUp, Folder, FolderPlus, Gauge, Pencil, Trash2 } from 'lucide-vue-next';
import MultiSelect from '@/components/MultiSelect.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createDirectory,
  deleteDirectory,
  directoryStats,
  getAdminMeta,
  getDirectoryDetail,
  listDirectories,
  listServerDirs,
  listUsers,
  mkdirServer,
  updateDirectory,
  type DirectoryRow
} from '@/api/admin';
import { formatBytes, formatDateTime } from '@/utils/format';

const loading = ref(false);
const items = ref<DirectoryRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const q = ref('');
const workspacesRoot = ref('');
const userOptions = ref<{ id: number; username: string }[]>([]);

let searchTimer: number | undefined;

const columns = [
  { key: 'name', title: '名称' },
  { key: 'path', title: '服务器路径' },
  { key: 'visibility', title: '可见性', width: 120 },
  { key: 'createdAt', title: '创建时间', width: 180 },
  { key: 'actions', title: '操作', width: 210 }
];

async function fetchList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listDirectories({ page: page.value, pageSize: pageSize.value, q: q.value || undefined });
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载目录列表失败');
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

function onPageChange(): void {
  void fetchList();
}

// ---- 添加 ----
const createVisible = ref(false);
const creating = ref(false);
const createForm = reactive({
  name: '',
  requireExisting: false,
  visibleToAll: true,
  visibleUserIds: [] as number[]
});

const selectedFolder = ref<string | null>(null);

const effectiveTarget = computed(() =>
  selectedFolder.value ? joinPath(browsePath.value, selectedFolder.value) : browsePath.value
);

function openCreate(): void {
  createForm.name = '';
  createForm.requireExisting = false;
  createForm.visibleToAll = true;
  createForm.visibleUserIds = [];
  selectedFolder.value = null;
  createVisible.value = true;
  // 选择器常驻：每次打开回到根目录
  browsePath.value = '';
  browseParent.value = null;
  browseFolders.value = [];
  void loadBrowse();
}

async function submitCreate(): Promise<void> {
  if (!createForm.name.trim()) {
    Message.warning('请输入名称');
    return;
  }
  if (!effectiveTarget.value || effectiveTarget.value === '/') {
    Message.warning('请先在下方选择器中选择目标目录');
    return;
  }
  creating.value = true;
  try {
    await createDirectory({
      name: createForm.name.trim(),
      path: effectiveTarget.value,
      requireExisting: createForm.requireExisting,
      visibleToAll: createForm.visibleToAll,
      visibleUserIds: createForm.visibleUserIds
    });
    Message.success('共享目录已添加');
    createVisible.value = false;
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '添加失败');
  } finally {
    creating.value = false;
  }
}

// ---- 编辑 ----
const editVisible = ref(false);
const editing = ref(false);
const editForm = reactive({
  id: 0,
  name: '',
  visibleToAll: true,
  visibleUserIds: [] as number[]
});

async function openEdit(row: DirectoryRow): Promise<void> {
  try {
    const detail = await getDirectoryDetail(row.id);
    editForm.id = row.id;
    editForm.name = detail.directory.name;
    editForm.visibleToAll = detail.directory.visibleToAll;
    editForm.visibleUserIds = detail.visibleUserIds;
    editVisible.value = true;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载目录详情失败');
  }
}

async function submitEdit(): Promise<void> {
  if (!editForm.name.trim()) {
    Message.warning('请输入名称');
    return;
  }
  editing.value = true;
  try {
    await updateDirectory(editForm.id, {
      name: editForm.name.trim(),
      visibleToAll: editForm.visibleToAll,
      visibleUserIds: editForm.visibleUserIds
    });
    Message.success('已保存');
    editVisible.value = false;
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    editing.value = false;
  }
}

// ---- 移除 ----
async function remove(row: DirectoryRow): Promise<void> {
  try {
    await deleteDirectory(row.id);
    Message.success('已移除共享');
    await fetchList();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '移除失败');
  }
}

// ---- 大小统计 ----
const statsVisible = ref(false);
const statsLoading = ref(false);
const statsRow = ref<DirectoryRow | null>(null);
const statsData = reactive({ sizeBytes: 0, fileCount: 0 });

async function showStats(row: DirectoryRow): Promise<void> {
  statsRow.value = row;
  statsVisible.value = true;
  statsLoading.value = true;
  try {
    const data = await directoryStats(row.id);
    statsData.sizeBytes = data.sizeBytes;
    statsData.fileCount = data.fileCount;
  } catch (e) {
    statsVisible.value = false;
    Message.error(e instanceof Error ? e.message : '统计失败');
  } finally {
    statsLoading.value = false;
  }
}

// ---- 文件夹选择器 ----
const browsePath = ref('');
const browseParent = ref<string | null>(null);
const browseFolders = ref<string[]>([]);
const browseLoading = ref(false);
const newFolderName = ref('');

function joinPath(dir: string, name: string): string {
  return dir.replace(/\/+$/, '') + '/' + name;
}

async function loadBrowse(path?: string): Promise<void> {
  browseLoading.value = true;
  try {
    const data = await listServerDirs(path);
    browsePath.value = data.path;
    browseParent.value = data.parent;
    browseFolders.value = data.folders;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '读取目录失败');
  } finally {
    browseLoading.value = false;
  }
}

function enterFolder(name: string): void {
  selectedFolder.value = null;
  void loadBrowse(joinPath(browsePath.value, name));
}

function goUp(): void {
  if (browseParent.value) {
    selectedFolder.value = null;
    void loadBrowse(browseParent.value);
  }
}

function toggleSelect(name: string): void {
  selectedFolder.value = selectedFolder.value === name ? null : name;
}

async function createFolder(): Promise<void> {
  const name = newFolderName.value.trim();
  if (!name) {
    Message.warning('请输入新文件夹名');
    return;
  }
  if (!/^[^\\/]{1,64}$/.test(name)) {
    Message.warning('文件夹名不能含路径分隔符，且不超过 64 字符');
    return;
  }
  try {
    const data = await mkdirServer(browsePath.value, name);
    Message.success('文件夹已创建');
    newFolderName.value = '';
    await loadBrowse(browsePath.value);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  }
}

onMounted(async () => {
  void fetchList();
  try {
    const [meta, usersPage] = await Promise.all([getAdminMeta(), listUsers({ page: 1, pageSize: 100 })]);
    workspacesRoot.value = meta.workspacesRoot;
    userOptions.value = usersPage.items.map((u) => ({ id: u.id, username: u.username }));
  } catch (e) {
    console.error('[DirList] meta/users 加载失败:', e);
  }
});
</script>

<template>
  <Card shadow="sm" padding="md">
    <div class="mb-4 flex flex-wrap items-center gap-2.5">
      <Input v-model="q" class="w-60!" placeholder="按名称搜索" clearable @update:model-value="onSearchInput" />
      <div class="flex-1" />
      <Button variant="primary" size="sm" :icon="FolderPlus" @click="openCreate">添加共享目录</Button>
    </div>

    <Table
      :columns="columns"
      :data="items"
      row-key="id"
      :loading="loading"
      striped
      hover
      rounded
      empty-text="暂无共享目录"
    >
      <template #cell-name="{ row }">
        <span class="font-medium text-zinc-900 dark:text-zinc-100">{{ row.name }}</span>
      </template>
      <template #cell-path="{ row }">
        <span class="text-zinc-500 dark:text-zinc-400" :title="row.path">{{ row.path }}</span>
      </template>
      <template #cell-visibility="{ row }">
        <Chip v-if="row.visibleToAll" variant="secondary" size="sm">所有用户</Chip>
        <Chip v-else variant="outline" size="sm">{{ row.visibleCount }} 位用户</Chip>
      </template>
      <template #cell-createdAt="{ row }">
        <span class="text-zinc-500 dark:text-zinc-400">{{ formatDateTime(row.createdAt) }}</span>
      </template>
      <template #cell-actions="{ row }">
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" :icon="Gauge" :loading="statsLoading && statsRow?.id === row.id" @click="showStats(row)">
            统计
          </Button>
          <Button variant="ghost" size="sm" :icon="Pencil" @click="openEdit(row)">编辑</Button>
          <Popconfirm
            title="移除共享"
            :description="`确定移除 ${row.name} 吗？仅解除共享关系，不会删除磁盘上的文件。`"
            danger
            confirm-text="移除"
            cancel-text="取消"
            @confirm="remove(row)"
          >
            <Button variant="ghost" size="sm" danger :icon="Trash2">移除</Button>
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
        @change="onPageChange"
      />
    </div>

    <!-- 添加共享目录 -->
    <DialogDefault v-model:open="createVisible" title="添加共享目录" size="md" :show-confirm="false" :show-cancel="false">
      <div class="space-y-4">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">名称</div>
          <Input v-model="createForm.name" placeholder="如：前端项目" />
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">位置（点击选中，双击图标进入）</div>
          <div class="rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700">
            <div class="mb-2 flex items-center gap-2">
              <Button variant="secondary" size="sm" :icon="ArrowUp" :disabled="!browseParent" @click="goUp">上级…</Button>
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400" :title="effectiveTarget">
                {{ effectiveTarget }}
              </span>
            </div>
            <div class="h-[132px] weak-scrollbar overflow-auto rounded-lg border border-zinc-200 p-1.5 dark:border-zinc-700">
              <div v-if="browseLoading" class="px-2 py-1.5 text-xs text-zinc-400">加载中…</div>
              <div v-else-if="browseFolders.length === 0" class="px-2 py-1.5 text-xs text-zinc-400">
                此层级没有子文件夹
              </div>
              <template v-else>
                <div
                  v-for="name in browseFolders"
                  :key="name"
                  class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors"
                  :class="selectedFolder === name ? 'bg-zinc-900/5 ring-1 ring-zinc-900/30 dark:bg-zinc-100/10 dark:ring-zinc-100/40' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'"
                  @click="toggleSelect(name)"
                >
                  <span class="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] text-zinc-800 dark:text-zinc-200">
                    <Folder :size="16" class="shrink-0 text-zinc-400" />
                    <span class="truncate">{{ name }}</span>
                  </span>
                  <Button variant="ghost" size="sm" @click.stop="enterFolder(name)">进入</Button>
                </div>
              </template>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <Input v-model="newFolderName" class="flex-1!" placeholder="新文件夹名（在当前目录创建）" size="sm" @keyup.enter="createFolder" />
              <Button variant="secondary" size="sm" @click="createFolder">新建</Button>
            </div>
          </div>
          <div class="mt-1.5 text-xs text-zinc-400">
            将创建到：<span class="font-mono">{{ effectiveTarget || '…' }}</span>（未选择子文件夹时使用当前目录）
          </div>
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">来源</div>
          <RadioGroup v-model="createForm.requireExisting" direction="horizontal">
            <Radio :value="false">不存在则自动创建</Radio>
            <Radio :value="true">必须是已存在目录</Radio>
          </RadioGroup>
        </div>
        <div>
          <div class="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            所有用户可见
            <Switch v-model="createForm.visibleToAll" size="sm" />
          </div>
          <div v-if="!createForm.visibleToAll">
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">可见用户</div>
            <MultiSelect
              v-model="createForm.visibleUserIds"
              :options="userOptions.map((u) => ({ label: u.username, value: u.id }))"
              placeholder="选择可见的用户"
            />
            <div class="mt-1 text-xs text-zinc-400">勾选后仅这些用户能在工作区看到该目录；一个都不勾则谁都看不到</div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="createVisible = false">取消</Button>
        <Button variant="primary" :loading="creating" @click="submitCreate">添加</Button>
      </template>
    </DialogDefault>

    <!-- 编辑共享目录 -->
    <DialogDefault v-model:open="editVisible" title="编辑共享目录" size="md" :show-confirm="false" :show-cancel="false">
      <div class="space-y-4">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">名称</div>
          <Input v-model="editForm.name" />
        </div>
        <div>
          <div class="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            所有用户可见
            <Switch v-model="editForm.visibleToAll" size="sm" />
          </div>
          <div v-if="!editForm.visibleToAll">
            <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">可见用户</div>
            <MultiSelect
              v-model="editForm.visibleUserIds"
              :options="userOptions.map((u) => ({ label: u.username, value: u.id }))"
              placeholder="选择可见的用户"
            />
          </div>
        </div>
        <div class="text-xs text-zinc-400">共享路径创建后不可修改，以避免会话与权限错乱</div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="editVisible = false">取消</Button>
        <Button variant="primary" :loading="editing" @click="submitEdit">保存</Button>
      </template>
    </DialogDefault>

    <!-- 大小统计 -->
    <DialogDefault v-model:open="statsVisible" :title="`大小统计：${statsRow?.name ?? ''}`" size="sm" :show-confirm="false" :show-cancel="false">
      <div class="min-h-20 transition-opacity duration-150" :class="statsLoading ? 'pointer-events-none opacity-50' : ''">
        <div class="flex items-center justify-between gap-4 border-b border-zinc-200 py-2.5 text-[13px] dark:border-zinc-800">
          <span class="shrink-0 text-zinc-500 dark:text-zinc-400">路径</span>
          <span class="break-all text-right text-zinc-900 dark:text-zinc-100">{{ statsRow?.path }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 border-b border-zinc-200 py-2.5 dark:border-zinc-800">
          <span class="text-zinc-500 dark:text-zinc-400">磁盘占用</span>
          <span class="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">{{ formatBytes(statsData.sizeBytes) }}</span>
        </div>
        <div class="flex items-center justify-between gap-4 py-2.5">
          <span class="text-zinc-500 dark:text-zinc-400">文件数量</span>
          <span class="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">{{ statsData.fileCount.toLocaleString() }} 个</span>
        </div>
      </div>
      <template #footer>
        <Button variant="primary" @click="statsVisible = false">好的</Button>
      </template>
    </DialogDefault>
  </Card>
</template>
