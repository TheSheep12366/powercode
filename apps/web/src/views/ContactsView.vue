<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Chip from 'fuxsto-design/chip';
import Switch from 'fuxsto-design/switch';
import { Message } from 'fuxsto-design/message';
import { ChevronLeft } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getContacts, getContactsSetting, updateContactsSetting, type ContactUser } from '@/api/my';
import UserAvatar from '@/components/UserAvatar.vue';
import UserHomeDialog from '@/components/UserHomeDialog.vue';
import { usePresence } from '@/composables/presence';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();
const router = useRouter();
const { list: presenceList } = usePresence();

const items = ref<ContactUser[]>([]);
const loading = ref(false);
const contactsPublic = ref(true);
const canManage = ref(false);
const homeOpen = ref(false);
const homeUserId = ref<number | null>(null);

function openHome(id: number): void {
  homeUserId.value = id;
  homeOpen.value = true;
}

function liveOf(u: ContactUser) {
  return presenceList.value.find((p) => p.userId === u.id);
}

function isOnline(u: ContactUser): boolean {
  return !!liveOf(u) || u.online;
}

function currentDocOf(u: ContactUser) {
  return liveOf(u)?.currentDoc ?? u.currentDoc ?? null;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const data = await getContacts();
    items.value = data.items;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载通讯录失败');
  } finally {
    loading.value = false;
  }
}

async function loadSetting(): Promise<void> {
  try {
    const data = await getContactsSetting();
    contactsPublic.value = data.contactsPublic;
    canManage.value = auth.user?.role === 'admin' || !!auth.user?.caps?.canManageUsers;
  } catch {
    // 无权限查看设置时不显示开关
  }
}

async function togglePublic(v: boolean): Promise<void> {
  try {
    const data = await updateContactsSetting(v);
    contactsPublic.value = data.contactsPublic;
    Message.success(v ? '通讯录已设为公开' : '通讯录已设为仅管理员及授权人员可见');
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '设置失败');
  }
}

onMounted(async () => {
  await Promise.all([load(), loadSetting()]);
});
</script>

<template>
  <div class="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <header class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="sm" :icon="ChevronLeft" @click="router.back()">返回</Button>
        <span class="font-bold text-zinc-900 dark:text-zinc-50">通讯录</span>
        <span class="text-xs text-zinc-400">共 {{ items.length }} 位用户</span>
      </div>
      <div v-if="canManage" class="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
        对全体用户公开
        <Switch v-model="contactsPublic" size="sm" @change="togglePublic(contactsPublic)" />
      </div>
    </header>

    <main class="min-h-0 flex-1 overflow-auto p-4">
      <Card shadow="sm" padding="none">
        <div v-if="loading" class="py-14 text-center text-sm text-zinc-400">加载中…</div>
        <div v-else-if="items.length === 0" class="py-14 text-center text-sm text-zinc-400">暂无用户</div>
        <div v-else class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <button
            v-for="u in items"
            :key="u.id"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            @click="openHome(u.id)"
          >
            <UserAvatar
              :user-id="u.id"
              :name="u.username"
              :avatar-ext="u.avatarExt"
              :avatar-version="u.avatarVersion"
              :size="38"
              :online="isOnline(u)"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{{ u.username }}</span>
                <Chip v-if="u.role === 'admin'" variant="primary" size="sm">管理员</Chip>
                <Chip v-else-if="u.roleName" variant="secondary" size="sm">{{ u.roleName }}</Chip>
                <Chip v-if="u.status === 'disabled'" variant="outline" size="sm" class="opacity-60">已禁用</Chip>
              </span>
              <span class="mt-0.5 block truncate text-xs" :class="isOnline(u) ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'">
                {{ isOnline(u) ? (currentDocOf(u) ? `正在编辑：${currentDocOf(u)!.dirName} / ${currentDocOf(u)!.name}` : '在线') : `离线 · 注册于 ${formatDateTime(u.createdAt)}` }}
              </span>
            </span>
            <span class="shrink-0 text-xs text-zinc-400">查看主页 ›</span>
          </button>
        </div>
      </Card>
    </main>

    <UserHomeDialog v-model:open="homeOpen" :user-id="homeUserId" />
  </div>
</template>
