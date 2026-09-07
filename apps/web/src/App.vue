<script setup lang="ts">
import { watch } from 'vue';
import { destroyPresenceSocket, initPresenceSocket } from '@/composables/presence';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();

// 登录期间保持全局在线连接（“正在使用即在线”），登出断开
watch(
  () => [auth.loaded, auth.user?.id] as const,
  ([loaded, uid]) => {
    if (loaded && uid) initPresenceSocket();
    if (loaded && !uid) destroyPresenceSocket();
  },
  { immediate: true }
);
</script>

<template>
  <router-view v-slot="{ Component }">
    <transition name="md3-fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>
