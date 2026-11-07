/**
 * scripts/highlight.mjs 的测试。
 *
 * 为什么必须测：第一版用「连续 replace」写高亮，把自己的 HTML 属性
 * 当成下一次匹配的输入，页面上出现字面的 class="c-str">。这类 bug
 * 肉眼一看就是内容损坏，但只有测试能保证它不再回来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightLine, highlightText } from "./highlight.mjs";

/** 去掉所有 span 标签，还原成纯文本（只反转义）。 */
function plain(html) {
  return html
    .replace(/<span class="[^"]*">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

test("高亮不改变文本内容", () => {
  const samples = [
    'const x = "hello";',
    "// 这是一行注释",
    "padding: 12px 14px;",
    "| `0xA6` | magic |",
    "if (a < b && c > d) return;",
    "#include <stdint.h>",
    "```ts\nconst y = 1;\n```",
    "  > 引用里带 `code` 和**粗体**",
    'const s = "a \\" b";',
    "没什么特别的",
  ];
  for (const s of samples) {
    assert.equal(plain(highlightLine(s)), s, `内容被改动：${JSON.stringify(s)}`);
  }
  // 空行是刻意返回一个空格，让行高保持，不算内容改动
  assert.equal(plain(highlightLine("")), " ");
});

test("不产出字面的 class= 文本", () => {
  // 这是第一版的 bug：replace 链把插入的标签当内容再次匹配
  const cases = [
    'const a = "b";',
    "// 注释里带 class=\"x\"",
    "x = 1 + 2",
    'const s = `template ${"a"}`;',
  ];
  for (const s of cases) {
    const html = highlightLine(s);
    const visible = plain(html);
    assert.ok(
      !visible.includes('class="c-'),
      `高亮产出了可见的 class 文本：${JSON.stringify(visible)}`,
    );
  }
});

test("关键字加 span，普通标识符不加", () => {
  const html = highlightLine("const value = 1;");
  assert.match(html, /<span class="c-kw">const<\/span>/);
  assert.ok(!html.includes('<span class="c-kw">value</span>'));
});

test("字符串整体包成一个 span，内部的标签字符被转义", () => {
  const html = highlightLine('x = "<div>"');
  assert.match(html, /<span class="c-str">&quot;&lt;div&gt;&quot;<\/span>/);
  assert.equal(plain(html), 'x = "<div>"');
});

test("行注释吃掉行尾，不解析里面的引号", () => {
  const html = highlightLine('// don\'t parse "this"');
  assert.match(html, /^<span class="c-comment">/);
  assert.ok(!html.includes("c-str"), "注释里不该识别字符串");
});

test("#include 是预处理指令，不是行注释", () => {
  const html = highlightLine("#include <stdint.h>");
  assert.ok(!html.includes("c-comment"), "#include 被误判为注释");
});

test("数字支持十六进制与浮点", () => {
  const html = highlightLine("magic = 0xA6; ratio = 1.5;");
  assert.match(html, /<span class="c-num">0xA6<\/span>/);
  assert.match(html, /<span class="c-num">1\.5<\/span>/);
});

test("空行不产出空字符串（保留可渲染的最小内容）", () => {
  assert.equal(highlightLine(""), " ");
});

test("多行文本的行号连续且内容逐行正确", () => {
  const src = "line one\nline two\nline three";
  const rows = highlightText(src);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.n), [1, 2, 3]);
  assert.equal(plain(rows[2].html), "line three");
});

test("转义只做一次：& 不会变成 &amp;amp;", () => {
  const html = highlightLine("a & b");
  assert.equal(plain(html), "a & b");
  assert.ok(!html.includes("&amp;amp;"));
});
