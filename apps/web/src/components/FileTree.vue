<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import Popconfirm from 'fuxsto-design/popconfirm';
import {
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Pencil,
  Trash2,
  Upload
} from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import type { MyDirectory } from '@/api/my';
import { createEntry, deleteEntry, downloadUrl, listDir, renameEntry, uploadFile, zipUrl, type MyFileEntry } from '@/api/my-fs';
import { colorFor } from '@/utils/color';

export interface DirInfo {
  id: number;
  name: string;
  path: string;
  permission: 'ro' | 'rw' | 'deny' | 'none' | 'admin';
}

export interface TreePresence {
  userId: number;
  username: string;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

const props = withDefaults(
  defineProps<{
    dirs: DirInfo[];
    /** 全站在线协作状态（用于“XX正在编辑”指示） */
    presence?: TreePresence[];
    /** 自己的 userId（不给自己标“正在编辑”） */
    selfUserId?: number;
  }>(),
  { presence: () => [], selfUserId: 0 }
);
const emit = defineEmits<{
  open: [dirId: number, dirName: string, path: string, name: string];
}>();

interface Row {
  key: string;
  dirId: number;
  dirName: string;
  /** 目录内相对路径（文件夹为路径本身，文件为文件全路径） */
  path: string;
  name: string;
  type: 'root' | 'folder' | 'file';
  depth: number;
  permission: DirInfo['permission'];
}

const expanded = reactive(new Set<string>());
const EXPANDED_KEY = 'pc-tree-expanded';
try {
  const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[];
  if (Array.isArray(saved)) saved.forEach((k) => expanded.add(k));
} catch {
  // 忽略损坏数据
}
watch(
  () => [...expanded],
  (keys) => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify(keys));
    } catch {
      // 存储失败不影响使用
    }
  }
);
const childrenCache = reactive(new Map<string, MyFileEntry[]>());
const loadingKeys = reactive(new Set<string>());
const selectedKey = ref<string>('');

function isWritable(permission: DirInfo['permission']): boolean {
  return permission === 'rw' || permission === 'admin';
}

function rowIsWritable(row: Row): boolean {
  return isWritable(row.permission);
}

async function loadChildren(dirId: number, path: string): Promise<void> {
  const key = `d${dirId}:${path}`;
  loadingKeys.add(key);
  try {
    const data = await listDir(dirId, path);
    childrenCache.set(key, data.items);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '读取目录失败');
  } finally {
    loadingKeys.delete(key);
  }
}

function toggle(row: Row): void {
  if (row.type === 'file') return;
  const key = row.key;
  if (expanded.has(key)) {
    expanded.delete(key);
    return;
  }
  expanded.add(key);
  if (!childrenCache.has(key)) {
    void loadChildren(row.dirId, row.path);
  }
}

function select(row: Row): void {
  selectedKey.value = row.key;
}

/** 展开后的扁平行列表 */
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  // walk 负责推入“文件夹自身这一行”，父层不再重复推入（修复展开后出现两份的 bug）
  const walk = (dir: DirInfo, parentPath: string, depth: number): void => {
    const key = `d${dir.id}:${parentPath}`;
    out.push({
      key,
      dirId: dir.id,
      dirName: dir.name,
      path: parentPath,
      name: depth === 0 ? dir.name : parentPath.split('/').pop() ?? dir.name,
      type: depth === 0 ? 'root' : 'folder',
      depth,
      permission: dir.permission
    });
    if (!expanded.has(key)) return;
    const items = childrenCache.get(key) ?? [];
    for (const item of items) {
      const childPath = parentPath ? `${parentPath}/${item.name}` : item.name;
      const childKey = `d${dir.id}:${childPath}`;
      if (item.type === 'folder') {
        walk(dir, childPath, depth + 1);
      } else {
        out.push({
          key: childKey,
          dirId: dir.id,
          dirName: dir.name,
          path: childPath,
          name: item.name,
          type: 'file',
          depth: depth + 1,
          permission: dir.permission
        });
      }
    }
  };
  for (const dir of props.dirs) {
    walk(dir, '', 0);
  }
  return out;
});

const selectedRow = computed<Row | null>(() => rows.value.find((r) => r.key === selectedKey.value) ?? null);

/** 正在编辑该文件的其他用户 */
function editorsOf(row: Row): TreePresence[] {
  if (row.type !== 'file') return [];
  return props.presence.filter(
    (p) =>
      p.userId !== props.selfUserId &&
      p.currentDoc &&
      p.currentDoc.dirId === row.dirId &&
      p.currentDoc.path === row.path
  );
}

/** 操作目标文件夹：选中文件夹→它；选中文件→父目录；未选中→第一个目录根 */
const targetFolder = computed<{ dirId: number; dirName: string; path: string; permission: DirInfo['permission'] } | null>(() => {
  const s = selectedRow.value;
  if (!s) return props.dirs[0] ? { dirId: props.dirs[0].id, dirName: props.dirs[0].name, path: '', permission: props.dirs[0].permission } : null;
  if (s.type === 'file') {
    const parentPath = s.path.split('/').slice(0, -1).join('/');
    const parentKey = `d${s.dirId}:${parentPath}`;
    const parent = rows.value.find((r) => r.key === parentKey);
    return { dirId: s.dirId, dirName: s.dirName, path: parentPath, permission: parent?.permission ?? s.permission };
  }
  return { dirId: s.dirId, dirName: s.dirName, path: s.path, permission: s.permission };
});

const targetWritable = computed(() => (targetFolder.value ? isWritable(targetFolder.value.permission) : false));

function parentKeyOf(row: Row): string {
  const parentPath = row.path.split('/').slice(0, -1).join('/');
  return `d${row.dirId}:${parentPath}`;
}

async function refreshChildren(dirId: number, path: string): Promise<void> {
  await loadChildren(dirId, path);
}

function openFile(row: Row): void {
  emit('open', row.dirId, row.dirName, row.path, row.name);
}

// ---- 新建 ----
const createVisible = ref(false);
const createType = ref<'file' | 'folder'>('file');
const createName = ref('');

function openCreate(type: 'file' | 'folder'): void {
  const target = targetFolder.value;
  if (!target) {
    Message.warning('请先展开并选择一个目录');
    return;
  }
  if (!targetWritable.value) {
    Message.warning('该目录为只读，无法新建');
    return;
  }
  createType.value = type;
  createName.value = '';
  createVisible.value = true;
}

async function submitCreate(): Promise<void> {
  const name = createName.value.trim();
  const target = targetFolder.value;
  if (!target) return;
  if (!name || name.includes('/') || name.startsWith('.')) {
    Message.warning('名称不合法（不能含 / 或以 . 开头）');
    return;
  }
  try {
    await createEntry(target.dirId, target.path ? `${target.path}/${name}` : name, createType.value);
    Message.success('已创建');
    createVisible.value = false;
    // 展开目标目录并刷新
    const targetKey = `d${target.dirId}:${target.path}`;
    expanded.add(targetKey);
    await refreshChildren(target.dirId, target.path);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  }
}

// ---- 重命名 ----
const renameVisible = ref(false);
const renameName = ref('');
const renameRow = ref<Row | null>(null);

function openRename(row: Row): void {
  if (!rowIsWritable(row)) {
    Message.warning('该目录为只读，无法重命名');
    return;
  }
  renameRow.value = row;
  renameName.value = row.name;
  renameVisible.value = true;
}

async function submitRename(): Promise<void> {
  const row = renameRow.value;
  if (!row) return;
  const name = renameName.value.trim();
  if (!name || name.includes('/') || name.startsWith('.')) {
    Message.warning('名称不合法');
    return;
  }
  const parentPath = row.path.split('/').slice(0, -1).join('/');
  try {
    await renameEntry(row.dirId, row.path, parentPath ? `${parentPath}/${name}` : name);
    Message.success('已重命名');
    renameVisible.value = false;
    selectedKey.value = '';
    await refreshChildren(row.dirId, parentPath);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '重命名失败');
  }
}

// ---- 删除 ----
async function remove(row: Row): Promise<void> {
  try {
    await deleteEntry(row.dirId, row.path);
    Message.success('已删除');
    selectedKey.value = '';
    await refreshChildren(row.dirId, row.path.split('/').slice(0, -1).join('/'));
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

// ---- 上传 ----
const fileInput = ref<HTMLInputElement>();

function openUpload(): void {
  const target = targetFolder.value;
  if (!target) {
    Message.warning('请先选择一个目录');
    return;
  }
  if (!targetWritable.value) {
    Message.warning('该目录为只读，无法上传');
    return;
  }
  fileInput.value?.click();
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  const target = targetFolder.value;
  if (!files || files.length === 0 || !target) return;
  for (const file of Array.from(files)) {
    try {
      await uploadFile(target.dirId, target.path, file);
      Message.success(`已上传 ${file.name}`);
    } catch (e) {
      Message.error(e instanceof Error ? e.message : `上传 ${file.name} 失败`);
    }
  }
  input.value = '';
  const targetKey = `d${target.dirId}:${target.path}`;
  expanded.add(targetKey);
  await refreshChildren(target.dirId, target.path);
}

function downloadRow(row: Row): void {
  window.open(downloadUrl(row.dirId, row.path), '_blank');
}

function downloadZip(row: Row): void {
  window.open(zipUrl(row.dirId, row.path), '_blank');
}

/** 供父组件在 fs:changed 时刷新某个目录的全部已展开层 */
async function refreshDir(dirId: number): Promise<void> {
  const keys = [...expanded].filter((k) => k.startsWith(`d${dirId}:`));
  await Promise.all(keys.map((k) => loadChildren(dirId, k.replace(`d${dirId}:`, ''))));
}

defineExpose({ refreshDir });

function rowIcon(row: Row): unknown {
  if (row.type === 'file') return FileIcon;
  return expanded.has(row.key) ? FolderOpen : Folder;
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <Button variant="ghost" size="sm" :icon="FilePlus" title="新建文件" @click="openCreate('file')">文件</Button>
      <Button variant="ghost" size="sm" :icon="FolderPlus" title="新建文件夹" @click="openCreate('folder')">文件夹</Button>
      <Button variant="ghost" size="sm" :icon="Upload" title="上传到选中目录" @click="openUpload">上传</Button>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onFileChosen" />
    </div>

    <!-- 树 -->
    <div class="min-h-0 flex-1 overflow-auto px-1.5 py-2">
      <div v-if="dirs.length === 0" class="px-3 py-6 text-xs text-zinc-400">
        暂无可访问的共享目录，请联系管理员分配
      </div>
      <div
        v-for="row in rows"
        :key="row.key"
        class="group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
        :class="selectedKey === row.key ? 'bg-zinc-200/80 dark:bg-zinc-700/70' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'"
        :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
        @click="row.type === 'file' ? (select(row), openFile(row)) : (select(row), toggle(row))"
      >
        <component
          :is="row.type === 'file' ? FileIcon : expanded.has(row.key) ? FolderOpen : Folder"
          :size="15"
          class="shrink-0"
          :class="row.type === 'file' ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-400'"
        />
        <span class="min-w-0 flex-1 truncate" :class="row.type === 'file' ? 'text-zinc-700 dark:text-zinc-300' : 'font-medium text-zinc-800 dark:text-zinc-200'">
          {{ row.name }}
        </span>
        <!-- 正在编辑指示 -->
        <span v-if="editorsOf(row).length > 0" class="flex shrink-0 items-center gap-1">
          <span
            v-for="p in editorsOf(row).slice(0, 3)"
            :key="p.userId"
            class="max-w-20 truncate rounded-full px-1.5 py-0.5 text-[10px] leading-none"
            :style="{ color: colorFor(p.userId), backgroundColor: `${colorFor(p.userId)}22`, border: `1px solid ${colorFor(p.userId)}55` }"
            :title="`${p.username} 正在编辑此文件`"
          >
            ✍ {{ p.username }}
          </span>
          <span
            v-if="editorsOf(row).length > 3"
            class="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
            :title="editorsOf(row).slice(3).map((p) => p.username).join('、')"
          >
            +{{ editorsOf(row).length - 3 }}
          </span>
        </span>
        <Chip v-if="row.depth === 0 && row.permission !== 'rw' && row.permission !== 'admin'" variant="outline" size="sm">只读</Chip>

        <!-- 行内操作（悬停显示） -->
        <span class="hidden items-center gap-0.5 group-hover:inline-flex" @click.stop>
          <template v-if="row.type === 'file'">
            <button class="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-600" title="下载" @click="downloadRow(row)">
              <Download :size="14" />
            </button>
          </template>
          <template v-else>
            <button class="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-600" title="下载 zip" @click="downloadZip(row)">
              <Download :size="14" />
            </button>
          </template>
          <button
            v-if="row.type !== 'root'"
            class="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-600"
            :title="rowIsWritable(row) ? '重命名' : '只读目录'"
            :class="!rowIsWritable(row) ? 'opacity-30' : ''"
            @click="rowIsWritable(row) && openRename(row)"
          >
            <Pencil :size="14" />
          </button>
          <Popconfirm
            v-if="row.type !== 'root'"
            title="删除"
            :description="`确定删除 ${row.name} 吗？该操作不可恢复。`"
            danger
            confirm-text="删除"
            cancel-text="取消"
            @confirm="rowIsWritable(row) && remove(row)"
          >
            <button
              class="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40"
              :class="!rowIsWritable(row) ? 'opacity-30' : ''"
              title="删除"
            >
              <Trash2 :size="14" />
            </button>
          </Popconfirm>
        </span>
      </div>
    </div>

    <!-- 新建 -->
    <DialogDefault v-model:open="createVisible" :title="createType === 'file' ? '新建文件' : '新建文件夹'" size="sm" :show-confirm="false" :show-cancel="false">
      <div class="space-y-3">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">名称</div>
          <Input v-model="createName" :placeholder="createType === 'file' ? '如：index.js' : '如：components'" @keyup.enter="submitCreate" />
        </div>
        <div class="text-xs text-zinc-400">
          将创建到：{{ targetFolder?.dirName }}/{{ targetFolder?.path || '' }}
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="createVisible = false">取消</Button>
        <Button variant="primary" @click="submitCreate">创建</Button>
      </template>
    </DialogDefault>

    <!-- 重命名 -->
    <DialogDefault v-model:open="renameVisible" title="重命名" size="sm" :show-confirm="false" :show-cancel="false">
      <div class="space-y-3">
        <Input v-model="renameName" @keyup.enter="submitRename" />
      </div>
      <template #footer>
        <Button variant="ghost" @click="renameVisible = false">取消</Button>
        <Button variant="primary" @click="submitRename">保存</Button>
      </template>
    </DialogDefault>
  </div>
</template>
