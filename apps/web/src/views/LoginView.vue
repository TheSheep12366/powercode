<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Card from 'fuxsto-design/card';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function submit(): Promise<void> {
  if (!form.username.trim()) {
    Message.warning('请输入用户名');
    return;
  }
  if (!form.password) {
    Message.warning('请输入密码');
    return;
  }
  loading.value = true;
  try {
    await auth.login(form.username.trim(), form.password);
    Message.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-950">
    <!-- 装饰形状 -->
    <div class="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-zinc-200 dark:bg-zinc-800/60" />
    <div class="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-zinc-200 dark:bg-zinc-800/60" />
    <div class="absolute bottom-32 right-[15%] h-24 w-24 rounded-full bg-zinc-300/70 dark:bg-zinc-800" />

    <div class="relative w-[400px] max-w-[92vw]">
      <Card shadow="md" padding="lg" class="relative">
        <div class="mb-6 text-center">
          <div
            class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-bold tracking-wider text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            PC
          </div>
          <h1 class="text-2xl font-medium tracking-wide text-zinc-900 dark:text-zinc-50">PowerCode</h1>
          <p class="mt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">多人在线代码协作平台</p>
        </div>

        <div class="space-y-4" @keyup.enter="submit">
          <Input v-model="form.username" placeholder="用户名" autocomplete="username" size="lg" />
          <Input v-model="form.password" type="password" placeholder="密码" autocomplete="current-password" size="lg" />
          <Button variant="primary" size="lg" class="w-full" :loading="loading" @click="submit">登 录</Button>
        </div>
      </Card>
    </div>
  </div>
</template>
