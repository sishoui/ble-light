<script setup lang="ts">
/**
 * 文件查看器：模态框展示文件内容。
 * Markdown 默认渲染预览，可切回原文；其他文件走行号 + 语法高亮。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { fetchFile, fmtBytes, type FileContent } from "../store";
import { highlightText } from "../../../scripts/highlight.mjs";
import { markdownToHtml } from "../../../scripts/markdown.mjs";

const props = defineProps<{ path: string }>();
const emit = defineEmits<{ close: [] }>();

const data = ref<FileContent | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);
const wrap = ref(false);
const copied = ref(false);
const mode = ref<"preview" | "source">("preview");

const LANG: Record<string, string> = {
  ".ts": "typescript", ".js": "javascript", ".mjs": "javascript",
  ".vue": "vue", ".c": "c", ".h": "c", ".json": "json", ".md": "markdown",
  ".css": "css", ".wxml": "html", ".wxss": "css", ".html": "html",
  ".py": "python", ".cmd": "batch", ".bat": "batch", ".yml": "yaml",
  ".yaml": "yaml", ".toml": "toml",
};

const ext = computed(() => props.path.slice(props.path.lastIndexOf(".")));
const lang = computed(() => LANG[ext.value] ?? "text");
const isMarkdown = computed(() => ext.value === ".md");

const lines = computed(() => (data.value ? highlightText(data.value.text) : []));

const rendered = computed(() => {
  if (!data.value || !isMarkdown.value) return null;
  return markdownToHtml(data.value.text);
});

const headings = computed(() => rendered.value?.headings ?? []);

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function load() {
  loading.value = true;
  error.value = null;
  data.value = null;
  mode.value = "preview";
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
    <div class="modal" :class="{ 'with-toc': isMarkdown && mode === 'preview' && headings.length > 2 }">
      <header class="mhead">
        <div class="mleft">
          <span class="chip">{{ lang }}</span>
          <span class="mpath mono">{{ path }}</span>
        </div>
        <div class="mright">
          <span v-if="data" class="faint stat mono">
            {{ data.lines }} 行 · {{ fmtBytes(data.bytes) }}
          </span>
          <div v-if="isMarkdown" class="seg">
            <button :class="['segbtn', { on: mode === 'preview' }]" @click="mode = 'preview'">预览</button>
            <button :class="['segbtn', { on: mode === 'source' }]" @click="mode = 'source'">原文</button>
          </div>
          <template v-if="!isMarkdown || mode === 'source'">
            <button class="tool" :class="{ on: wrap }" @click="wrap = !wrap" title="自动换行">换行</button>
          </template>
          <button class="tool" @click="copy">{{ copied ? "已复制" : "复制" }}</button>
          <button class="tool close" @click="emit('close')" title="关闭">✕</button>
        </div>
      </header>

      <div v-if="loading" class="state">读取中…</div>
      <div v-else-if="error" class="state err">{{ error }}</div>

      <div v-else-if="data" class="body">
        <nav v-if="isMarkdown && mode === 'preview' && headings.length > 2" class="toc">
          <div class="toc-h">目录</div>
          <button
            v-for="h in headings"
            :key="h.id"
            :class="['toc-item', `d${h.depth}`]"
            @click="jumpTo(h.id)"
          >
            {{ h.text }}
          </button>
        </nav>

        <div v-if="isMarkdown && mode === 'preview'" class="preview" v-html="rendered?.html ?? ''" />
        <div v-else class="code" :class="{ wrapped: wrap }">
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
  width: min(1180px, 100%); height: min(88vh, 100%);
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

.seg {
  display: flex; gap: 2px; padding: 2px; margin-right: 4px;
  background: #0f1216; border: 1px solid var(--line); border-radius: 6px;
}
.segbtn { padding: 2px 10px; border-radius: 4px; font-size: 11.5px; color: var(--ink-3); }
.segbtn:hover { color: var(--ink-2); }
.segbtn.on { background: var(--surface-2); color: var(--ink); }

.state { padding: 40px; color: var(--ink-3); font-size: 13px; }
.state.err { color: var(--err); }

.body { flex: 1; display: flex; min-height: 0; }

.toc {
  flex: none; width: 218px; overflow-y: auto;
  border-right: 1px solid var(--line-soft);
  padding: 14px 8px 24px 14px;
}
.toc-h {
  font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 8px; padding-left: 6px;
}
.toc-item {
  display: block; width: 100%; text-align: left;
  padding: 3px 6px; border-radius: 4px;
  font-size: 11.5px; color: var(--ink-3); line-height: 1.45;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: background 120ms, color 120ms;
}
.toc-item:hover { background: var(--surface-2); color: var(--ink-2); }
.toc-item.d1 { color: var(--ink-2); font-weight: 500; }
.toc-item.d3 { padding-left: 18px; }
.toc-item.d4, .toc-item.d5, .toc-item.d6 { padding-left: 28px; }

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

/* ---------- Markdown 预览 ---------- */
.preview {
  flex: 1; overflow-y: auto;
  padding: 26px 40px 64px;
  font-size: 14px; line-height: 1.75; color: #c8d1dc;
  max-width: 100%;
}
.preview :deep(h1),
.preview :deep(h2),
.preview :deep(h3),
.preview :deep(h4) {
  color: var(--ink);
  line-height: 1.35;
  margin: 1.7em 0 0.6em;
  letter-spacing: -0.005em;
  scroll-margin-top: 12px;
}
.preview :deep(h1) {
  font-size: 24px; font-weight: 600;
  margin-top: 0; padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.preview :deep(h2) {
  font-size: 17px; font-weight: 600;
  padding-bottom: 7px; border-bottom: 1px solid var(--line-soft);
}
.preview :deep(h3) { font-size: 15px; font-weight: 600; }
.preview :deep(h4) { font-size: 13.5px; font-weight: 600; color: var(--ink-2); }
.preview :deep(p) { margin: 0.85em 0; }
.preview :deep(a) { color: var(--accent-soft); text-decoration: underline; text-underline-offset: 2px; }
.preview :deep(a:hover) { color: #a8c0d6; }
.preview :deep(strong) { color: var(--ink); font-weight: 600; }
.preview :deep(ul),
.preview :deep(ol) { margin: 0.8em 0; padding-left: 1.5em; }
.preview :deep(li) { margin: 0.3em 0; }
.preview :deep(li::marker) { color: var(--ink-3); }
.preview :deep(blockquote) {
  margin: 1em 0; padding: 2px 0 2px 16px;
  border-left: 2px solid #33414f;
  color: var(--ink-2);
}
.preview :deep(blockquote p) { margin: 0.45em 0; }
.preview :deep(code) {
  font-family: var(--mono); font-size: 12.5px;
  background: var(--surface-2); border: 1px solid var(--line-soft);
  padding: 1px 5px; border-radius: 4px;
  color: #b9c7d6;
}
.preview :deep(pre.md-pre) {
  margin: 1.1em 0; padding: 13px 16px;
  background: #0e1115; border: 1px solid var(--line);
  border-radius: var(--r-sm); overflow-x: auto;
}
.preview :deep(pre.md-pre code) {
  background: none; border: none; padding: 0;
  font-size: 12.5px; line-height: 1.65; color: #b9c7d6;
}
.preview :deep(table) {
  margin: 1.1em 0; width: 100%;
  border-collapse: collapse; font-size: 12.5px;
}
.preview :deep(thead th) {
  text-align: left; font-weight: 600; color: var(--ink-2);
  padding: 8px 12px; border-bottom: 1px solid var(--line);
  background: #101318;
  text-transform: none; letter-spacing: 0;
  position: static;
}
.preview :deep(tbody td) {
  padding: 7px 12px;
  border-bottom: 1px solid var(--line-soft);
  color: #bcc7d3;
  vertical-align: top;
}
.preview :deep(tbody tr:hover) { background: var(--surface-2); }
.preview :deep(hr) {
  margin: 1.8em 0; border: none; border-top: 1px solid var(--line);
}
.preview :deep(img) { max-width: 100%; border-radius: var(--r-sm); }

@media (max-width: 900px) {
  .overlay { padding: 10px; }
  .modal { height: 94vh; }
  .ln { width: 38px; padding-right: 9px; }
  .toc { display: none; }
  .preview { padding: 20px 18px 48px; }
}
</style>
