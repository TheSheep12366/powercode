import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UserInfo } from '@powercode/shared';
import { api } from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null);
  const loaded = ref(false);

  async function fetchMe(): Promise<void> {
    try {
      const data = await api<{ user: UserInfo }>('/api/auth/me');
      user.value = data.user;
    } catch {
      user.value = null;
    } finally {
      loaded.value = true;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const data = await api<{ user: UserInfo }>('/api/auth/login', { body: { username, password } });
    user.value = data.user;
    loaded.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      user.value = null;
    }
  }

  return { user, loaded, fetchMe, login, logout };
});
