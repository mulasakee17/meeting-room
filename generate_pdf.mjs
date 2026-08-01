#!/usr/bin/env node
/**
 * 生成 PDF 交付文档：md → 排版 HTML → Chrome headless → PDF
 * 用法：node generate_pdf.mjs <input.md> [output.pdf]
 * 示例：node generate_pdf.mjs docs/PROFESSOR_GUIDE.md out/PROFESSOR_GUIDE.pdf
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!process.argv[2]) { console.error('用法: node generate_pdf.mjs <input.md> [output.pdf]'); process.exit(1); }
const mdPath = path.resolve(process.argv[2]);
const outPdf = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'out', path.basename(mdPath, '.md') + '.pdf');

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
         font-size: 10pt; line-height: 1.85; color: #1f2937; margin: 0; padding: 26mm 24mm; }
  h1 { font-size: 20pt; color: #1e3a5f; border-bottom: 2.5px solid #2563eb; padding-bottom: 12px; margin: 0 0 24px; }
  h2 { font-size: 14.5pt; color: #1e3a5f; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin: 36px 0 16px; }
  h3 { font-size: 12pt; color: #374151; margin: 26px 0 10px; }
  h4 { font-size: 11pt; color: #4b5563; margin: 20px 0 8px; }
  p { margin: 11px 0; }
  ul, ol { margin: 10px 0; padding-left: 1.8em; }
  li { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 9pt; }
  th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #eff6ff; color: #1e3a5f; font-weight: 600; }
  tr:nth-child(even) td { background: #f9fafb; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
         font-family: Consolas, "Courier New", monospace; font-size: 8.8pt; color: #1e40af; }
  pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px;
        overflow-x: auto; line-height: 1.6; }
  pre code { background: none; padding: 0; color: #334155; font-size: 8.8pt; }
  blockquote { border-left: 4px solid #93c5fd; background: #f8fafc; margin: 18px 0;
               padding: 10px 18px; color: #475569; }
  a { color: #2563eb; text-decoration: none; word-break: break-all; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 30px 0; }
  svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  div[align="center"] { text-align: center; }
  details { margin: 12px 0; }
  summary { cursor: pointer; font-weight: 600; color: #1e3a5f; }
  @page { size: A4; margin: 0; }
`;

// ── 学术论文样式（--academic）：衬线、黑色正文、标题居中、三线表 ──
const ACADEMIC_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", "STSong", "SimSun", "Noto Serif CJK SC", serif;
         font-size: 11pt; line-height: 1.78; color: #000; margin: 0; padding: 25mm 22mm; }
  /* 标题 */
  h1 { text-align: center; font-size: 17pt; font-weight: 700; letter-spacing: 1px;
       margin: 0 0 18px; padding-bottom: 10px; border-bottom: 1px solid #000; }
  h2 { font-size: 13.5pt; font-weight: 700; margin: 24px 0 10px;
       border-bottom: 0.5px solid #aaa; padding-bottom: 4px; }
  /* 主要章节从新页开始（第一个 h2「摘要」除外，紧跟标题页） */
  h2:not(:first-of-type) { page-break-before: always; }
  h3 { font-size: 12pt; font-weight: 700; margin: 18px 0 8px; }
  h4 { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; }
  /* 正文：段首缩进 2 字符（中文论文习惯） */
  p { margin: 0 0 8px; text-align: justify; }
  body > p { text-indent: 2em; }
  table p, li p, blockquote p { text-indent: 0; }
  /* 摘要标签居中 */
  h2:first-of-type { text-align: center; }
  /* 列表 */
  ul, ol { margin: 6px 0 10px; padding-left: 2em; }
  li { margin: 4px 0; }
  /* 三线表（学术规范：粗-细-粗） */
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10pt; }
  th, td { padding: 6px 10px; text-align: left; vertical-align: top; }
  th { border-top: 1.5px solid #000; border-bottom: 0.75px solid #000; font-weight: 700; }
  td { border: none; }
  table tr:last-child td { border-bottom: 1.5px solid #000; }
  table p { margin: 0; }
  /* 代码 */
  code { font-family: "Courier New", Consolas, monospace; font-size: 9.5pt;
         background: #f4f4f4; padding: 1px 4px; border-radius: 2px; }
  pre { font-family: "Courier New", Consolas, monospace; background: #f8f8f8;
        border: 0.5px solid #ddd; padding: 12px 14px; font-size: 9.5pt; line-height: 1.5; }
  pre code { background: none; padding: 0; }
  /* 引用块 */
  blockquote { border-left: 3px solid #000; margin: 14px 0; padding: 6px 16px; color: #222; }
  /* 链接：点线下划线（学术优雅） */
  a { color: #000; text-decoration: none; border-bottom: 0.5px dotted #666; word-break: break-all; }
  hr { border: none; border-top: 0.5px solid #999; margin: 22px 0; }
  svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  details { margin: 8px 0; }
  summary { font-weight: 700; cursor: pointer; }
  @page { size: A4; margin: 0; }
`;

// markdown-it 渲染（动态导入，兼容 --no-save 安装）
const { default: MarkdownIt } = await import('markdown-it');
const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

// 将 md 内相对链接的 .md 后缀映射到 .pdf（交付场景友好）
md.core.ruler.push('mdlinks', (state) => {
  for (const token of state.tokens) {
    if (token.type === 'inline') {
      for (const child of token.children || []) {
        if (child.type === 'link_open' && child.attrs) {
          child.attrs = child.attrs.map(([k, v]) => {
            if (k === 'href' && /\.md(?:#|$)/.test(v) && !/^https?:/.test(v) && !/^file:/.test(v)) {
              return [k, v.replace(/\.md(?=#|$)/, '.pdf')];
            }
            return [k, v];
          });
        }
      }
    }
  }
});

const useAcademic = process.argv.includes('--academic');
const STYLE = useAcademic ? ACADEMIC_CSS : CSS;

function render(mdPath) {
  const content = fs.readFileSync(mdPath, 'utf8');
  const body = md.render(content);
  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
    <title>${path.basename(mdPath, '.md')}</title><style>${STYLE}</style></head>
    <body>${body}</body></html>`;
}

// 输出
const tmpDir = path.join(root, '.pdf_tmp');
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(path.dirname(outPdf), { recursive: true });
const tmpHtml = path.join(tmpDir, path.basename(mdPath, '.md') + '.html');
fs.writeFileSync(tmpHtml, render(mdPath));
console.log('HTML 生成:', tmpHtml);

const fileUrl = 'file:///' + encodeURI(tmpHtml.replace(/\\/g, '/'));
execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${outPdf}`, fileUrl,
], { stdio: 'pipe' });
console.log('PDF 已生成:', outPdf);
