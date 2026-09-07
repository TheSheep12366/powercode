<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    options: Array<{ label: string; value: string | number }>;
    modelValue: Array<string | number>;
    placeholder?: string;
  }>(),
  { placeholder: '请选择' }
);

const emit = defineEmits<{ 'update:modelValue': [value: Array<string | number>] }>();

const open = ref(false);
const root = ref<HTMLDivElement>();

const selectedLabels = computed(() => {
  const map = new Map(props.options.map((o) => [o.value, o.label]));
  return props.modelValue.map((v) => map.get(v) ?? String(v));
});

function toggleOption(value: string | number): void {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value];
  emit('update:modelValue', next);
}

function onOutsideClick(e: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', onOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', onOutsideClick));
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 rounded-[10px] border border-zinc-200 bg-white px-3 py-2 text-left text-[13px] text-zinc-800 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
      @click="open = !open"
    >
      <span class="min-w-0 flex-1 truncate" :class="selectedLabels.length ? '' : 'text-zinc-400'">
        {{ selectedLabels.length ? selectedLabels.join('、') : placeholder }}
      </span>
      <span
        v-if="selectedLabels.length"
        class="ml-1 shrink-0 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {{ selectedLabels.length }}
      </span>
      <ChevronDown :size="15" class="shrink-0 text-zinc-400" />
    </button>

    <div
      v-if="open"
      class="absolute z-[80] mt-1 max-h-48 w-full overflow-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 weak-scrollbar"
    >
      <div v-if="options.length === 0" class="px-2 py-2 text-xs text-zinc-400">暂无可选项</div>
      <label
        v-for="o in options"
        :key="o.value"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <input
          type="checkbox"
          class="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
          :checked="modelValue.includes(o.value)"
          @change="toggleOption(o.value)"
        />
        {{ o.label }}
      </label>
    </div>
  </div>
</template>
