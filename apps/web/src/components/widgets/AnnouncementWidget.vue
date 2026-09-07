<script setup lang="ts">
import Button from 'fuxsto-design/button';
import Chip from 'fuxsto-design/chip';
import DialogDefault from 'fuxsto-design/dialog';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import { Megaphone } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { getAnnouncement, markAnnouncementRead, type AnnouncementInfo } from '@/api/dashboard';
import { announceRemindAt, usePresence } from '@/composables/presence';
import { useAuthStore } from '@/stores/auth';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();
const { list: presenceList } = usePresence();

const announcement = ref<AnnouncementInfo | null>(null);
const read = ref(true);
const shaking = ref(false);
const editOpen = ref(false);
const editTitle = ref('');
const editContent = ref('');
const stats = ref<{ total: number; readCount: number; unread: Array<{ id: number; username: string }> } | null>(null);

const canManage = computed(() => auth.user?.role === 'admin' || !!auth.user?.caps?.canManageAnnouncements);

async function load(): Promise<void> {
  try {
    const data = await getAnnouncement();
    announcement.value = data.announcement;
    read.value = data.read;
  } catch {
    // 静默
  }
}

async function markRead(): Promise<void> {
  try {
    await markAnnouncementRead();
    read.value = true;
    Message.success('已标记为已读');
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '操作失败');
  }
}

// ---- 管理编辑 ----
async function openEdit(): Promise<void> {
  editTitle.value = announcement.value?.title ?? '';
  editContent.value = announcement.value?.content ?? '';
  try {
    stats.value = announcement.value ? await (await import('@/api/dashboard')).getAnnouncementStats() : null;
  } catch {
    stats.value = null;
  }
  editOpen.value = true;
}

async function submitEdit(): Promise<void> {
  if (!editTitle.value.trim() || !editContent.value.trim()) {
    Message.warning('标题和内容不能为空');
    return;
  }
  try {
    const { upsertAnnouncement } = await import('@/api/dashboard');
    await upsertAnnouncement({ title: editTitle.value.trim(), content: editContent.value.trim() });
    Message.success('公告已发布');
    editOpen.value = false;
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '发布失败');
  }
}

async function removeAnnouncement(): Promise<void> {
  try {
    const { deleteAnnouncement } = await import('@/api/dashboard');
    await deleteAnnouncement();
    Message.success('公告已删除');
    editOpen.value = false;
    await load();
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '删除失败');
  }
}

async function remind(): Promise<void> {
  try {
    const { remindAnnouncement } = await import('@/api/dashboard');
    const data = await remindAnnouncement();
    Message.success(`已提醒 ${data.reminded} 位未读用户`);
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '提醒失败');
  }
}

// 一键提醒推送 → 高亮 + 抖动
watch(announceRemindAt, (t) => {
  if (!t || (announcement.value && read.value)) return;
  shaking.value = true;
  setTimeout(() => (shaking.value = false), 2500);
});

onMounted(load);

defineExpose({ hasAnnouncement: computed(() => !!announcement.value) });
</script>

<template>
  <div
    class="flex h-full flex-col rounded-2xl transition-all"
    :class="shaking ? 'pc-announce-highlight pc-shake' : ''"
  >
    <div v-if="!announcement" class="flex h-full items-center justify-center text-xs text-zinc-400">
      当前没有公告
      <Button v-if="canManage" variant="ghost" size="sm" class="ml-2" @click="openEdit">发布</Button>
    </div>
    <template v-else>
      <div class="mb-2 flex items-start justify-between gap-2">
        <span class="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
          <Megaphone :size="14" class="shrink-0 text-amber-500" />
          <span class="truncate">{{ announcement.title }}</span>
          <Chip v-if="!read" variant="primary" size="sm">未读</Chip>
        </span>
        <span class="shrink-0 text-[10px] text-zinc-400">{{ formatDateTime(announcement.updatedAt).slice(5, 16) }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-auto weak-scrollbar whitespace-pre-wrap break-all text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
        {{ announcement.content }}
      </div>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[11px] text-zinc-400">发布者：{{ announcement.creator ?? '管理员' }}</span>
        <span class="flex items-center gap-1.5">
          <template v-if="canManage">
            <Button variant="ghost" size="sm" @click="openEdit">管理</Button>
          </template>
          <Button v-if="!read" variant="primary" size="sm" @click="markRead">已读</Button>
        </span>
      </div>
    </template>

    <!-- 管理编辑弹窗 -->
    <DialogDefault v-model:open="editOpen" title="公告管理" size="md" :show-confirm="false" :show-cancel="false">
      <div class="space-y-3">
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">标题</div>
          <Input v-model="editTitle" placeholder="公告标题" />
        </div>
        <div>
          <div class="mb-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">内容</div>
          <textarea
            v-model="editContent"
            rows="4"
            class="w-full rounded-[10px] border border-zinc-200 bg-transparent px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:text-zinc-200"
            placeholder="公告内容"
          />
        </div>
        <div v-if="stats && announcement" class="rounded-xl border border-zinc-200 p-2.5 text-xs dark:border-zinc-700">
          已读 {{ stats.readCount }} / {{ stats.total }}
          <span v-if="stats.unread.length > 0" class="text-zinc-400">
            · 未读：{{ stats.unread.map((u) => u.username).join('、') }}
          </span>
          <Button variant="ghost" size="sm" class="ml-2" @click="remind">一键提醒未读</Button>
        </div>
        <div v-if="announcement" class="text-xs text-zinc-400">发布新公告将覆盖当前公告并清空已读记录</div>
      </div>
      <template #footer>
        <Button v-if="announcement" variant="ghost" danger @click="removeAnnouncement">删除公告</Button>
        <Button variant="ghost" @click="editOpen = false">取消</Button>
        <Button variant="primary" @click="submitEdit">发布</Button>
      </template>
    </DialogDefault>
  </div>
</template>
