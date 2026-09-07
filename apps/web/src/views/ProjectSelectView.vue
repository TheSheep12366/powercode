<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Chip from 'fuxsto-design/chip';
import { ChevronLeft, Moon, Sun, Users } from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { myDirectories } from '@/api/my';
import { toggleTheme, useTheme } from '@/composables/theme';
import { colorFor } from '@/utils/color';

const router = useRouter();
const { isDark } = useTheme();

interface DirInfo {
  id: number;
  name: string;
  path: string;
  permission: 'ro' | 'rw' | 'deny' | 'none' | 'admin';
}

interface PresenceEntry {
  userId: number;
  username: string;
  currentDoc: { dirId: number; dirName: string; path: string; name: string } | null;
}

const dirs = ref<DirInfo[]>([]);
const presence = ref<PresenceEntry[]>([]);
let socket: Socket | null = null;
const loading = ref(true);

const editorsByDir = computed(() => {
  const map = new Map<number, PresenceEntry[]>();
  for (const p of presence.value) {
    if (!p.currentDoc) continue;
    const list = map.get(p.currentDoc.dirId) ?? [];
    list.push(p);
    map.set(p.currentDoc.dirId, list);
  }
  return map;
});

function permissionLabel(p: DirInfo['permission']): string {
  switch (p) {
    case 'admin':
      return '全部读写';
    case 'rw':
      return '读写';
    case 'ro':
      return '只读';
    default:
      return '无权限';
  }
}

function permissionVariant(p: DirInfo['permission']): 'primary' | 'secondary' | 'outline' {
  if (p === 'rw' || p === 'admin') return 'primary';
  if (p === 'ro') return 'secondary';
  return 'outline';
}

function enter(dir: DirInfo): void {
  if (dir.permission === 'none' || dir.permission === 'deny') {
    return;
  }
  router.push(`/workspace/${dir.id}`);
}

onMounted(async () => {
  try {
    const data = await myDirectories();
    dirs.value = data.items;
  } catch {
    // 加载失败时展示空列表
  } finally {
    loading.value = false;
  }
  socket = io({ path: '/socket.io', withCredentials: true });
  socket.on('presence:state', (list: PresenceEntry[]) => {
    presence.value = list;
  });
});

onBeforeUnmount(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <header class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="sm" :icon="ChevronLeft" @click="router.push('/')">返回</Button>
        <span class="font-bold text-zinc-900 dark:text-zinc-50">选择协作项目</span>
      </div>
      <Button variant="ghost" size="sm" @click="toggleTheme()">
        <Moon v-if="!isDark" :size="16" />
        <Sun v-else :size="16" />
      </Button>
    </header>

    <main class="flex-1 overflow-auto p-6">
      <div v-if="loading" class="py-16 text-center text-sm text-zinc-400">加载中…</div>
      <div v-else-if="dirs.length === 0" class="py-16 text-center text-sm text-zinc-400">
        暂无可访问的共享项目，请联系管理员分配
      </div>
      <div v-else class="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="d in dirs"
          :key="d.id"
          class="group relative flex flex-col items-start gap-2 rounded-3xl border border-zinc-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:border-zinc-700 dark:bg-zinc-900"
          :disabled="d.permission === 'none' || d.permission === 'deny'"
          @click="enter(d)"
        >
          <div class="flex w-full items-center justify-between gap-2">
            <span class="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{{ d.name }}</span>
            <Chip :variant="permissionVariant(d.permission)" size="sm">{{ permissionLabel(d.permission) }}</Chip>
          </div>
          <div class="w-full truncate text-xs text-zinc-400" :title="d.path">{{ d.path }}</div>

          <!-- 正在编辑人数 -->
          <div
            v-if="editorsByDir.get(d.id)?.length"
            class="group/edit mt-1 flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400"
            :title="editorsByDir.get(d.id)!.map((p) => p.username).join('、')"
          >
            <span class="relative flex -space-x-1.5">
              <span
                v-for="p in editorsByDir.get(d.id)!.slice(0, 3)"
                :key="p.userId"
                class="h-4 w-4 rounded-full border border-white dark:border-zinc-900"
                :style="{ backgroundColor: colorFor(p.userId) }"
              />
            </span>
            {{ editorsByDir.get(d.id)!.length }} 名成员正在编辑
            <span
              class="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max max-w-64 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 shadow-lg group-hover/edit:block dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {{ editorsByDir.get(d.id)!.map((p) => p.username).join('、') }}
            </span>
          </div>
          <div v-else class="mt-1 flex items-center gap-1.5 text-xs text-zinc-300 dark:text-zinc-600">
            <Users :size="13" />
            暂无成员在编辑
          </div>
        </button>
      </div>
    </main>
  </div>
</template>
