<script setup lang="ts">
/** 文件查看器：模态框展示文件内容，带行号、语法高亮、自动换行、复制与 Esc 关闭。 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { fetchFile, fmtBytes, type FileContent } from "../store";
import { highlightText } from "../../../scripts/highlight.mjs";

const props = defineProps<{ path: string }>();
const emit = defineEmits<{ close: [] }>();

const data = ref<FileContent | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const wrap = ref(false);
const copied = ref(false);

const LANG: Record<string, string> = {
  ".ts": "typescript", ".js": "javascript", ".mjs": "javascript",
  ".vue": "vue", ".c": "c", ".h": "c", ".json": "json", ".md": "markdown",
  ".css": "css", ".wxml": "html", ".wxss": "css", ".html": "html",
  ".py": "python", ".cmd": "batch", ".bat": "batch", ".yml": "yaml",
  ".yaml": "yaml", ".toml": "toml",
};

const lang = computed(() => LANG[props.path.slice(props.path.lastIndexOf("."))] ?? "text");

const lines = computed(() => (data.value ? highlightText(data.value.text) : []));

async function load() {
  loading.value = true;
  error.value = null;
  data.value = null;
  try {
    data.value = await fetchFile(props.path);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function copy() {
  if (!data.value) return;
  try {
    await navigator.clipboard.writeText(data.value.text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1400);
  } catch {
    copied.value = false;
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
watch(() => props.path, load);
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <header class="mhead">
        <div class="mleft">
          <span class="chip">{{ lang }}</span>
          <span class="mpath mono">{{ path }}</span>
        </div>
        <div class="mright">
          <span v-if="data" class="faint stat mono">
            {{ data.lines }} 行 · {{ fmtBytes(data.bytes) }}
          </span>
          <button class="tool" :class="{ on: wrap }" @click="wrap = !wrap" title="自动换行">换行</button>
          <button class="tool" @click="copy">{{ copied ? "已复制" : "复制" }}</button>
          <button class="tool close" @click="emit('close')" title="关闭">✕</button>
        </div>
      </header>

      <div v-if="loading" class="state">读取中…</div>
      <div v-else-if="error" class="state err">{{ error }}</div>
      <div v-else-if="data" class="code" :class="{ wrapped: wrap }">
        <div v-if="data.truncated" class="trunc">
          文件超过 512 KB，只显示前 512 KB
        </div>
        <div class="table">
          <div v-for="l in lines" :key="l.n" class="row">
            <span class="ln">{{ l.n }}</span>
            <code class="lc" v-html="l.html || ' '" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(5, 7, 10, 0.78);
  backdrop-filter: blur(3px);
  display: grid; place-items: center;
  padding: 32px;
}
.modal {
  width: min(1100px, 100%); height: min(86vh, 100%);
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); overflow: hidden;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55);
}

.mhead {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 11px 14px; border-bottom: 1px solid var(--line); flex: none;
}
.mleft { display: flex; align-items: center; gap: 9px; min-width: 0; }
.mpath { font-size: 12px; color: var(--ink-2); word-break: break-all; }
.mright { display: flex; align-items: center; gap: 6px; flex: none; }
.stat { font-size: 11px; margin-right: 4px; }
.tool {
  padding: 3px 9px; border-radius: 5px; font-size: 11.5px;
  border: 1px solid var(--line); color: var(--ink-2);
  transition: border-color 130ms, color 130ms;
}
.tool:hover { border-color: #3a4a5c; color: var(--ink); }
.tool.on { color: var(--accent-soft); border-color: #2d3f4f; }
.tool.close { padding: 3px 8px; }
.tool.close:hover { color: var(--err); border-color: #4a2b28; }

.state { padding: 40px; color: var(--ink-3); font-size: 13px; }
.state.err { color: var(--err); }

.code { flex: 1; overflow: auto; }
.trunc {
  padding: 7px 14px; font-size: 11.5px; color: var(--warn);
  background: #241d13; border-bottom: 1px solid #4a3a22;
}
.table { font-family: var(--mono); font-size: 12.5px; line-height: 1.65; padding: 10px 0 24px; }
.row { display: flex; }
.row:hover { background: var(--surface-2); }
.ln {
  flex: none; width: 52px; text-align: right; padding-right: 14px;
  color: #4b5461; user-select: none; font-size: 11.5px;
}
.lc {
  flex: 1; white-space: pre; padding-right: 24px;
  font-family: var(--mono); color: #c8d1dc;
  min-width: 0;
}
.wrapped .lc { white-space: pre-wrap; word-break: break-word; }

.code :deep(.c-comment) { color: #5f6b7a; font-style: italic; }
.code :deep(.c-str) { color: #8fae83; }
.code :deep(.c-num) { color: #b8935f; }
.code :deep(.c-kw) { color: #7f9dc0; }

@media (max-width: 900px) {
  .overlay { padding: 10px; }
  .modal { height: 94vh; }
  .ln { width: 38px; padding-right: 9px; }
}
</style>
