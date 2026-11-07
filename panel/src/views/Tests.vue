<script setup lang="ts">
/** 测试：按接缝分组，显示每个测试文件的职责、用例数、断言数与违规提示。 */
import { computed, ref } from "vue";
import { fmtNum, type MapData } from "../store";
import FileViewer from "./FileViewer.vue";

const props = defineProps<{ data: MapData }>();
const q = ref("");
const seamFilter = ref<string | null>(null);
const viewing = ref<string | null>(null);

const SEAMS: Record<string, string> = {
  protocol: "协议编解码",
  reducer: "命令 reducer",
  render: "渲染合成",
  session: "会话层",
  page: "页面处理器",
  tooling: "工具",
};

const list = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.data.tests.filter((t) => {
    if (seamFilter.value && t.seam !== seamFilter.value) return false;
    if (!needle) return true;
    return t.path.toLowerCase().includes(needle);
  });
});

const groups = computed(() => {
  const map = new Map<string, typeof list.value>();
  for (const t of list.value) {
    const key = t.seam ?? "unseamed";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return [...map.entries()].sort(([a], [b]) => (a === "unseamed" ? 1 : b === "unseamed" ? -1 : a.localeCompare(b)));
});

const totals = computed(() => ({
  files: list.value.length,
  cases: list.value.reduce((n, t) => n + t.cases, 0),
  asserts: list.value.reduce((n, t) => n + t.asserts, 0),
}));
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>测试</h1>
        <p class="lede">
          只测五个接缝，只断言行为。读源码做断言、mock 自证、fixture 快照都是缺陷。
        </p>
      </div>
      <div class="chip">{{ totals.files }} 文件 · {{ fmtNum(totals.cases) }} 用例</div>
    </header>

    <div v-if="!data.tests.length" class="empty card">
      <div class="etitle">还没有任何测试</div>
      <p class="edesc">
        这是预期的——产品代码还没开始。第一个测试应该落在<strong>协议编解码</strong>接缝上：
        一份 <code>docs/protocol-vectors.json</code>，固件与小程序共跑。
      </p>
    </div>

    <template v-else>
      <div class="tools">
        <input v-model="q" class="search" placeholder="按路径过滤…" />
        <div class="seams">
          <button :class="['sbtn', { on: seamFilter === null }]" @click="seamFilter = null">
            全部 <span class="num">{{ data.tests.length }}</span>
          </button>
          <button
            v-for="(label, key) in SEAMS"
            :key="key"
            :class="['sbtn', { on: seamFilter === key }]"
            @click="seamFilter = key"
          >
            {{ label }} <span class="num">{{ data.testStats.bySeam[key] ?? 0 }}</span>
          </button>
          <button
            v-if="data.testStats.unseamed"
            :class="['sbtn', 'warn', { on: seamFilter === 'unseamed' }]"
            @click="seamFilter = 'unseamed'"
          >
            未归类 <span class="num">{{ data.testStats.unseamed }}</span>
          </button>
        </div>
      </div>

      <section v-for="[seam, tests] in groups" :key="seam" class="group">
        <div class="ghead">
          <h2>{{ seam === "unseamed" ? "未归类" : SEAMS[seam] ?? seam }}</h2>
          <span class="faint">{{ tests.length }} 文件 · {{ fmtNum(tests.reduce((n, t) => n + t.cases, 0)) }} 用例</span>
        </div>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>文件与职责</th>
                <th style="width:80px" class="r">用例</th>
                <th style="width:80px" class="r">断言</th>
                <th style="width:70px" class="r">行数</th>
                <th style="width:140px">提示</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in tests"
                :key="t.path"
                class="trow"
                role="button"
                tabindex="0"
                @click="viewing = t.path"
                @keydown.enter="viewing = t.path"
              >
                <td>
                  <div class="mono tpath">{{ t.path }}</div>
                  <div v-if="t.description" class="tdesc">{{ t.description }}</div>
                  <div v-else class="tdesc none">未写文件头注释——加一段说明它测什么</div>
                </td>
                <td class="num r">{{ t.cases }}</td>
                <td class="num r">{{ t.asserts }}</td>
                <td class="num r faint">{{ t.lines }}</td>
                <td>
                  <span v-for="v in t.violations" :key="v" class="chip warn">
                    {{ v === "reads-source" ? "读源码" : "断言调用" }}
                  </span>
                  <span v-if="!t.violations.length" class="faint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <FileViewer v-if="viewing" :path="viewing" @close="viewing = null" />
  </div>
</template>

<style scoped>
.page { display: grid; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.lede { color: var(--ink-2); font-size: 13px; margin-top: 2px; max-width: 660px; }

.empty { padding: 32px 34px; }
.etitle { font-size: 15px; margin-bottom: 8px; }
.edesc { font-size: 13px; color: var(--ink-2); line-height: 1.7; max-width: 620px; }
.edesc code { font-family: var(--mono); font-size: 12px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }

.tools { display: grid; gap: 10px; }
.search {
  width: 100%; max-width: 380px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 8px 12px; font-size: 12.5px; outline: none;
}
.search:focus { border-color: #3a4a5c; }
.search::placeholder { color: var(--ink-3); }

.seams { display: flex; flex-wrap: wrap; gap: 6px; }
.sbtn {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 20px;
  border: 1px solid var(--line); background: var(--surface);
  font-size: 12px; color: var(--ink-2);
  transition: border-color 130ms, color 130ms;
}
.sbtn:hover { border-color: #34404d; }
.sbtn.on { border-color: #3d5a75; color: var(--ink); background: #161e25; }
.sbtn.warn { color: var(--warn); }
.sbtn .num { font-size: 10.5px; color: var(--ink-3); }
.sbtn.on .num { color: var(--accent-soft); }

.group { display: grid; gap: 8px; }
.ghead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ghead h2 { font-size: 13px; font-weight: 600; }
.ghead .faint { font-size: 11.5px; }

.tpath { font-size: 11.5px; word-break: break-all; }
.trow { cursor: pointer; }
.trow:focus-visible { outline: 2px solid #3d5a75; outline-offset: -2px; }
.tdesc { font-size: 11.5px; color: var(--ink-3); line-height: 1.55; margin-top: 3px; }
.tdesc.none { color: var(--warn); opacity: 0.75; }
.r { text-align: right; }
</style>
