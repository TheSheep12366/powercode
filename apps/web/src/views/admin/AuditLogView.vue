<script setup lang="ts">
import Card from 'fuxsto-design/card';
import Input from 'fuxsto-design/input';
import { Message } from 'fuxsto-design/message';
import Pagination from 'fuxsto-design/pagination';
import Table from 'fuxsto-design/table';
import { onMounted, ref } from 'vue';
import { listAuditLogs, type AuditRow } from '@/api/admin';
import { formatDateTime } from '@/utils/format';

const loading = ref(false);
const items = ref<AuditRow[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const q = ref('');
const action = ref('');

let searchTimer: number | undefined;

const columns = [
  { key: 'createdAt', title: '时间', width: 180 },
  { key: 'username', title: '操作者', width: 120 },
  { key: 'action', title: '动作' },
  { key: 'target', title: '对象' },
  { key: 'ip', title: 'IP', width: 140 }
];

async function fetchList(): Promise<void> {
  loading.value = true;
  try {
    const data = await listAuditLogs({
      page: page.value,
      pageSize: pageSize.value,
      q: q.value || undefined,
      action: action.value || undefined
    });
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    Message.error(e instanceof Error ? e.message : '加载审计日志失败');
  } finally {
    loading.value = false;
  }
}

function onSearchInput(): void {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    page.value = 1;
    void fetchList();
  }, 300);
}

function onPageChange(): void {
  void fetchList();
}

function prettyDetail(detail: string | null): string {
  if (!detail) return '-';
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

onMounted(fetchList);
</script>

<template>
  <Card shadow="sm" padding="md">
    <div class="mb-4 flex flex-wrap items-center gap-2.5">
      <Input v-model="q" class="w-56!" placeholder="按操作者用户名搜索" clearable @update:model-value="onSearchInput" />
      <Input v-model="action" class="w-56!" placeholder="按动作筛选，如 auth.login" clearable @update:model-value="onSearchInput" />
    </div>

    <Table
      :columns="columns"
      :data="items"
      row-key="id"
      :loading="loading"
      striped
      hover
      rounded
      expandable
      empty-text="暂无日志"
    >
      <template #cell-createdAt="{ row }">
        <span class="text-zinc-500 dark:text-zinc-400">{{ formatDateTime(row.createdAt) }}</span>
      </template>
      <template #cell-username="{ row }">
        {{ row.username ?? '（已删除）' }}
      </template>
      <template #cell-action="{ row }">
        <span class="font-mono text-[13px] text-zinc-900 dark:text-zinc-100">{{ row.action }}</span>
      </template>
      <template #cell-target="{ row }">
        <span class="text-zinc-500 dark:text-zinc-400">{{ row.target ?? '-' }}</span>
      </template>
      <template #expandedRow="{ row }">
        <pre class="m-0 overflow-auto px-4 py-3 font-mono text-xs whitespace-pre-wrap break-all text-zinc-600 dark:text-zinc-300">{{ prettyDetail(row.detail) }}</pre>
      </template>
    </Table>

    <div class="mt-4 flex justify-end">
      <Pagination
        v-model:current="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        show-size-changer
        show-total
        @change="onPageChange"
      />
    </div>
  </Card>
</template>
