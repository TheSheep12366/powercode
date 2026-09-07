<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getContributions } from '@/api/dashboard';

const days = ref<Array<{ date: string; count: number }>>([]);
const total = ref(0);

function level(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

const LEVEL_BG = [
  'bg-zinc-100 dark:bg-zinc-800',
  'bg-green-200 dark:bg-green-900',
  'bg-green-400 dark:bg-green-700',
  'bg-green-500 dark:bg-green-500',
  'bg-green-600 dark:bg-green-400'
];

onMounted(async () => {
  try {
    const data = await getContributions();
    days.value = data.days;
    total.value = data.days.reduce((sum, d) => sum + d.count, 0);
  } catch {
    // 静默
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-1.5 text-xs text-zinc-400">最近 120 天 · 共 {{ total }} 次活动</div>
    <div class="grid flex-1 grid-flow-col grid-rows-7 gap-[3px]">
      <div
        v-for="d in days"
        :key="d.date"
        class="h-[10px] w-[10px] rounded-[2px]"
        :class="LEVEL_BG[level(d.count)]"
        :title="`${d.date}：${d.count} 次活动`"
      />
    </div>
    <div class="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-400">
      少
      <span v-for="l in 5" :key="l" class="h-[9px] w-[9px] rounded-[2px]" :class="LEVEL_BG[l - 1]" />
      多
    </div>
  </div>
</template>
