<script setup lang="ts">
import { computed, ref } from 'vue';

const today = new Date();
const year = ref(today.getFullYear());
const month = ref(today.getMonth());

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

interface Cell {
  day: number;
  current: boolean;
  isToday: boolean;
}

const cells = computed<Cell[]>(() => {
  const first = new Date(year.value, month.value, 1);
  const daysInMonth = new Date(year.value, month.value + 1, 0).getDate();
  // 周一为一周起始
  let lead = first.getDay() - 1;
  if (lead < 0) lead = 6;
  const out: Cell[] = [];
  for (let i = 0; i < lead; i++) out.push({ day: 0, current: false, isToday: false });
  for (let d = 1; d <= daysInMonth; d++) {
    out.push({
      day: d,
      current: true,
      isToday: d === today.getDate() && month.value === today.getMonth() && year.value === today.getFullYear()
    });
  }
  return out;
});

function prev(): void {
  if (month.value === 0) { year.value -= 1; month.value = 11; } else month.value -= 1;
}
function next(): void {
  if (month.value === 11) { year.value += 1; month.value = 0; } else month.value += 1;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-1.5 flex items-center justify-between">
      <span class="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{{ year }} 年 {{ month + 1 }} 月</span>
      <span class="flex gap-1 text-xs text-zinc-400">
        <button class="rounded px-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="prev">‹</button>
        <button class="rounded px-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800" @click="next">›</button>
      </span>
    </div>
    <div class="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
      <span v-for="w in WEEK" :key="w" class="text-zinc-400">{{ w }}</span>
      <template v-for="(c, i) in cells" :key="i">
        <span
          v-if="c.day"
          class="mx-auto flex h-6 w-6 items-center justify-center rounded-full"
          :class="c.isToday ? 'bg-zinc-900 font-bold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-700 dark:text-zinc-300'"
        >
          {{ c.day }}
        </span>
        <span v-else />
      </template>
    </div>
  </div>
</template>
