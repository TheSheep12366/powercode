// 暗色模式：跟随系统初始化，手动切换后持久化到 localStorage
import { ref } from 'vue';

const STORAGE_KEY = 'pc-theme';

function apply(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

function current(): boolean {
  return document.documentElement.classList.contains('dark');
}

const isDark = ref(current());

export function useTheme() {
  return { isDark };
}

export function toggleTheme(): void {
  const next = !current();
  apply(next);
  localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  isDark.value = next;
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark') apply(true);
  else if (saved === 'light') apply(false);
  else apply(window.matchMedia('(prefers-color-scheme: dark)').matches);
  isDark.value = current();
}
