<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import { Message } from 'fuxsto-design/message';
import Popconfirm from 'fuxsto-design/popconfirm';
import {
  ChevronLeft,
  ChevronRight,
  File as FileIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Sun,
  TerminalSquare,
  Users,
  X
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { emitEditing, onFsChanged, usePresence } from '@/composables/presence';
import CollabEditor from '@/components/CollabEditor.vue';
import FileTree, { type DirInfo } from '@/components/FileTree.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import UserHomeDialog from '@/components/UserHomeDialog.vue';
import { myDirectories } from '@/api/my';
import { statFile } from '@/api/my-fs';
import { toggleTheme, useTheme } from '@/composables/theme';
import { colorFor } from '@/utils/color';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { isDark } = useTheme();

// ---- 共享目录 ----
interface PresenceEntry {
  userId: number;
  username: string;
  roleName: string | null;
  isAdmin: boolean;
  avatarExt: string | null;
  avatarVersion: number | null;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

const dirs = ref<DirInfo[]>([]);
const dirId = computed(() => Number(route.params.dirId));
const currentDir = computed(() => dirs.value.find((d) => d.id === dirId.value) ?? null);
const fileTreeRef = ref<InstanceType<typeof FileTree> | null>(null);

const { list: presence } = usePresence();
const dirPresence = computed(() => presence.value.filter((p) => p.currentDoc?.dirId === dirId.value));

// ---- 边栏收起 ----
const leftOpen = ref(true);
const rightOpen = ref(true);
const terminalOpen = ref(false);

// ---- 打开的文件标签 ----
interface OpenTab {
  key: string;
  dirId: number;
  dirName: string;
  path: string;
  name: string;
  color: string;
  status: 'loading' | 'ready' | 'error';
  error: string;
  dirty: boolean;
}
const tabs = ref<OpenTab[]>([]);
const activeKey = ref('');
const editorRefs = ref<Record<string, InstanceType<typeof CollabEditor>>>({});
const closeConfirmKey = ref('');
const homeOpen = ref(false);
const homeUserId = ref<number | null>(null);

// 会话级状态持久化（离开工作区后回来恢复标签页）
const TABS_KEY = computed(() => `pc-ws-tabs:${dirId.value}`);

function persistTabs(): void {
  if (!dirId.value) return;
  try {
    sessionStorage.setItem(
      TABS_KEY.value,
      JSON.stringify({ tabs: tabs.value.map(({ key, dirId: d, dirName, path, name, color }) => ({ key, dirId: d, dirName, path, name, color })), activeKey: activeKey.value })
    );
  } catch {
    // 存储失败不影响使用
  }
}

function restoreTabs(): void {
  try {
    const raw = sessionStorage.getItem(TABS_KEY.value);
    if (!raw) return;
    const saved = JSON.parse(raw) as { tabs: Array<Omit<OpenTab, 'status' | 'error' | 'dirty'>>; activeKey: string };
    tabs.value = saved.tabs.map((t) => ({ ...t, status: 'loading', error: '', dirty: false }));
    activeKey.value = saved.activeKey && tabs.value.some((t) => t.key === saved.activeKey) ? saved.activeKey : tabs.value[0]?.key ?? '';
  } catch {
    // 恢复失败忽略
  }
}

watch([tabs, activeKey], persistTabs, { deep: true });

const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value) ?? null);

function setEditorRef(key: string): (el: unknown) => void {
  return (el) => {
    if (el) editorRefs.value[key] = el as InstanceType<typeof CollabEditor>;
    else delete editorRefs.value[key];
  };
}

function saveActive(): void {
  const t = activeTab.value;
  if (!t) return;
  const editor = editorRefs.value[t.key];
  if (editor?.requestSave) {
    editor.requestSave();
    Message.success('已请求保存');
  }
}

async function openFile(targetDirId: number, targetDirName: string, path: string, name: string): Promise<void> {
  const key = `d${targetDirId}:${path}`;
  const existing = tabs.value.find((t) => t.key === key);
  if (existing) {
    activeKey.value = key;
    return;
  }
  try {
    const st = await statFile(targetDirId, path);
    if (!st.exists || !st.isFile) {
      Message.warning('目标不存在或不是文件');
      return;
    }
    if (!st.editable) {
      Message.warning(`${name}：${st.reason ?? '无法编辑'}，可从文件树下载查看`);
      return;
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '读取文件信息失败');
    return;
  }
  tabs.value.push({
    key,
    dirId: targetDirId,
    dirName: targetDirName,
    path,
    name,
    color: colorFor(auth.user?.id ?? 0),
    status: 'loading',
    error: '',
    dirty: false
  });
  activeKey.value = key;
}

function closeTab(key: string): void {
  const idx = tabs.value.findIndex((t) => t.key === key);
  if (idx < 0) return;
  tabs.value.splice(idx, 1);
  closeConfirmKey.value = '';
  if (activeKey.value === key) {
    activeKey.value = tabs.value[Math.max(0, idx - 1)]?.key ?? '';
  }
}

function requestClose(key: string): void {
  const tab = tabs.value.find((t) => t.key === key);
  if (tab?.dirty) {
    closeConfirmKey.value = key;
  } else {
    closeTab(key);
  }
}

function jumpTo(doc: { dirId: number; dirName: string; path: string; name: string }): void {
  if (doc.dirId !== dirId.value) {
    Message.warning('该文件属于其他项目');
    return;
  }
  void openFile(doc.dirId, doc.dirName, doc.path, doc.name);
}

// 上报当前正在编辑的文件
watch(
  activeTab,
  (tab) => {
    emitEditing(
      tab ? { dirId: tab.dirId, dirName: tab.dirName, path: tab.path, name: tab.name } : null
    );
  },
  { deep: false }
);

async function loadDirs(): Promise<void> {
  try {
    const data = await myDirectories();
    dirs.value = data.items.map((d) => ({
      id: d.id,
      name: d.name,
      path: d.path,
      permission: d.permission as DirInfo['permission']
    }));
    if (!currentDir.value) {
      Message.warning('项目不存在或无权访问');
      router.replace('/workspace');
    }
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载共享目录失败');
  }
}

onMounted(async () => {
  await loadDirs();
  restoreTabs();
  const fsHandler = (payload: { directoryId: number }): void => {
    if (payload.directoryId === dirId.value) {
      void fileTreeRef.value?.refreshDir(payload.directoryId);
    }
  };
  onFsChanged(fsHandler);
});

onBeforeUnmount(() => {
  // 离开工作区：清空自己的“正在编辑”状态（全局 socket 常驻，需显式上报）
  emitEditing(null);
  // 全局 presence socket 在 App 层管理，不在此断开
});
</script>

<template>
  <div class="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <!-- 顶栏 -->
    <header class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" :icon="ChevronLeft" @click="router.push('/workspace')">项目</Button>
        <span v-if="currentDir" class="truncate font-bold text-zinc-900 dark:text-zinc-50">{{ currentDir.name }}</span>
        <Chip v-if="currentDir && (currentDir.permission === 'admin' || currentDir.permission === 'rw')" variant="secondary" size="sm">读写</Chip>
        <Chip v-else-if="currentDir" variant="outline" size="sm">只读</Chip>
        <Chip variant="secondary" size="sm">
          <span class="inline-flex items-center gap-1"><Users :size="12" /> {{ dirPresence.length }} 人编辑中</span>
        </Chip>
      </div>
      <div class="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" :icon="Save" :disabled="!activeTab" @click="saveActive">保存</Button>
        <Button variant="ghost" size="sm" :title="isDark ? '切换亮色' : '切换暗色'" @click="toggleTheme()">
          <Moon v-if="!isDark" :size="16" />
          <Sun v-else :size="16" />
        </Button>
        <Button variant="ghost" size="sm" :title="leftOpen ? '收起文件树' : '展开文件树'" @click="leftOpen = !leftOpen">
          <PanelLeftClose v-if="leftOpen" :size="16" />
          <PanelLeftOpen v-else :size="16" />
        </Button>
        <Button variant="ghost" size="sm" :title="rightOpen ? '收起在线面板' : '展开在线面板'" @click="rightOpen = !rightOpen">
          <PanelRightClose v-if="rightOpen" :size="16" />
          <PanelRightOpen v-else :size="16" />
        </Button>
        <button class="ml-1 flex items-center gap-2" title="我的主页" @click="homeUserId = auth.user?.id ?? null; homeOpen = true">
          <UserAvatar
            :user-id="auth.user?.id ?? 0"
            :name="auth.user?.username ?? '?'"


            :avatar-ext="auth.user?.avatarExt"
            :avatar-version="auth.user?.avatarVersion"
            :size="28"
            :online="true"
          />
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- 左：文件树（可收起） -->
      <aside
        class="flex shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900"
        :class="leftOpen ? 'w-64' : 'w-0 border-r-0'"
      >
        <div class="px-3 pt-3 pb-1 text-xs font-medium text-zinc-400">文件</div>
        <FileTree
          ref="fileTreeRef"
          :dirs="currentDir ? [currentDir] : []"
          :presence="presence"
          :self-user-id="auth.user?.id ?? 0"
          @open="(dirId, dirName, path, name) => openFile(dirId, dirName, path, name)"
        />
      </aside>

      <!-- 中：编辑器 -->
      <main class="flex min-w-0 flex-1 flex-col bg-white dark:bg-zinc-900">
        <!-- 标签栏 -->
        <div class="flex h-10 shrink-0 items-center gap-1 overflow-x-auto px-2 weak-scrollbar">
          <div
            v-for="t in tabs"
            :key="t.key"
            class="group flex max-w-48 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors"
            :class="t.key === activeKey ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'"
            :title="t.dirty ? '有未保存的更改（约 1 秒后自动写盘）' : ''"
            @click="activeKey = t.key"
          >
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: t.dirty ? '#3b82f6' : t.color }" />
            <span class="truncate">{{ t.name }}</span>
            <X
              :size="14"
              class="shrink-0 rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700"
              @click.stop="requestClose(t.key)"
            />
          </div>
          <span v-if="tabs.length === 0" class="px-2 text-xs text-zinc-400">从左侧打开文件开始协作</span>
        </div>

        <!-- 编辑区 -->
        <div class="min-h-0 flex-1">
          <div v-if="tabs.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
            <FileIcon :size="36" />
            <span class="text-sm">选择左侧文件，多人实时协作编辑</span>
            <span class="text-xs">自动保存 · 远程光标可见 · 断线自动重连</span>
          </div>
          <template v-else>
            <div v-for="t in tabs" :key="t.key" v-show="t.key === activeKey" class="h-full">
              <div v-if="t.status === 'error'" class="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
                <span class="text-sm">{{ t.error }}</span>
              </div>
              <CollabEditor
                v-else
                :ref="setEditorRef(t.key)"
                :dir-id="t.dirId"
                :dir-name="t.dirName"
                :path="t.path"
                :name="t.name"
                :user-name="auth.user?.username ?? ''"
                :color="t.color"
                @synced="t.status = 'ready'"
                @auth-error="(m: string) => { t.status = 'error'; t.error = m }"
                @connection-error="(m: string) => { if (t.status !== 'error') { t.status = 'error'; t.error = m + '（将自动重连）' } }"
                @dirty-change="(d: boolean) => { t.dirty = d }"
              />
            </div>
          </template>
        </div>

        <!-- 底部终端（M7，可收起） -->
        <div
          class="shrink-0 overflow-hidden border-t border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-950"
          :class="terminalOpen ? 'h-64' : 'h-9'"
        >
          <button
            class="flex h-9 w-full items-center gap-2 px-3 text-xs text-zinc-400 hover:text-zinc-200"
            @click="terminalOpen = !terminalOpen"
          >
            <TerminalSquare :size="14" />
            {{ terminalOpen ? '终端（M7 阶段实现 — SSH 集成）' : '终端与调试（M7 阶段实现 — 点击展开）' }}
            <ChevronRight :size="14" class="ml-auto transition-transform" :class="terminalOpen ? 'rotate-90' : ''" />
          </button>
          <div v-if="terminalOpen" class="flex h-52 items-center justify-center text-sm text-zinc-600">
            终端将在 M7 阶段实现（以你的系统账号通过 SSH 执行命令）
          </div>
        </div>
      </main>

      <!-- 右：在线列表（可收起） -->
      <aside
        class="flex shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900"
        :class="rightOpen ? 'w-60' : 'w-0 border-l-0'"
      >
        <div class="px-3 pt-3 pb-2 text-xs font-medium text-zinc-400">在线用户（{{ dirPresence.length }}）</div>
        <div class="min-h-0 flex-1 overflow-auto px-2">
          <div
            v-for="p in dirPresence"
            :key="p.userId"
            class="mb-0.5 rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <div class="flex items-center gap-2">
              <button title="查看用户主页" @click="homeUserId = p.userId; homeOpen = true">
                <UserAvatar
                  :user-id="p.userId"
                  :name="p.username"
                  :avatar-ext="p.avatarExt"
                  :avatar-version="p.avatarVersion"
                  :size="28"
                  :online="true"
                />
              </button>
              <button class="min-w-0 flex-1 truncate text-left text-[13px] text-zinc-800 hover:underline dark:text-zinc-200" @click="homeUserId = p.userId; homeOpen = true">
                {{ p.username }}
              </button>
              <Chip v-if="p.isAdmin" variant="primary" size="sm">管理员</Chip>
              <Chip v-else-if="p.roleName" variant="secondary" size="sm">{{ p.roleName }}</Chip>
            </div>
            <button
              v-if="p.currentDoc"
              class="mt-1 block w-full truncate rounded px-1 py-0.5 text-left text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              :title="`${p.currentDoc.dirName}/${p.currentDoc.name}（点击一起编辑）`"
              @click="jumpTo(p.currentDoc)"
            >
              {{ p.currentDoc.dirName }}/{{ p.currentDoc.name }}
            </button>
            <div v-else class="mt-1 px-1 text-xs text-zinc-300 dark:text-zinc-600">空闲中</div>
          </div>
          <div v-if="dirPresence.length === 0" class="px-3 py-6 text-xs text-zinc-400">暂无成员在编辑</div>
        </div>
      </aside>
    </div>

    <!-- 用户主页模态 -->
    <UserHomeDialog v-model:open="homeOpen" :user-id="homeUserId" />

    <!-- 关闭未保存确认 -->
    <DialogDefault
      :open="!!closeConfirmKey"
      title="有未保存的更改"
      size="sm"
      :show-confirm="false"
      :show-cancel="false"
      @update:open="(v: boolean) => { if (!v) closeConfirmKey = '' }"
    >
      <div class="text-[13px] text-zinc-600 dark:text-zinc-300">
        该文件仍有尚未写盘的更改。自动保存会在约 1 秒内完成写入，你也可以点击「保存」立即写盘后再关闭。
      </div>
      <template #footer>
        <Button variant="ghost" @click="closeConfirmKey = ''">继续编辑</Button>
        <Button variant="primary" @click="saveActive(); closeTab(closeConfirmKey)">保存并关闭</Button>
        <Button variant="ghost" danger @click="closeTab(closeConfirmKey)">直接关闭</Button>
      </template>
    </DialogDefault>
  </div>
</template>
