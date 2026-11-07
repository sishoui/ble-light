/**
 * Markdown → HTML，供面板预览文档。
 *
 * 三个必须做的事：
 * 1. frontmatter 不显示——它是元数据，不是正文
 * 2. 原始 HTML 一律丢掉——文档来自仓库，但 v-html 是注入点，不能赌
 * 3. 链接协议白名单——javascript: 之类必须拦掉
 *
 * 输出是纯函数结果，不碰 DOM，方便直接测。
 */
import { Marked } from "marked";

/** 拆出 `---` frontmatter 与正文。 */
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: text.slice(m[0].length), hasFrontmatter: true };
}

const SAFE_PROTOCOL = /^(https?:|mailto:|#|\/|\.{1,2}\/)/i;

/** 只放行安全的链接协议；相对路径也算安全。 */
export function safeHref(href) {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (SAFE_PROTOCOL.test(trimmed)) return trimmed;
  // 没有协议的裸相对路径（如 docs/adr/0001.md）
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return null;
}

function createMarked() {
  const md = new Marked({ gfm: true, breaks: false });

  md.use({
    renderer: {
      /** 原始 HTML 一律丢弃。文档里没有必须靠 HTML 才能表达的内容。 */
      html() {
        return "";
      },
      link({ href, title, tokens }) {
        const safe = safeHref(href);
        const text = this.parser.parseInline(tokens);
        if (safe === null) return text;
        const isExternal = /^https?:/i.test(safe);
        const attrs = [
          `href="${escAttr(safe)}"`,
          title ? `title="${escAttr(title)}"` : "",
          isExternal ? 'target="_blank" rel="noopener noreferrer"' : "",
        ].filter(Boolean).join(" ");
        return `<a ${attrs}>${text}</a>`;
      },
      /** 图片同样只放行安全地址；alt 作为可读文本保留。 */
      image({ href, title, text }) {
        const safe = safeHref(href);
        if (safe === null) return escAttr(text || "");
        const attrs = [
          `src="${escAttr(safe)}"`,
          `alt="${escAttr(text || "")}"`,
          title ? `title="${escAttr(title)}"` : "",
          'loading="lazy"',
        ].join(" ");
        return `<img ${attrs} />`;
      },
      /** 给标题加 id，便于页内跳转与大纲定位。 */
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slug(text);
        return `<h${depth} id="${escAttr(id)}">${text}</h${depth}>`;
      },
      /** 代码块包一层，方便加横向滚动与复制。 */
      code({ text, lang }) {
        const cls = lang ? ` class="lang-${escAttr(lang)}"` : "";
        return `<pre class="md-pre"><code${cls}>${escHtml(text)}</code></pre>`;
      },
    },
  });

  return md;
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 从渲染后的 HTML 里剥标签，用来生成 slug。 */
function slug(html) {
  const text = html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "");
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "section";
}

const MD = createMarked();

/**
 * 渲染 Markdown。
 * @returns {{ html: string, frontmatter: Record<string,string>, headings: {depth:number,text:string,id:string}[] }}
 */
export function markdownToHtml(text) {
  const { data, body } = splitFrontmatter(text);
  const html = MD.parse(body);

  const headings = [];
  const re = /<h([1-6]) id="([^"]*)">([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({
      depth: Number(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, ""),
    });
  }

  return { html, frontmatter: data, headings };
}
