<script setup lang="ts">
import Button from 'fuxsto-design/button';
import { Sparkles } from 'lucide-vue-next';
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-2 py-4 text-center">
    <span class="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
      <Sparkles :size="20" class="text-zinc-400" />
    </span>
    <p class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">AI 能力即将上线</p>
    <p class="text-xs leading-5 text-zinc-400">代码助手、智能审查、自动总结等能力规划中，敬请期待</p>
    <Button variant="secondary" size="sm" disabled>敬请期待</Button>
  </div>
</template>
