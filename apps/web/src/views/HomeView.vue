<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Chip from 'fuxsto-design/chip';
import { Message } from 'fuxsto-design/message';
import { Contact, FolderTree, LogOut, TerminalSquare, Users } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import UserAvatar from '@/components/UserAvatar.vue';
import UserHomeDialog from '@/components/UserHomeDialog.vue';

const auth = useAuthStore();
const router = useRouter();

const caps = auth.user?.caps;
const homeOpen = ref(false);
const homeUserId = ref<number | null>(null);
const canEnterAdmin =
  auth.user?.role === 'admin' ||
  !!(caps && (caps.canManageUsers || caps.canManageDirectories || caps.canViewAudit));

const adminEntryRoute = computed(() => {
  const c = auth.user?.caps;
  if (auth.user?.role === 'admin' || c?.canManageUsers) return '/admin/users';
  if (c?.canManageDirectories) return '/admin/directories';
  if (c?.canViewAudit) return '/admin/audit-logs';
  return '/admin/users';
});

async function logout(): Promise<void> {
  try {
    await auth.logout();
    Message.success('已退出登录');
  } catch (e) {
    Message.warning(e instanceof Error ? e.message : '退出失败');
  } finally {
    await router.push('/login');
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
    <header class="flex h-14 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-800">
      <div class="text-[17px] font-bold text-zinc-900 dark:text-zinc-50">PowerCode</div>
      <div class="flex items-center gap-2.5">
        <template v-if="auth.user">
          <button class="flex items-center gap-2" title="我的主页" @click="homeUserId = auth.user.id; homeOpen = true">
            <UserAvatar
              :user-id="auth.user.id"
              :name="auth.user.username"
              :avatar-ext="auth.user.avatarExt"
              :avatar-version="auth.user.avatarVersion"
              :size="30"
            />
            <span class="text-sm text-zinc-600 dark:text-zinc-300">{{ auth.user.username }}</span>
          </button>
          <Chip :variant="auth.user.role === 'admin' ? 'primary' : 'secondary'" size="sm">
            {{ auth.user.role === 'admin' ? '管理员' : (auth.user.roleName || '普通用户') }}
          </Chip>
        </template>
        <Button variant="ghost" size="sm" :icon="LogOut" @click="logout">退出登录</Button>
      </div>
    </header>

    <main class="flex flex-1 items-start justify-center p-6">
      <div class="mt-12 flex flex-wrap justify-center gap-4">
        <Card class="w-[300px]" shadow="md" padding="lg">
          <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <TerminalSquare :size="20" />
          </div>
          <h3 class="mb-1.5 font-medium text-zinc-900 dark:text-zinc-50">工作区</h3>
          <p class="mb-4 min-h-9 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
            多人实时协作编辑 · 自动保存 · 远程光标可见
          </p>
          <Button variant="primary" size="sm" :icon="TerminalSquare" @click="router.push('/workspace')">进入工作区</Button>
        </Card>

        <Card class="w-[300px]" shadow="md" padding="lg">
          <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <Contact :size="20" />
          </div>
          <h3 class="mb-1.5 font-medium text-zinc-900 dark:text-zinc-50">通讯录</h3>
          <p class="mb-4 min-h-9 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
            全部用户一览，点击进入用户主页查看在线状态
          </p>
          <Button variant="secondary" size="sm" @click="router.push('/contacts')">打开通讯录</Button>
        </Card>

        <Card v-if="canEnterAdmin" class="w-[300px]" shadow="md" padding="lg">
          <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <Users :size="20" />
          </div>
          <h3 class="mb-1.5 font-medium text-zinc-900 dark:text-zinc-50">管理面板</h3>
          <p class="mb-4 min-h-9 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
            {{ auth.user?.role === 'admin' ? '全部管理功能可用' : '你被授权的管理功能将在面板中显示' }}
          </p>
          <Button variant="primary" size="sm" :icon="FolderTree" @click="router.push(adminEntryRoute)">进入管理面板</Button>
        </Card>
      </div>
    </main>
  </div>
</template>
