<script setup lang="ts">
import Button from 'fuxsto-design/button';
import InputDefault from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import CheckboxDefault from 'fuxsto-design/checkbox';
import Popconfirm from 'fuxsto-design/popconfirm';
import { Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import {
  createGlobalTodo,
  createTodo,
  deleteGlobalTodo,
  deleteTodo,
  getTodos,
  updateGlobalTodo,
  updateTodo,
  type TodoItem
} from '@/api/dashboard';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();
const mine = ref<TodoItem[]>([]);
const global = ref<TodoItem[]>([]);
const newTitle = ref('');
const globalAddOpen = ref(false);
const globalTitle = ref('');

const canManageGlobal = computed(
  () => auth.user?.role === 'admin' || !!auth.user?.caps?.canManageGlobalPlans
);

async function load(): Promise<void> {
  try {
    const data = await getTodos();
    mine.value = data.mine;
    global.value = data.global;
  } catch {
    // 静默
  }
}

async function submit(): Promise<void> {
  if (!newTitle.value.trim()) return;
  try {
    await createTodo(newTitle.value.trim());
    newTitle.value = '';
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  }
}

async function toggleMine(t: TodoItem): Promise<void> {
  try {
    await updateTodo(t.id, { done: !t.done });
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '更新失败');
  }
}

async function removeMine(id: number): Promise<void> {
  try {
    await deleteTodo(id);
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

async function toggleGlobal(t: TodoItem): Promise<void> {
  try {
    await updateGlobalTodo(t.id, { done: !t.done });
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '更新失败');
  }
}

async function submitGlobal(): Promise<void> {
  if (!globalTitle.value.trim()) return;
  try {
    await createGlobalTodo(globalTitle.value.trim());
    globalTitle.value = '';
    globalAddOpen.value = false;
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '创建失败');
  }
}

async function removeGlobal(id: number): Promise<void> {
  try {
    await deleteGlobalTodo(id);
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-auto weak-scrollbar">
    <!-- 全员计划 -->
    <template v-if="global.length > 0">
      <div class="text-[11px] font-medium text-zinc-400">全员计划（管理员发布）</div>
      <div
        v-for="g in global"
        :key="`g${g.id}`"
        class="rounded-xl border border-amber-200/60 bg-amber-50/40 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10"
      >
        <div class="flex items-center gap-2">
          <CheckboxDefault
            :model-value="g.done"
            size="sm"
            :animate="false"
            :disabled="!canManageGlobal"
            @update:model-value="() => toggleGlobal(g)"
          />
          <span class="min-w-0 flex-1 truncate text-[13px]" :class="g.done ? 'text-zinc-400 line-through' : 'text-zinc-800 dark:text-zinc-200'">
            {{ g.title }}
          </span>
          <span v-if="canManageGlobal" class="shrink-0">
            <Popconfirm title="删除全员 TODO" :description="`确定删除「${g.title}」吗？`" danger confirm-text="删除" cancel-text="取消" @confirm="removeGlobal(g.id)">
              <button class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                <Trash2 :size="13" />
              </button>
            </Popconfirm>
          </span>
        </div>
        <div class="mt-0.5 pl-6 text-[10px] text-zinc-400">{{ formatDateTime(g.createdAt) }}</div>
      </div>
    </template>

    <!-- 我的 TODO（竖向时间轴） -->
    <div class="text-[11px] font-medium text-zinc-400">我的 TODO</div>
    <div v-if="mine.length > 0" class="relative ml-1.5 space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-700">
      <div v-for="t in mine" :key="t.id" class="relative">
        <span
          class="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-900"
          :class="t.done ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'"
        />
        <div class="flex items-center gap-2">
          <CheckboxDefault :model-value="t.done" size="sm" :animate="false" @update:model-value="() => toggleMine(t)" />
          <span class="min-w-0 flex-1 truncate text-[13px]" :class="t.done ? 'text-zinc-400 line-through' : 'text-zinc-800 dark:text-zinc-200'">
            {{ t.title }}
          </span>
          <span class="shrink-0">
            <Popconfirm title="删除 TODO" :description="`确定删除「${t.title}」吗？`" danger confirm-text="删除" cancel-text="取消" @confirm="removeMine(t.id)">
              <button class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
                <Trash2 :size="13" />
              </button>
            </Popconfirm>
          </span>
        </div>
        <div class="mt-0.5 pl-6 text-[10px] text-zinc-400">{{ formatDateTime(t.createdAt) }}</div>
      </div>
    </div>
    <div v-else class="text-xs text-zinc-400">暂无个人 TODO</div>

    <!-- 新增 -->
    <div class="flex items-center gap-2">
      <InputDefault
        v-model="newTitle"
        class="flex-1!"
        placeholder="添加 TODO，回车确认"
        size="sm"
        @keyup.enter="submit"
      />
    </div>

    <!-- 管理员添加全员计划 -->
    <div v-if="canManageGlobal" class="border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <div v-if="globalAddOpen" class="space-y-2">
        <InputDefault v-model="globalTitle" placeholder="全员计划内容" size="sm" />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="globalAddOpen = false">取消</Button>
          <Button variant="primary" size="sm" @click="submitGlobal">发布全员计划</Button>
        </div>
      </div>
      <Button v-else variant="secondary" size="sm" class="w-full" @click="globalAddOpen = true">发布全员 TODO 计划</Button>
    </div>
  </div>
</template>
