<script setup lang="ts">
import Button from 'fuxsto-design/button';
import InputDefault from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import { FolderPlus } from 'lucide-vue-next';
import { ref } from 'vue';
import { createDirectory } from '@/api/admin';

const name = ref('');
const creating = ref(false);

async function submit(): Promise<void> {
  const n = name.value.trim();
  if (!/^[^\\/]{1,64}$/.test(n)) {
    Message.warning('项目名不能含路径分隔符，且不超过 64 字符');
    return;
  }
  creating.value = true;
  try {
    await createDirectory({ name: n, path: n, requireExisting: false, visibleToAll: true, visibleUserIds: [] });
    Message.success(`项目「${n}」已创建，默认全员可见`);
    name.value = '';
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="flex h-full flex-col justify-between gap-2">
    <p class="text-xs leading-5 text-zinc-400">
      在工作区根目录下创建新项目，默认对所有用户可见（可在目录管理中调整）
    </p>
    <InputDefault v-model="name" placeholder="项目名，如：前端项目" @keyup.enter="submit" />
    <Button variant="primary" size="sm" :icon="FolderPlus" :loading="creating" @click="submit">创建项目</Button>
  </div>
</template>
