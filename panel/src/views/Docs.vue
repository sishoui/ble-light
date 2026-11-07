<script setup lang="ts">
/** 文档：卡片式列出每份文档的路径、状态、一句话职责、行数，点击可看内容。 */
import { computed, ref } from "vue";
import { fmtNum, type MapData } from "../store";
import FileViewer from "./FileViewer.vue";

const props = defineProps<{ data: MapData }>();
const q = ref("");
const filter = ref<"all" | "core" | "adr">("all");
const viewing = ref<string | null>(null);

const list = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.data.docs
    .filter((d) => {
      if (filter.value === "adr" && !d.isAdr) return false;
      if (filter.value === "core" && d.isAdr) return false;
      if (!needle) return true;
      return (
        d.path.toLowerCase().includes(needle) ||
        (d.title ?? "").toLowerCase().includes(needle) ||
        (d.purpose ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => (a.isAdr === b.isAdr ? a.path.localeCompare(b.path) : a.isAdr ? 1 : -1));
});

const maxLines = computed(() => Math.max(1, ...props.data.docs.map((d) => d.lines)));

function statusTone(s: string | null) {
  if (!s) return "";
  if (/生效|active|current/.test(s)) return "ok";
  if (/草案|draft/.test(s)) return "warn";
  if (/废弃|作废|obsolete/.test(s)) return "err";
  return "";
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>文档</h1>
        <p class="lede">
          每个事实只有一个家。文件名不带版本号，作废即删除。
          {{ data.docStats.withoutFrontmatter ? `${data.docStats.withoutFrontmatter} 份缺 purpose 声明。` : "" }}
        </p>
      </div>
      <div class="chip">{{ data.docStats.count }} 份 · {{ fmtNum(data.docStats.lines) }} 行</div>
    </header>

    <div class="tools">
      <input v-model="q" class="search" placeholder="按路径、标题或职责过滤…" />
      <div class="seg">
        <button :class="['segbtn', { on: filter === 'all' }]" @click="filter = 'all'">全部</button>
        <button :class="['segbtn', { on: filter === 'core' }]" @click="filter = 'core'">契约</button>
        <button :class="['segbtn', { on: filter === 'adr' }]" @click="filter = 'adr'">ADR</button>
      </div>
    </div>

    <div v-if="!list.length" class="empty card">没有匹配的文档。</div>

    <div v-else class="grid">
      <article
        v-for="d in list"
        :key="d.path"
        :class="['card', 'doc', { adr: d.isAdr }]"
        role="button"
        tabindex="0"
        @click="viewing = d.path"
        @keydown.enter="viewing = d.path"
      >
        <div class="dhead">
          <span class="mono dpath">{{ d.path }}</span>
          <span v-if="d.status" :class="['chip', statusTone(d.status)]">{{ d.status }}</span>
        </div>
        <h2 class="dtitle">{{ d.title }}</h2>
        <p class="dpurpose">{{ d.purpose ?? "未声明职责——补 frontmatter 的 purpose 字段。" }}</p>
        <div class="dfoot">
          <span class="num">{{ fmtNum(d.lines) }} 行</span>
          <div class="dbar">
            <div class="bar"><i :style="{ width: `${Math.max(4, (d.lines / maxLines) * 100)}%` }" /></div>
          </div>
          <span class="open">查看 →</span>
        </div>
      </article>
    </div>

    <FileViewer v-if="viewing" :path="viewing" @close="viewing = null" />
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; max-width: 640px; }

.tools { display: flex; gap: 10px; align-items: center; }
.search {
  flex: 1; max-width: 380px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 8px 12px; font-size: 12.5px;
  outline: none; transition: border-color 140ms;
}
.search:focus { border-color: #3a4a5c; }
.search::placeholder { color: var(--ink-3); }
.seg { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px; }
.segbtn { padding: 5px 12px; border-radius: 4px; font-size: 12px; color: var(--ink-3); }
.segbtn:hover { color: var(--ink-2); }
.segbtn.on { background: var(--surface-2); color: var(--ink); }

.empty { padding: 40px; text-align: center; color: var(--ink-3); font-size: 13px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
.doc { padding: 15px 17px; display: grid; gap: 6px; align-content: start; transition: border-color 140ms; cursor: pointer; }
.doc:hover { border-color: #3d5a75; }
.doc:focus-visible { outline: 2px solid #3d5a75; outline-offset: 1px; }
.doc.adr { background: #12151a; }

.dhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dpath { font-size: 10.5px; color: var(--ink-3); word-break: break-all; }
.dtitle { font-size: 14px; font-weight: 500; line-height: 1.4; }
.dpurpose { font-size: 12px; color: var(--ink-2); line-height: 1.6; min-height: 2.4em; }
.dfoot { display: flex; align-items: center; gap: 10px; margin-top: 4px; font-size: 10.5px; color: var(--ink-3); }
.dbar { flex: 1; }
.dbar .bar { height: 3px; }
.dbar .bar > i { background: #3d5a75; }
.open { color: var(--ink-3); opacity: 0; transition: opacity 140ms, color 140ms; }
.doc:hover .open { opacity: 1; color: var(--accent-soft); }
</style>
