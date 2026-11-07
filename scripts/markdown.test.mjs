/**
 * scripts/markdown.mjs 的测试。
 *
 * 为什么必须测：渲染结果直接进 v-html，是面板唯一的注入点。
 * 原始 HTML 必须被丢掉，链接协议必须被白名单拦，frontmatter 不能露出来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml, safeHref, splitFrontmatter } from "./markdown.mjs";

/* ---------------- frontmatter ---------------- */

test("frontmatter 被剥离，不进正文", () => {
  const src = "---\npurpose: 测试文档\nstatus: 生效\n---\n\n# 标题\n\n正文";
  const { body, data, hasFrontmatter } = splitFrontmatter(src);
  assert.equal(hasFrontmatter, true);
  assert.equal(data.purpose, "测试文档");
  assert.equal(data.status, "生效");
  assert.equal(body, "\n# 标题\n\n正文");
  assert.ok(!body.includes("purpose:"), "正文里还有 frontmatter");
});

test("没有 frontmatter 时原样返回", () => {
  const src = "# 标题\n\n正文";
  const { body, hasFrontmatter } = splitFrontmatter(src);
  assert.equal(hasFrontmatter, false);
  assert.equal(body, src);
});

test("渲染结果里看不到 frontmatter 文本", () => {
  const src = "---\npurpose: 不该出现\nstatus: 生效\n---\n\n# 标题";
  const { html, frontmatter } = markdownToHtml(src);
  assert.ok(!html.includes("不该出现"), "frontmatter 泄漏到 HTML");
  assert.ok(!html.includes("status:"), "frontmatter 泄漏到 HTML");
  assert.equal(frontmatter.purpose, "不该出现", "元数据应当单独返回");
});

/* ---------------- XSS ---------------- */

test("原始 HTML 一律丢弃", () => {
  const cases = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="evil"></iframe>',
    '<div onclick="alert(1)">click</div>',
    '<style>body{display:none}</style>',
    '<svg><script>alert(1)</script></svg>',
  ];
  for (const src of cases) {
    const { html } = markdownToHtml(src);
    assert.ok(!/<script|<iframe|<style|<svg/i.test(html), `未拦掉：${src} → ${html}`);
    assert.ok(!/onerror=|onclick=/i.test(html), `事件属性泄漏：${src} → ${html}`);
  }
});

test("javascript: 链接被剥成纯文本", () => {
  for (const bad of [
    "[点我](javascript:alert(1))",
    "[点我](JavaScript:alert(1))",
    "[点我](data:text/html,<script>alert(1)</script>)",
    "[点我](vbscript:msgbox)",
  ]) {
    const { html } = markdownToHtml(bad);
    assert.ok(!/href=/i.test(html), `危险链接留下了 href：${html}`);
    assert.ok(html.includes("点我"), "链接文字应当保留");
  }
});

test("图片的 javascript: 地址被剥掉", () => {
  const { html } = markdownToHtml("![alt](javascript:alert(1))");
  assert.ok(!/<img/i.test(html), `危险图片留下了 img：${html}`);
  assert.ok(html.includes("alt"), "alt 文本应当保留");
});

test("safeHref 白名单", () => {
  assert.equal(safeHref("https://example.com"), "https://example.com");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("mailto:a@b.c"), "mailto:a@b.c");
  assert.equal(safeHref("#section"), "#section");
  assert.equal(safeHref("./docs/a.md"), "./docs/a.md");
  assert.equal(safeHref("docs/adr/0001.md"), "docs/adr/0001.md");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("JAVASCRIPT:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref(""), null);
  assert.equal(safeHref(null), null);
});

/* ---------------- 正常渲染 ---------------- */

test("外链带 noopener", () => {
  const { html } = markdownToHtml("[外链](https://example.com)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("站内链接不新开窗口", () => {
  const { html } = markdownToHtml("[内链](./docs/a.md)");
  assert.ok(!html.includes("target="), "站内链接不该新开窗口");
  assert.match(html, /href="\.\/docs\/a\.md"/);
});

test("标题带 id，中文标题也能生成", () => {
  const { html, headings } = markdownToHtml("## 1. 链路\n\n正文");
  assert.match(html, /<h2 id="1-链路">/);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].depth, 2);
  assert.equal(headings[0].text, "1. 链路");
});

test("同一份文档的 headings 深度与顺序正确", () => {
  const src = "# A\n\n## B\n\n### C\n\n## D";
  const { headings } = markdownToHtml(src);
  assert.deepEqual(headings.map((h) => [h.depth, h.text]), [
    [1, "A"], [2, "B"], [3, "C"], [2, "D"],
  ]);
});

test("表格被渲染成 table", () => {
  const src = "| a | b |\n|---|---|\n| 1 | 2 |";
  const { html } = markdownToHtml(src);
  assert.match(html, /<table>/);
  assert.match(html, /<th>a<\/th>/);
  assert.match(html, /<td>1<\/td>/);
});

test("代码块带 md-pre 类且内容转义", () => {
  const { html } = markdownToHtml("```ts\nconst x = a < b;\n```");
  assert.match(html, /class="md-pre"/);
  assert.match(html, /class="lang-ts"/);
  assert.match(html, /&lt;/, "代码里的 < 应当转义");
});

test("行内代码被渲染成 code", () => {
  const { html } = markdownToHtml("用 `npm run gen` 生成");
  assert.match(html, /<code>npm run gen<\/code>/);
});

test("表格里的反引号也能渲染（protocol.md 的实际形态）", () => {
  const src = "| 码 | 名称 |\n|---|---|\n| `0x01` | `SetPower` |";
  const { html } = markdownToHtml(src);
  assert.match(html, /<code>0x01<\/code>/);
  assert.match(html, /<code>SetPower<\/code>/);
});

test("生成标记注释不会出现在预览里", () => {
  const src = "<!-- GENERATED:commands -->\n| a |\n|---|\n| 1 |\n<!-- /GENERATED:commands -->";
  const { html } = markdownToHtml(src);
  assert.ok(!html.includes("GENERATED"), "HTML 注释泄漏到预览");
  assert.match(html, /<table>/);
});

test("引用块与粗体正常渲染", () => {
  const { html } = markdownToHtml("> **重点**\n> 第二行");
  assert.match(html, /<blockquote>/);
  assert.match(html, /<strong>重点<\/strong>/);
});

test("复杂表格结构完整（我方 protocol.md 的生成表）", () => {
  const src = [
    "| 码 | 名称 | 载荷字节 | 说明 |",
    "|---|---|---:|---|",
    "| `0xA6` | magic | 1 | 帧头 |",
  ].join("\n");
  const { html } = markdownToHtml(src);
  assert.match(html, /<table>/);
  assert.equal((html.match(/<th[\s>]/g) || []).length, 4);
  assert.equal((html.match(/<td[\s>]/g) || []).length, 4);
});

test("空输入不炸", () => {
  const { html, headings } = markdownToHtml("");
  assert.equal(typeof html, "string");
  assert.deepEqual(headings, []);
});
