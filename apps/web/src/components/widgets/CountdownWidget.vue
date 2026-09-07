<script setup lang="ts">
import Button from 'fuxsto-design/button';
import InputDefault from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import Popconfirm from 'fuxsto-design/popconfirm';
import { Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { createCountdown, deleteCountdown, getCountdowns, type CountdownItem } from '@/api/dashboard';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const mine = ref<CountdownItem[]>([]);
const global = ref<CountdownItem[]>([]);

const addOpen = ref(false);
const addTitle = ref('');
const addTarget = ref('');

function daysLeft(target: string): number {
  return Math.ceil((new Date(target).getTime() - Date.now()) / 86400000);
}

function daysText(target: string): string {
  const d = daysLeft(target);
  if (d > 0) return `还有 ${d} 天`;
  if (d === 0) return '就是今天';
  return `已过 ${Math.abs(d)} 天`;
}

async function load(): Promise<void> {
  try {
    const data = await getCountdowns();
    mine.value = data.mine;
    global.value = data.global;
  } catch {
    // 静默
  }
}

async function submit(): Promise<void> {
  if (!addTitle.value.trim()) {
    Message.warning('请输入标题');
    return;
  }
  if (!addTarget.value) {
    Message.warning('请选择目标日期');
    return;
  }
  try {
    await createCountdown(addTitle.value.trim(), new Date(`${addTarget.value}T00:00:00+08:00`).getTime());
    Message.success('倒数日已创建');
    addOpen.value = false;
    addTitle.value = '';
    addTarget.value = '';
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  }
}

async function removeMine(id: number): Promise<void> {
  try {
    await deleteCountdown(id);
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-auto weak-scrollbar">
    <!-- 全员 -->
    <template v-if="global.length > 0">
      <div class="text-[11px] font-medium text-zinc-400">全员倒数日</div>
      <div
        v-for="g in global"
        :key="`g${g.id}`"
        class="rounded-xl border border-amber-200/60 bg-amber-50/50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{{ g.title }}</span>
          <span class="shrink-0 text-xs text-amber-600 dark:text-amber-400">{{ daysText(g.targetDate) }}</span>
        </div>
        <div class="text-[11px] text-zinc-400">目标：{{ g.targetDate.slice(0, 10) }}</div>
      </div>
    </template>

    <!-- 个人 -->
    <template v-if="mine.length > 0">
      <div class="text-[11px] font-medium text-zinc-400">我的倒数日</div>
      <div
        v-for="c in mine"
        :key="c.id"
        class="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
      >
        <span class="min-w-0">
          <span class="block truncate text-[13px] text-zinc-800 dark:text-zinc-200">{{ c.title }}</span>
          <span class="text-[11px] text-zinc-400">{{ daysText(c.targetDate) }} · 目标 {{ c.targetDate.slice(0, 10) }}</span>
        </span>
        <Popconfirm title="删除倒数日" description="确定删除该倒数日吗？" danger confirm-text="删除" cancel-text="取消" @confirm="removeMine(c.id)">
          <button class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
            <Trash2 :size="14" />
          </button>
        </Popconfirm>
      </div>
    </template>

    <div v-if="mine.length === 0 && global.length === 0" class="py-2 text-xs text-zinc-400">
      暂无倒数日，点击下方 + 新建
    </div>

    <!-- 新增 -->
    <div v-if="addOpen" class="space-y-2 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-700">
      <InputDefault v-model="addTitle" placeholder="标题，如：项目发布日" size="sm" />
      <input
        v-model="addTarget"
        type="date"
        class="w-full rounded-[10px] border border-zinc-200 bg-transparent px-3 py-1.5 text-[13px] text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-200"
      />
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" @click="addOpen = false">取消</Button>
        <Button variant="primary" size="sm" @click="submit">创建</Button>
      </div>
    </div>
    <Button v-else variant="secondary" size="sm" class="w-full" @click="addOpen = true">+ 新建我的倒数日</Button>
  </div>
</template>
