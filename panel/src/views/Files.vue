<script setup lang="ts">
import { computed, ref } from "vue";
import { fmtBytes, fmtNum, type MapData } from "../store";

const props = defineProps<{ data: MapData }>();
const q = ref("");
const view = ref<"modules" | "tree">("modules");
const kind = ref<"all" | "code" | "doc" | "test" | "binary">("all");

const layerName = computed(() => {
  const m: Record<string, string> = {};
  for (const l of props.data.layers) m[l.id] = l.name;
  return m;
});

const modules = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.data.modules.filter((m) => !needle || m.path.toLowerCase().includes(needle));
});

const tree = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const rows = props.data.files.list.filter((f) => {
    if (needle && !f.path.toLowerCase().includes(needle)) return false;
    if (kind.value === "code" && (f.isDoc || f.isTest || f.binary)) return false;
    if (kind.value === "doc" && !f.isDoc) return false;
    if (kind.value === "test" && !f.isTest) return false;
    if (kind.value === "binary" && !f.binary) return false;
    return true;
  });
  const byDir = new Map<string, typeof rows>();
  for (const f of rows) {
    if (!byDir.has(f.dir)) byDir.set(f.dir, []);
    byDir.get(f.dir)!.push(f);
  }
  return [...byDir.entries()].sort(([a], [b]) => a.localeCompare(b));
});

const extList = computed(() =>
  Object.entries(props.data.files.byExt).sort((a, b) => b[1] - a[1]).slice(0, 12),
);

const maxDir = computed(() => Math.max(1, ...Object.values(props.data.files.byDir)));
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>文件</h1>
        <p class="lede">仓库全貌。模块职责来自 <code>docs/map.json</code>，其余全部扫描得出。</p>
      </div>
      <div class="chip">{{ data.files.total }} 个 · {{ fmtNum(data.files.lines) }} 行</div>
    </header>

    <div class="summary">
      <div class="sbox card"><span class="sl">代码</span><span class="sv num">{{ data.files.code }}</span></div>
      <div class="sbox card"><span class="sl">文档</span><span class="sv num">{{ data.files.docs }}</span></div>
      <div class="sbox card"><span class="sl">测试</span><span class="sv num">{{ data.files.tests }}</span></div>
      <div class="sbox card"><span class="sl">二进制</span><span class="sv num">{{ data.files.binary }}</span></div>
      <div class="sbox card wide">
        <span class="sl">扩展名分布</span>
        <div class="exts">
          <span v-for="[ext, n] in extList" :key="ext" class="ext">
            <span class="mono">{{ ext || "(无)" }}</span><span class="num faint">{{ n }}</span>
          </span>
        </div>
      </div>
    </div>

    <div class="tools">
      <input v-model="q" class="search" placeholder="按路径过滤…" />
      <div class="seg">
        <button :class="['segbtn', { on: view === 'modules' }]" @click="view = 'modules'">按模块</button>
        <button :class="['segbtn', { on: view === 'tree' }]" @click="view = 'tree'">按目录</button>
      </div>
      <div v-if="view === 'tree'" class="seg">
        <button v-for="k in (['all','code','doc','test','binary'] as const)" :key="k"
          :class="['segbtn', { on: kind === k }]" @click="kind = k">
          {{ { all: "全部", code: "代码", doc: "文档", test: "测试", binary: "二进制" }[k] }}
        </button>
      </div>
    </div>

    <div v-if="view === 'modules'" class="mods">
      <div v-if="!modules.length" class="empty card">没有匹配的模块。</div>
      <article v-for="m in modules" :key="m.path" :class="['card', 'mod', { ghost: !m.exists }]">
        <div class="mhead">
          <span class="chip">{{ layerName[m.layer] ?? m.layer }}</span>
          <span v-if="m.seam" class="chip acc">接缝 · {{ { protocol: '协议', reducer: 'reducer', render: '渲染', session: '会话', page: '页面' }[m.seam] ?? m.seam }}</span>
          <span v-if="!m.exists" class="chip warn">未创建</span>
          <span class="mpath mono">{{ m.path }}</span>
        </div>
        <p class="mrole">{{ m.role }}</p>
        <div class="mfoot">
          <span class="num">{{ m.fileCount }}</span> 文件
          <span class="sep">·</span>
          <span class="num">{{ fmtNum(m.lines) }}</span> 行
        </div>
      </article>
    </div>

    <div v-else class="dirs">
      <div v-if="!tree.length" class="empty card">没有匹配的文件。</div>
      <section v-for="[dir, files] in tree" :key="dir" class="dir">
        <div class="dhead">
          <span class="mono dname">{{ dir }}</span>
          <span class="faint num">{{ files.length }} 文件</span>
        </div>
        <div class="dbar"><div class="bar"><i :style="{ width: `${Math.max(3, (files.length / maxDir) * 100)}%` }" /></div></div>
        <div class="card">
          <table>
            <tbody>
              <tr v-for="f in files" :key="f.path">
                <td class="mono fpath">
                  {{ f.path.slice(dir === "." ? 0 : dir.length + 1) }}
                  <span v-if="f.isDoc" class="chip acc tag">文档</span>
                  <span v-else-if="f.isTest" class="chip warn tag">测试</span>
                  <span v-else-if="f.binary" class="chip tag">二进制</span>
                </td>
                <td class="num r faint" style="width:80px">{{ f.lines != null ? `${fmtNum(f.lines)} 行` : fmtBytes(f.size) }}</td>
                <td class="num r faint" style="width:74px">{{ fmtBytes(f.size) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; }
.lede code { font-family: var(--mono); font-size: 12px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

.summary { display: grid; grid-template-columns: repeat(4, 110px) 1fr; gap: 10px; }
.sbox { padding: 12px 14px; display: grid; gap: 2px; align-content: start; }
.sbox.wide { padding: 12px 16px; }
.sl { font-size: 11px; color: var(--ink-3); }
.sv { font-size: 22px; font-weight: 300; line-height: 1.2; }
.exts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 4px; }
.ext { display: flex; gap: 5px; font-size: 11.5px; }
.ext .mono { color: var(--ink-2); }

.tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.search {
  flex: 1; max-width: 340px; min-width: 180px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 8px 12px; font-size: 12.5px; outline: none;
}
.search:focus { border-color: #3a4a5c; }
.search::placeholder { color: var(--ink-3); }
.seg { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px; }
.segbtn { padding: 5px 11px; border-radius: 4px; font-size: 11.5px; color: var(--ink-3); }
.segbtn:hover { color: var(--ink-2); }
.segbtn.on { background: var(--surface-2); color: var(--ink); }

.empty { padding: 40px; text-align: center; color: var(--ink-3); font-size: 13px; }

.mods { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 11px; }
.mod { padding: 14px 16px; display: grid; gap: 7px; align-content: start; transition: border-color 140ms; }
.mod:hover { border-color: #34404d; }
.mod.ghost { opacity: 0.72; border-style: dashed; }
.mhead { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mpath { font-size: 11.5px; color: var(--ink-2); margin-left: auto; }
.mrole { font-size: 12.5px; color: var(--ink-2); line-height: 1.6; }
.mfoot { font-size: 11px; color: var(--ink-3); }
.sep { margin: 0 5px; }

.dirs { display: grid; gap: 16px; }
.dir { display: grid; gap: 6px; }
.dhead { display: flex; align-items: baseline; justify-content: space-between; }
.dname { font-size: 12px; color: var(--ink-2); }
.dhead .faint { font-size: 11px; }
.dbar { margin-bottom: 2px; }
.dbar .bar { height: 2px; }
.dbar .bar > i { background: #33414f; }
.fpath { font-size: 11.5px; word-break: break-all; }
.tag { margin-left: 8px; font-size: 10px; padding: 0 6px; }
.r { text-align: right; }
</style>
