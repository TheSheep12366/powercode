<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ChipDefault from 'fuxsto-design/chip';
import { Contact } from 'lucide-vue-next';
import { getContacts, type ContactUser } from '@/api/my';
import UserAvatar from '@/components/UserAvatar.vue';

const emit = defineEmits<{ 'open-user': [id: number] }>();

const items = ref<ContactUser[]>([]);
const onlineCount = ref(0);

onMounted(async () => {
  try {
    const data = await getContacts();
    items.value = data.items;
    onlineCount.value = data.items.filter((u) => u.online).length;
  } catch {
    // 加载失败静默
  }
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-1 text-xs text-zinc-400">{{ onlineCount }} 人在线 · 共 {{ items.length }} 人</div>
    <div class="min-h-0 flex-1 space-y-0.5 overflow-auto weak-scrollbar">
      <button
        v-for="u in items.slice(0, 8)"
        :key="u.id"
        class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
        @click="emit('open-user', u.id)"
      >
        <UserAvatar :user-id="u.id" :name="u.username" :avatar-ext="u.avatarExt" :avatar-version="u.avatarVersion" :size="26" :online="u.online" />
        <span class="min-w-0 flex-1 truncate text-[13px] text-zinc-800 dark:text-zinc-200">{{ u.username }}</span>
        <ChipDefault v-if="u.isAdmin" variant="primary" size="sm">管理员</ChipDefault>
        <span v-else-if="u.currentDoc" class="max-w-28 truncate text-[11px] text-zinc-400">{{ u.currentDoc.name }}</span>
      </button>
    </div>
    <div class="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-400">
      <Contact :size="12" />
      点击用户查看主页
    </div>
  </div>
</template>
