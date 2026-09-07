<script setup lang="ts">
import Button from 'fuxsto-design/button';
import { Message } from 'fuxsto-design/message';
import { FolderOpen, Users } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getDirStats, type DirStatsInfo } from '@/api/dashboard';
import { formatBytes } from '@/utils/format';

const props = defineProps<{ config: { dirId?: number } }>();

const router = useRouter();
const stats = ref<DirStatsInfo | null>(null);
const error = ref('');

onMounted(async () => {
  if (!props.config.dirId) {
    error.value = '未绑定项目';
    return;
  }
  try {
    stats.value = await getDirStats(props.config.dirId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="error" class="text-xs text-zinc-400">{{ error }}</div>
    <template v-else-if="stats">
      <div class="mb-2 flex items-center gap-1.5 text-xs text-zinc-400">
        <Users :size="13" />
        {{ stats.editors.length > 0 ? `正在编辑：${stats.editors.map((e) => e.username).join('、')}` : '暂无人在编辑' }}
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
          <div class="text-base font-bold text-zinc-900 dark:text-zinc-50">{{ stats.files }}</div>
          <div class="text-[11px] text-zinc-400">文件</div>
        </div>
        <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
          <div class="text-base font-bold text-zinc-900 dark:text-zinc-50">{{ formatBytes(stats.bytes) }}</div>
          <div class="text-[11px] text-zinc-400">体积</div>
        </div>
        <div class="rounded-xl bg-zinc-100 p-2 text-center dark:bg-zinc-800">
          <div class="text-base font-bold text-zinc-900 dark:text-zinc-50">{{ stats.lines.toLocaleString() }}</div>
          <div class="text-[11px] text-zinc-400">代码行</div>
        </div>
      </div>
      <div class="mt-auto pt-2">
        <Button variant="secondary" size="sm" :icon="FolderOpen" class="w-full" @click="router.push(`/workspace/${stats.id}`)">
          进入项目
        </Button>
      </div>
    </template>
    <div v-else class="text-xs text-zinc-400">加载中…</div>
  </div>
</template>
