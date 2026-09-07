<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getOverviewStats } from '@/api/dashboard';
import { formatBytes } from '@/utils/format';

const totals = ref({ files: 0, bytes: 0, lines: 0 });
const dirs = ref<Array<{ id: number; name: string; files: number; bytes: number; lines: number; editors: number }>>([]);

onMounted(async () => {
  try {
    const data = await getOverviewStats();
    totals.value = data.totals;
    dirs.value = data.dirs.sort((a, b) => b.lines - a.lines);
  } catch {
    // 静默
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-2 grid grid-cols-3 gap-2">
      <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
        <div class="text-lg font-bold text-zinc-900 dark:text-zinc-50">{{ totals.lines.toLocaleString() }}</div>
        <div class="text-[11px] text-zinc-400">总代码行</div>
      </div>
      <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
        <div class="text-lg font-bold text-zinc-900 dark:text-zinc-50">{{ totals.files.toLocaleString() }}</div>
        <div class="text-[11px] text-zinc-400">文件数</div>
      </div>
      <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
        <div class="text-lg font-bold text-zinc-900 dark:text-zinc-50">{{ formatBytes(totals.bytes) }}</div>
        <div class="text-[11px] text-zinc-400">总体积</div>
      </div>
    </div>
    <div class="min-h-0 flex-1 space-y-1.5 overflow-auto weak-scrollbar">
      <div v-for="d in dirs" :key="d.id">
        <div class="mb-0.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <span class="truncate">{{ d.name }}</span>
          <span>{{ d.lines.toLocaleString() }} 行</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            class="h-full rounded-full bg-zinc-500 transition-all"
            :style="{ width: totals.lines ? `${Math.max(2, (d.lines / totals.lines) * 100)}%` : '0%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
