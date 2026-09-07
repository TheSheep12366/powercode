<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Chip from 'fuxsto-design/chip';
import { Message } from 'fuxsto-design/message';
import Popconfirm from 'fuxsto-design/popconfirm';
import {
  CalendarDays,
  ChevronLeft,
  Contact,
  FileBarChart,
  Github,
  GripVertical,
  ListTodo,
  LogOut,
  Megaphone,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Users,
  FolderPlus,
  FolderOpen,
  ScrollText
} from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getAnnouncement, getCountdowns, getDashboardLayout, getTodos, saveDashboardLayout, type WidgetLayoutItem } from '@/api/dashboard';
import UserAvatar from '@/components/UserAvatar.vue';
import UserHomeDialog from '@/components/UserHomeDialog.vue';
import ContactsWidget from '@/components/widgets/ContactsWidget.vue';
import ProjectWidget from '@/components/widgets/ProjectWidget.vue';
import ContributionWidget from '@/components/widgets/ContributionWidget.vue';
import LocStatsWidget from '@/components/widgets/LocStatsWidget.vue';
import ActionsWidget from '@/components/widgets/ActionsWidget.vue';
import CalendarWidget from '@/components/widgets/CalendarWidget.vue';
import AnnouncementWidget from '@/components/widgets/AnnouncementWidget.vue';
import CountdownWidget from '@/components/widgets/CountdownWidget.vue';
import TodoWidget from '@/components/widgets/TodoWidget.vue';
import UserMgmtWidget from '@/components/widgets/UserMgmtWidget.vue';
import QuickCreateWidget from '@/components/widgets/QuickCreateWidget.vue';
import AiWidget from '@/components/widgets/AiWidget.vue';
import { emitEditing, initPresenceSocket, usePresence } from '@/composables/presence';
import { toggleTheme, useTheme } from '@/composables/theme';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const { isDark } = useTheme();
const { list: presenceList } = usePresence();

// ---- 卡片注册表 ----
interface WidgetMeta {
  type: string;
  label: string;
  icon: unknown;
  span: string;
  adminOnly?: boolean;
  multiple?: boolean;
  /** 由内容决定的固定卡片（公告/倒数日/TODO 有内容时固定） */
  dynamicPin?: boolean;
}

const REGISTRY: Record<string, WidgetMeta & { comp: unknown }> = {
  announcement: { type: 'announcement', label: '公告', icon: Megaphone, span: 'md:col-span-6', comp: AnnouncementWidget, dynamicPin: true },
  countdown: { type: 'countdown', label: '倒数日', icon: Timer, span: 'md:col-span-4', comp: CountdownWidget, dynamicPin: true },
  todo: { type: 'todo', label: 'TODO', icon: ListTodo, span: 'md:col-span-4', comp: TodoWidget, dynamicPin: true },
  calendar: { type: 'calendar', label: '日历', icon: CalendarDays, span: 'md:col-span-4', comp: CalendarWidget },
  contacts: { type: 'contacts', label: '通讯录', icon: Contact, span: 'md:col-span-4', comp: ContactsWidget },
  contrib: { type: 'contrib', label: '贡献图表', icon: Github, span: 'md:col-span-6', comp: ContributionWidget },
  loc: { type: 'loc', label: '代码统计', icon: FileBarChart, span: 'md:col-span-6', comp: LocStatsWidget },
  actions: { type: 'actions', label: '最近动态', icon: ScrollText, span: 'md:col-span-6', comp: ActionsWidget },
  project: { type: 'project', label: '项目详情', icon: FolderOpen, span: 'md:col-span-4', comp: ProjectWidget, multiple: true },
  usermgmt: { type: 'usermgmt', label: '用户管理', icon: Users, span: 'md:col-span-4', comp: UserMgmtWidget, adminOnly: true },
  quickcreate: { type: 'quickcreate', label: '快捷创建项目', icon: FolderPlus, span: 'md:col-span-4', comp: QuickCreateWidget, adminOnly: true },
  ai: { type: 'ai', label: 'AI 助手（预留）', icon: Sparkles, span: 'md:col-span-4', comp: AiWidget }
};

const DEFAULT_LAYOUT: WidgetLayoutItem[] = [
  { type: 'calendar' },
  { type: 'todo' },
  { type: 'countdown' },
  { type: 'announcement' },
  { type: 'contacts' },
  { type: 'actions' },
  { type: 'contrib' },
  { type: 'loc' },
  { type: 'ai' }
];

// ---- 布局状态 ----
const layout = ref<WidgetLayoutItem[]>([]);
const editMode = ref(false);
const addMenuOpen = ref(false);
const homeOpen = ref(false);
const homeUserId = ref<number | null>(null);
const loaded = ref(false);

const caps = computed(() => auth.user?.caps);
const isAdmin = computed(() => auth.user?.role === 'admin');
const canManageAnnouncement = computed(() => isAdmin.value || !!caps.value?.canManageAnnouncements);

const widgetMeta = (type: string) => REGISTRY[type];

const spanClass = (item: WidgetLayoutItem) => REGISTRY[item.type]?.span ?? 'md:col-span-4';

/** 由内容决定的固定卡片是否应显示 */
const pinnedNow = reactive({ announcement: false, countdown: false, todo: false });

function isPinned(item: WidgetLayoutItem): boolean {
  const meta = REGISTRY[item.type];
  if (!meta?.dynamicPin) return false;
  return pinnedNow[item.type as keyof typeof pinnedNow];
}

/** 合并固定卡片 + 过滤无权限卡片 */
const mergedLayout = computed<WidgetLayoutItem[]>(() => {
  const hasCap = (t: string): boolean => {
    if (t === 'usermgmt') return isAdmin.value || !!caps.value?.canManageUsers;
    if (t === 'quickcreate') return isAdmin.value || !!caps.value?.canManageDirectories;
    return true;
  };
  const visible = layout.value.filter((item) => {
    const meta = REGISTRY[item.type];
    if (!meta) return false;
    if (meta.adminOnly && !hasCap(item.type)) return false;
    if (meta.dynamicPin && !pinnedNow[item.type as keyof typeof pinnedNow]) return false;
    return true;
  });
  // 固定卡片缺失时自动补入
  for (const type of ['announcement', 'countdown', 'todo'] as const) {
    if (pinnedNow[type] && !visible.some((i) => i.type === type)) {
      if (type === 'announcement') visible.unshift({ type });
      else visible.push({ type });
    }
  }
  return visible;
});

const addableTypes = computed(() => {
    const hasCap = (t: string): boolean => {
      if (t === 'usermgmt') return isAdmin.value || !!caps.value?.canManageUsers;
      if (t === 'quickcreate') return isAdmin.value || !!caps.value?.canManageDirectories;
      return true;
    };
  const out: Array<{ type: string; label: string }> = [];
  for (const meta of Object.values(REGISTRY)) {
    if (meta.adminOnly && !hasCap(meta.type)) continue;
    if (meta.multiple) {
      out.push({ type: meta.type, label: meta.label });
      continue;
    }
    if (!layout.value.some((i) => i.type === meta.type)) {
      out.push({ type: meta.type, label: meta.label });
    }
  }
  return out;
});

// 加“项目详情”时需要选择具体项目
const myDirs = ref<Array<{ id: number; name: string; permission: string }>>([]);
const projectPickOpen = ref(false);

async function openProjectPick(): Promise<void> {
  projectPickOpen.value = !projectPickOpen.value;
  if (projectPickOpen.value && myDirs.value.length === 0) {
    try {
      const { myDirectories } = await import('@/api/my');
      const data = await myDirectories();
      myDirs.value = data.items.filter((d) => d.permission !== 'none' && d.permission !== 'deny');
    } catch {
      // 忽略
    }
  }
}

function addWidget(type: string, config?: Record<string, unknown>): void {
  layout.value.push({ type, config });
  addMenuOpen.value = false;
  projectPickOpen.value = false;
  void persist();
  Message.success('卡片已添加');
}

function removeWidget(index: number): void {
  layout.value.splice(index, 1);
  void persist();
}

async function persist(): Promise<void> {
  try {
    await saveDashboardLayout(mergedLayout.value.map((i) => ({ type: i.type, ...(i.config ? { config: i.config } : {}) })));
  } catch {
    // 保存失败静默（下次编辑再试）
  }
}

// ---- 拖拽排序 ----
const dragIndex = ref<number | null>(null);

function onDragStart(index: number, e: DragEvent): void {
  dragIndex.value = index;
  e.dataTransfer?.setData('text/plain', String(index));
}

function onDragOver(e: DragEvent): void {
  e.preventDefault();
}

function onDrop(index: number): void {
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null;
    return;
  }
  const item = layout.value.splice(dragIndex.value, 1)[0];
  layout.value.splice(index, 0, item);
  dragIndex.value = null;
  void persist();
}

// ---- 数据加载（固定卡片判定 + 布局） ----
async function load(): Promise<void> {
  try {
    const [layoutData, annData, cdData, todoData] = await Promise.all([
      getDashboardLayout(),
      getAnnouncement(),
      getCountdowns(),
      getTodos()
    ]);
    pinnedNow.announcement = !!annData.announcement;
    pinnedNow.countdown = cdData.mine.length + cdData.global.length > 0;
    pinnedNow.todo = todoData.mine.length + todoData.global.length > 0;
    layout.value = layoutData.layout ?? DEFAULT_LAYOUT;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载仪表盘失败');
    layout.value = DEFAULT_LAYOUT;
  } finally {
    loaded.value = true;
  }
}

function logout(): void {
  auth
    .logout()
    .then(() => {
      Message.success('已退出登录');
      router.push('/login');
    })
    .catch((e: unknown) => Message.warning(e instanceof Error ? e.message : '退出失败'));
}

onMounted(async () => {
  initPresenceSocket();
  emitEditing(null);
  await load();
});
</script>

<template>
  <div class="min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <!-- 顶栏 -->
    <header class="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center gap-3">
        <span class="font-bold text-zinc-900 dark:text-zinc-50">PowerCode 仪表盘</span>
        <Button variant="ghost" size="sm" :icon="FolderOpen" @click="router.push('/workspace')">工作区</Button>
      </div>
      <div class="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" :title="isDark ? '切换亮色' : '切换暗色'" @click="toggleTheme()">
          <Moon v-if="!isDark" :size="16" />
          <Sun v-else :size="16" />
        </Button>
        <Button variant="ghost" size="sm" :class="editMode ? 'text-zinc-900 dark:text-zinc-100' : ''" @click="editMode = !editMode">
          {{ editMode ? '完成布局' : '编辑布局' }}
        </Button>
        <router-link to="/contacts" class="ml-1">
          <Button variant="ghost" size="sm" :icon="Contact">通讯录</Button>
        </router-link>
        <button class="ml-1" title="我的主页" @click="homeUserId = auth.user?.id ?? null; homeOpen = true">
          <UserAvatar
            :user-id="auth.user?.id ?? 0"
            :name="auth.user?.username ?? '?'"
            :avatar-ext="auth.user?.avatarExt"
            :avatar-version="auth.user?.avatarVersion"
            :size="28"
          />
        </button>
        <Button variant="ghost" size="sm" :icon="LogOut" title="退出登录" @click="logout" />
      </div>
    </header>

    <main class="mx-auto max-w-7xl p-4">
      <!-- 编辑提示 + 添加 -->
      <div v-if="editMode" class="mb-4 flex flex-wrap items-center gap-2">
        <div class="relative">
          <Button variant="primary" size="sm" :icon="Plus" @click="addMenuOpen = !addMenuOpen">添加卡片</Button>
          <div
            v-if="addMenuOpen"
            class="absolute left-0 top-full z-50 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <template v-if="addableTypes.length">
              <button
                v-for="t in addableTypes"
                :key="t.type"
                class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                @click="t.type === 'project' ? openProjectPick() : addWidget(t.type)"
              >
                {{ t.label }}
                <span v-if="t.type === 'project'" class="ml-auto text-[10px] text-zinc-400">选择项目 ›</span>
              </button>
              <!-- 项目二级选择 -->
              <div v-if="projectPickOpen" class="border-t border-zinc-100 p-1 dark:border-zinc-800">
                <div v-if="myDirs.length === 0" class="px-2 py-1 text-xs text-zinc-400">暂无可选项目</div>
                <button
                  v-for="d in myDirs"
                  :key="d.id"
                  class="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  @click="layout.some((i) => i.type === 'project' && i.config?.dirId === d.id) ? Message.warning('该项目卡片已存在') : addWidget('project', { dirId: d.id })"
                >
                  {{ d.name }}
                </button>
              </div>
            </template>
            <div v-else class="px-2 py-2 text-xs text-zinc-400">所有可用卡片都已添加</div>
          </div>
        </div>
        <span class="text-xs text-zinc-400">拖动卡片顶部的把手调整顺序，点 ✕ 移除（公告/倒数日/TODO 有内容时固定不可移除）</span>
      </div>

      <!-- 卡片网格 -->
      <div v-if="loaded" class="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div
          v-for="(item, index) in mergedLayout"
          :key="item.type + (item.config?.dirId ?? index)"
          class="md:col-span-4"
          :class="spanClass(item)"
          :draggable="editMode && dragIndex === index"
          @dragover.prevent
          @drop="onDrop(index)"
        >
          <Card
            shadow="sm"
            padding="md"
            class="h-full"
            :class="dragIndex === index ? 'opacity-50' : ''"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
                <span
                  v-if="editMode"
                  class="cursor-grab rounded p-0.5 hover:bg-zinc-100 active:cursor-grabbing dark:hover:bg-zinc-800"
                  title="拖动排序"
                  @mousedown="dragIndex = index"
                >
                  <GripVertical :size="14" />
                </span>
                <component :is="widgetMeta(item.type)?.icon" :size="14" />
                {{ widgetMeta(item.type)?.label ?? item.type }}
                <Chip v-if="isPinned(item)" variant="secondary" size="sm">固定</Chip>
              </span>
              <span v-if="editMode" class="flex items-center gap-1">
                <Popconfirm
                  v-if="!isPinned(item)"
                  title="移除卡片"
                  :description="`确定移除「${widgetMeta(item.type)?.label ?? item.type}」卡片吗？（可随时重新添加）`"
                  confirm-text="移除"
                  cancel-text="取消"
                  @confirm="removeWidget(index)"
                >
                  <button class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                    <Trash2 :size="14" />
                  </button>
                </Popconfirm>
              </span>
            </div>

            <!-- 各卡片内容 -->
            <component
              :is="widgetMeta(item.type)?.comp"
              v-if="item.type === 'contacts'"
              @open-user="(id: number) => { homeUserId = id; homeOpen = true }"
            />
            <component :is="widgetMeta(item.type)?.comp" v-else-if="item.type === 'project'" :config="item.config" />
            <component :is="widgetMeta(item.type)?.comp" v-else />
          </Card>
        </div>
      </div>
      <div v-else class="py-20 text-center text-sm text-zinc-400">加载仪表盘…</div>
    </main>

    <UserHomeDialog v-model:open="homeOpen" :user-id="homeUserId" />
  </div>
</template>
