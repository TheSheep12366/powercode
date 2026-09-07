<script setup lang="ts">
import { computed } from 'vue';
import { avatarUrl } from '@/api/my';

const props = withDefaults(
  defineProps<{
    userId: number;
    name: string;
    avatarExt?: string | null;
    avatarVersion?: number | null;
    /** 头像尺寸（px） */
    size?: number;
    /** true=在线绿点，false=灰点，undefined=不显示状态点 */
    online?: boolean;
    /** 悬停提示的副行（如正在编辑的工作区/文件） */
    tooltipSub?: string | null;
  }>(),
  { size: 32, avatarExt: null, avatarVersion: null, online: undefined, tooltipSub: null }
);

const initials = computed(() => (props.name || '?').slice(0, 1).toUpperCase());
const px = computed(() => `${props.size}px`);
const dotPx = computed(() => `${Math.max(8, Math.round(props.size * 0.3))}px`);
const tooltip = computed(() => (props.tooltipSub ? `${props.name}\n${props.tooltipSub}` : props.name));
</script>

<template>
  <span class="relative inline-block shrink-0 align-middle" :style="{ width: px, height: px }" :title="tooltip">
    <img
      v-if="avatarExt"
      :src="avatarUrl(userId, avatarVersion)"
      class="h-full w-full rounded-full border border-zinc-200 object-cover dark:border-zinc-700"
      :style="{ width: px, height: px }"
      :alt="name"
    />
    <span
      v-else
      class="flex h-full w-full items-center justify-center rounded-full bg-zinc-200 font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
      :style="{ fontSize: `${Math.max(11, Math.round(size * 0.42))}px` }"
    >
      {{ initials }}
    </span>
    <span
      v-if="online !== undefined"
      class="absolute rounded-full border-2 border-white dark:border-zinc-900"
      :style="{
        width: dotPx,
        height: dotPx,
        right: 0,
        bottom: 0,
        backgroundColor: online ? '#22c55e' : '#a1a1aa'
      }"
      :title="online ? '在线' : '离线'"
    />
  </span>
</template>
