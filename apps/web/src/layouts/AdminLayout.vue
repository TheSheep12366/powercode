<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Chip from 'fuxsto-design/chip';
import { Message } from 'fuxsto-design/message';
import { ChevronLeft, FolderTree, Lock, LogOut, ScrollText, Users } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const navItems = computed(() => {
  const caps = auth.user?.caps;
  const isAdmin = auth.user?.role === 'admin';
  const has = (k: 'canManageUsers' | 'canManageDirectories' | 'canViewAudit') => isAdmin || !!caps?.[k];
  const all = [
    { to: '/admin/users', label: '用户管理', icon: Users, show: has('canManageUsers') },
    { to: '/admin/directories', label: '目录管理', icon: FolderTree, show: has('canManageDirectories') },
    { to: '/admin/permissions', label: '权限配置', icon: Lock, show: has('canManageDirectories') || has('canManageUsers') },
    { to: '/admin/audit-logs', label: '审计日志', icon: ScrollText, show: has('canViewAudit') }
  ];
  return all.filter((n) => n.show);
});

const disabledItems = ['SSH 账户（后续阶段）'];

const crumb = computed(() => {
  const item = navItems.value.find((n) => n.to === route.path);
  return item?.label ?? '管理面板';
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
  <div class="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
    <!-- 侧边导航 -->
    <aside class="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div class="px-5 pt-6 pb-4">
        <div class="font-bold text-zinc-900 dark:text-zinc-50">
          PowerCode <span class="text-xs font-normal text-zinc-400">管理面板</span>
        </div>
      </div>
      <nav class="flex flex-col gap-1 px-3">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150"
          :class="
            route.path === item.to
              ? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
          "
        >
          <component :is="item.icon" :size="16" />
          {{ item.label }}
        </RouterLink>
        <span
          v-for="label in disabledItems"
          :key="label"
          class="flex cursor-not-allowed items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-zinc-300 dark:text-zinc-700"
        >
          <Lock :size="16" />
          {{ label }}
        </span>
      </nav>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 顶栏 -->
      <header
        class="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="text-sm text-zinc-500 dark:text-zinc-400">{{ crumb }}</div>
        <div class="flex items-center gap-2.5">
          <span class="text-sm text-zinc-600 dark:text-zinc-300">{{ auth.user?.username }}</span>
          <Chip variant="primary" size="sm">
            {{ auth.user?.role === 'admin' ? '管理员' : (auth.user?.roleName || '普通用户') }}
          </Chip>
          <Button variant="ghost" size="sm" :icon="ChevronLeft" @click="router.push('/')">返回首页</Button>
          <Button variant="ghost" size="sm" :icon="LogOut" @click="logout">退出</Button>
        </div>
      </header>

      <main class="min-w-0 flex-1 p-5">
        <router-view />
      </main>
    </div>
  </div>
</template>
