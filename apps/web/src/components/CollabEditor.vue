<script setup lang="ts">
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '@/composables/theme';

const props = defineProps<{
  dirId: number;
  dirName: string;
  path: string;
  name: string;
  userName: string;
  color: string;
}>();

const emit = defineEmits<{
  synced: [];
  authError: [message: string];
  connectionError: [message: string];
  dirtyChange: [dirty: boolean];
}>();

const host = ref<HTMLDivElement>();
let provider: HocuspocusProvider | null = null;
let ydoc: Y.Doc | null = null;
let view: EditorView | null = null;
const languageCompartment = new Compartment();
const darkCompartment = new Compartment();
const wrapCompartment = new Compartment();
const caretCompartment = new Compartment();
const { isDark } = useTheme();

// 暗色模式切换（组合式状态 + html class 同步）
watch(isDark, (dark) => {
  view?.dispatch({ effects: darkCompartment.reconfigure(dark ? [oneDark] : []) });
});

// ---- 脏状态（有未写盘的本地改动） ----
let dirty = false;
function setDirty(v: boolean): void {
  if (dirty === v) return;
  dirty = v;
  emit('dirtyChange', v);
}

function requestSave(): void {
  provider?.sendStateless(JSON.stringify({ type: 'force-store' }));
}

// ---- 颜色值内联方块（点击可改，改动走文档事务 = 可撤销 + 全员同步） ----
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

function tokenToEditableHex(token: string): string | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(token);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  if (hex.length === 6) return `#${hex}`;
  if (hex.length === 8) return `#${hex.slice(0, 6)}`;
  return null;
}

function expandShortHex(token: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(token);
  if (!m) return token;
  return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
}

class ColorSwatchWidget extends WidgetType {
  constructor(
    public color: string,
    public editableHex: string | null,
    public from: number,
    public to: number,
    public editorView: EditorView
  ) {
    super();
  }

  eq(other: ColorSwatchWidget): boolean {
    return other.color === this.color && other.from === this.from && other.to === this.to;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'pc-color-swatch';
    wrap.title = `${this.color}${this.editableHex ? '（点击修改）' : ''}`;
    const box = document.createElement('span');
    box.style.backgroundColor = this.color;
    wrap.appendChild(box);
    wrap.addEventListener('mousedown', (ev) => ev.preventDefault());
    wrap.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (!this.editableHex) return;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this.editableHex;
      input.style.position = 'fixed';
      input.style.left = '-100px';
      input.addEventListener('change', () => {
        this.editorView.dispatch({
          changes: { from: this.from, to: this.to, insert: input.value }
        });
      });
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 1500);
    });
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildColorDecorations(v: EditorView) {
  const decorations: Array<ReturnType<typeof Decoration.widget.prototype.range>> = [];
  for (const { from, to } of v.visibleRanges) {
    const text = v.state.doc.sliceString(from, to);
    COLOR_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COLOR_RE.exec(text)) !== null) {
      const start = from + m.index;
      const end = start + m[0].length;
      const token = m[0];
      decorations.push(
        Decoration.widget({
          widget: new ColorSwatchWidget(
            token.startsWith('#') && token.length === 4 ? expandShortHex(token) : token,
            tokenToEditableHex(token),
            start,
            end,
            v
          ),
          side: 1
        }).range(end)
      );
    }
  }
  return Decoration.set(decorations, true);
}

class ColorDecoPlugin {
  decorations: ReturnType<typeof buildColorDecorations>;

  constructor(view: EditorView) {
    this.decorations = buildColorDecorations(view);
  }

  update(u: { docChanged: boolean; viewportChanged: boolean; selectionSet: boolean; view: EditorView }): void {
    if (u.docChanged || u.viewportChanged || u.selectionSet) {
      this.decorations = buildColorDecorations(u.view);
    }
  }
}

const colorDecoPlugin = ViewPlugin.fromClass(ColorDecoPlugin, {
  decorations: (v) => v.decorations
});

async function loadLanguage(filename: string): Promise<void> {
  const desc = LanguageDescription.matchFilename(languages, filename);
  if (!desc || !view) return;
  try {
    const support = await desc.load();
    if (view && !view.isDestroyed) {
      view.dispatch({ effects: languageCompartment.reconfigure(support) });
    }
  } catch {
    // 语言包加载失败不阻塞编辑
  }
}

onMounted(() => {
  ydoc = new Y.Doc();
  provider = new HocuspocusProvider({
    url: `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/collab`,
    name: `d${props.dirId}:${props.path}`,
    document: ydoc
  });

  provider.on('authenticationError', ({ message }: { message: string }) => {
    emit('authError', message || '没有该文件的编辑权限');
  });
  provider.on('connectionError', ({ message }: { message: string }) => {
    emit('connectionError', message || '协作服务连接失败');
  });
  provider.on('synced', () => emit('synced'));
  provider.on('stateless', ({ payload }: { payload: string }) => {
    try {
      const msg = JSON.parse(payload);
      if (msg.type === 'stored') setDirty(false);
    } catch {
      // 忽略非 JSON 消息
    }
  });

  provider.awareness.setLocalStateField('user', { name: props.userName, color: props.color });

  const ytext = ydoc.getText('content');
  const yUndoManager = new Y.UndoManager(ytext);
  const prefs = ydoc.getMap('prefs');

  // 自动换行：共享偏好（一人切换，所有人生效）
  const applyWrap = (): void => {
    view?.dispatch({
      effects: wrapCompartment.reconfigure(prefs.get('wrap') ? EditorView.lineWrapping : [])
    });
  };
  prefs.observe(applyWrap);

  view = new EditorView({
    state: EditorState.create({
      extensions: [
        basicSetup,
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                requestSave();
                return true;
              }
            }
          ])
        ),
        yCollab(ytext, provider.awareness, { yUndoManager }),
        languageCompartment.of([]),
        darkCompartment.of(isDark.value ? [oneDark] : []),
        wrapCompartment.of(prefs.get('wrap') ? EditorView.lineWrapping : []),
        caretCompartment.of(
          EditorView.theme({
            '&': { caretColor: props.color },
            '.cm-cursor, .cm-dropCursor': { borderLeftColor: props.color },
            '.cm-cursor': { borderLeftWidth: '2px' }
          })
        ),
        colorDecoPlugin,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) setDirty(true);
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'transparent' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'JetBrains Mono', monospace",
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(161,161,170,.45) transparent'
          },
          '.cm-scroller::-webkit-scrollbar': { width: '8px', height: '8px' },
          '.cm-scroller::-webkit-scrollbar-thumb': {
            background: 'rgba(161,161,170,.45)',
            borderRadius: '999px'
          },
          '.cm-scroller::-webkit-scrollbar-thumb:hover': { background: 'rgba(161,161,170,.75)' },
          '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
          '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
          '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.035)' },
          '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.035)' }
        })
      ]
    }),
    parent: host.value!
  });

  applyWrap();
  void loadLanguage(props.name);
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
  provider?.destroy();
  provider = null;
  ydoc?.destroy();
  ydoc = null;
});

defineExpose({ requestSave });
</script>

<template>
  <div ref="host" class="h-full min-h-0 overflow-hidden" />
</template>

<style>
.pc-color-swatch {
  display: inline-flex;
  align-items: center;
  vertical-align: text-top;
  margin-left: 3px;
  cursor: pointer;
}

.pc-color-swatch > span {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(128, 128, 128, 0.55);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}
</style>
