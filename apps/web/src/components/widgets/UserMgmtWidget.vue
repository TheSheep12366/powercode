<script setup lang="ts">
import Button from 'fuxsto-design/button';
import { Message } from 'fuxsto-design/message';
import { Users } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getContacts } from '@/api/my';

const router = useRouter();
const total = ref(0);
const online = ref(0);

onMounted(async () => {
  try {
    const data = await getContacts();
    total.value = data.items.length;
    online.value = data.items.filter((u) => u.online).length;
  } catch {
    // 静默
  }
});
</script>

<template>
  <div class="flex h-full flex-col justify-between">
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-xl bg-zinc-100 p-2.5 text-center dark:bg-zinc-800">
        <div class="text-xl font-bold text-zinc-900 dark:text-zinc-50">{{ total }}</div>
        <div class="text-[11px] text-zinc-400">用户总数</div>
      </div>
      <div class="rounded-xl bg-zinc-100 p-2.5 text-center dark:bg-zinc-800">
        <div class="text-xl font-bold text-green-600 dark:text-green-400">{{ online }}</div>
        <div class="text-[11px] text-zinc-400">当前在线</div>
      </div>
    </div>
    <Button variant="primary" size="sm" class="mt-3 w-full" :icon="Users" @click="router.push('/admin/users')">打开用户管理</Button>
  </div>
</template>
