<script setup lang="ts">
import Button from 'fuxsto-design/button';
import { Message } from 'fuxsto-design/message';
import { onMounted, ref } from 'vue';
import { getRecentActions, type RecentAction } from '@/api/dashboard';
import { formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const items = ref<RecentAction[]>([]);
const scope = ref<'all' | 'self'>('self');

onMounted(async () => {
  try {
    const data = await getRecentActions();
    items.value = data.items;
    scope.value = data.scope;
  } catch {
    // 静默
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-1 text-[11px] text-zinc-400">{{ scope === 'all' ? '全员最近操作' : '我的最近操作' }}</div>
    <div class="min-h-0 flex-1 space-y-1 overflow-auto weak-scrollbar">
      <div v-for="a in items" :key="a.id" class="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <span class="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
          <span v-if="scope === 'all'" class="mr-1 text-zinc-400">{{ a.username ?? '?' }}</span>
          <span class="font-mono text-[11px]">{{ a.action }}</span>
          <span v-if="a.target" class="ml-1 text-zinc-400">{{ a.target }}</span>
        </span>
        <span class="shrink-0 text-[10px] text-zinc-400">{{ formatDateTime(a.createdAt).slice(5, 16) }}</span>
      </div>
      <div v-if="items.length === 0" class="py-4 text-center text-xs text-zinc-400">暂无动态</div>
    </div>
  </div>
</template>
