<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import { Message } from 'fuxsto-design/message';
import { computed, ref, watch } from 'vue';
import { getUserHome, uploadAvatar, type UserHome } from '@/api/my';
import UserAvatar from '@/components/UserAvatar.vue';
import { usePresence } from '@/composables/presence';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';

const props = defineProps<{
  open: boolean;
  userId: number | null;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const auth = useAuthStore();
const { list: presenceList } = usePresence();

const user = ref<UserHome | null>(null);
const loading = ref(false);
const uploading = ref(false);
const avatarInput = ref<HTMLInputElement>();
const avatarBust = ref(0);

const isSelf = computed(() => auth.user?.id === props.userId);

// 实时在线状态（来自全局 presence）
const live = computed(() => (props.userId ? presenceList.value.find((p) => p.userId === props.userId) : undefined));

const displayOnline = computed(() => !!live.value || !!user.value?.online);
const displayDoc = computed(() => live.value?.currentDoc ?? user.value?.currentDoc ?? null);

watch(
  () => [props.open, props.userId] as const,
  async ([open, id]) => {
    if (open && id) {
      user.value = null;
      loading.value = true;
      try {
        user.value = await getUserHome(id);
      } catch (e) {
        Message.error(e instanceof Error ? e.message : '加载用户信息失败');
        emit('update:open', false);
      } finally {
        loading.value = false;
      }
    }
  },
  { immediate: true }
);

function openUpload(): void {
  avatarInput.value?.click();
}

async function onAvatarChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  try {
    const data = await uploadAvatar(file);
    avatarBust.value = data.avatarVersion;
    if (auth.user) {
      auth.user.avatarExt = data.avatarExt;
      auth.user.avatarVersion = data.avatarVersion;
    }
    Message.success('头像已更新');
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '上传失败');
  } finally {
    uploading.value = false;
    input.value = '';
  }
}

function editingText(): string {
  if (!displayDoc.value) return '空闲中';
  return `正在编辑：${displayDoc.value.dirName} / ${displayDoc.value.name}`;
}
</script>

<template>
  <DialogDefault
    :open="open"
    title="用户主页"
    size="sm"
    :show-confirm="false"
    :show-cancel="false"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中…</div>
    <div v-else-if="user" class="flex flex-col items-center gap-4 py-2">
      <div class="relative">
        <UserAvatar
          :user-id="user.id"
          :name="user.username"
          :avatar-ext="user.avatarExt"
          :avatar-version="isSelf && avatarBust ? avatarBust : user.avatarVersion"
          :size="88"
          :online="displayOnline"
        />
        <button
          v-if="isSelf"
          class="absolute -bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-50 shadow transition-transform hover:scale-105 dark:bg-zinc-100 dark:text-zinc-900"
          :class="uploading ? 'opacity-60' : ''"
          @click="openUpload"
        >
          {{ uploading ? '上传中…' : '更换头像' }}
        </button>
        <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" @change="onAvatarChosen" />
      </div>

      <div class="text-center">
        <div class="flex items-center justify-center gap-2">
          <h2 class="text-lg font-medium text-zinc-900 dark:text-zinc-50">{{ user.username }}</h2>
          <Chip v-if="user.role === 'admin'" variant="primary" size="sm">管理员</Chip>
          <Chip v-else-if="user.roleName" variant="secondary" size="sm">{{ user.roleName }}</Chip>
        </div>
        <div class="mt-1 text-xs text-zinc-400">注册于 {{ formatDateTime(user.createdAt) }}</div>
      </div>

      <div class="w-full rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <div class="flex items-center justify-between gap-3">
          <span class="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
            <span class="h-2.5 w-2.5 rounded-full" :class="displayOnline ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'" />
            {{ displayOnline ? '当前在线' : '当前离线' }}
          </span>
        </div>
        <div class="mt-1.5 text-left text-[13px]" :class="displayDoc ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400'">
          {{ editingText() }}
        </div>
      </div>
    </div>
    <template #footer>
      <Button variant="primary" @click="emit('update:open', false)">关闭</Button>
    </template>
  </DialogDefault>
</template>
