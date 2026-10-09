#!/usr/bin/env python3
"""Align every locale JSON to the i18n keys actually used by the app.

- Keys already present are kept.
- A locale key that differs only by GTK mnemonic '_' prefix, trailing newline,
  dotted prefix, or case is renamed to the code key (translation preserved).
- Genuinely missing keys are filled from the corresponding Rnote .po file;
  English falls back to the key, other languages fall back to the English value.
"""
import re, os, glob, json, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PO_DIR = os.path.join(ROOT, '..', 'rnote-src', 'crates', 'rnote-ui', 'po')
LOC_DIR = os.path.join(ROOT, 'src', 'i18n', 'locales')
DRY = '--apply' not in sys.argv

LOCALE_TO_PO = {
  'nb-NO': 'nb_NO', 'pt-BR': 'pt_BR',
  'zh-CN': 'zh_CN', 'zh-Hans': 'zh_Hans', 'zh-Hant': 'zh_Hant',
  'zh-HK': 'zh_HK', 'zh-SG': 'zh_SG', 'zh-TW': 'zh_TW',
}
def po_name(loc):
  base = LOCALE_TO_PO.get(loc, loc)
  return os.path.join(PO_DIR, base + '.po')

# ---- extract code keys ----
keys = set()
pat = re.compile(r"[^a-zA-Z]\bt\(\s*[`'\"]([^`'\"]+)[`'\"]")
# Option arrays use `label: 'X'` and later render t(option.label).
label_pat = re.compile(r"\blabel:\s*[`'\"]([^`'\"]+)[`'\"]")
# Entries built via the msgctx helper, e.g. msgctx.cursorType('Dot (Medium)')
# -> key 'cursorType.Dot (Medium)' (carries a gettext msgctxt upstream).
ctx_pat = re.compile(r"\bmsgctx\.(\w+)\(\s*[`'\"]([^`'\"]+)[`'\"]")
for f in glob.glob(os.path.join(ROOT, 'src/**/*.vue'), recursive=True) + \
         glob.glob(os.path.join(ROOT, 'src/**/*.ts'), recursive=True):
  src_text = open(f, encoding='utf-8').read()
  for m in pat.findall(src_text):
    keys.add(m)
  for m in label_pat.findall(src_text):
    keys.add(m)
  for cfn, cnm in ctx_pat.findall(src_text):
    keys.add(f"{cfn}.{cnm}")
# Tuple option arrays ['value', 'Label'] and computed-key maps [Enum.X]: 'Label'.
tuple_pat = re.compile(r"\[\s*['\"][\w.-]+['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\]")
map_pat = re.compile(r"\]\s*:\s*['\"]([^'\"]+)['\"]")
# Shortcut rows: ['Label', 'Ctrl+K' | 'Space / ...' | 'F1'] (label is first).
sc_pat = re.compile(r"\[\s*['\"](.+?)['\"]\s*,\s*['\"][^'\"]*(?:Ctrl|Alt|Shift|Space|Mouse|Drag|F\d)[^'\"]*['\"]\s*\]")
# Group titles written as `title: 'X'`.
title_pat = re.compile(r"\btitle:\s*['\"]([^'\"]+)['\"]")
# Grouped icon picker groups use `name: 'X'`.
name_pat = re.compile(r"\bname:\s*['\"]([^'\"]{2,})['\"]")
for f in glob.glob(os.path.join(ROOT, 'src/**/*.vue'), recursive=True) + \
         glob.glob(os.path.join(ROOT, 'src/**/*.ts'), recursive=True):
  stext = open(f, encoding='utf-8').read()
  for m in tuple_pat.findall(stext):
    keys.add(m)
  for m in map_pat.findall(stext):
    keys.add(m)
  for m in sc_pat.findall(stext):
    keys.add(m)
  for m in title_pat.findall(stext):
    keys.add(m)
  for m in name_pat.findall(stext):
    keys.add(m)
code_keys = sorted(keys)

# ---- minimal .po parser ----
def parse_po(path):
  entries = {}
  if not os.path.exists(path): return entries
  def unq(token):
    token = token.strip()
    m = re.match(r'^"(.*)"$', token)
    return m.group(1) if m else ''
  ctxt = None; mids = []; strs = []; mode = None; mid = None
  def commit():
    if mid is not None:
      entries[(ctxt, mid)] = ''.join(strs).replace('\\n', '\n')
  for raw in open(path, encoding='utf-8'):
    ln = raw.rstrip('\n')
    if ln.startswith('msgctxt'):
      commit(); ctxt = unq(ln[7:]); mids = []; strs = []; mid = None; mode = 'ctxt'
    elif ln.startswith('msgid_plural'):
      mid = ''.join(mids).replace('\\n', '\n'); mids = [unq(ln[12:])]; mode = 'idp'
    elif ln.startswith('msgid'):
      commit(); mids = [unq(ln[5:])]; strs = []; mid = None; mode = 'id'
    elif ln.startswith('msgstr['):
      mid = ''.join(mids).replace('\\n', '\n')
      strs = [unq(ln.split(']', 1)[1])]; mode = 'str'
    elif ln.startswith('msgstr'):
      mid = ''.join(mids).replace('\\n', '\n')
      rest = ln[6:].strip(); strs = [unq(rest)] if rest.startswith('"') else []; mode = 'str'
    elif ln.startswith('"'):
      if mode in ('id', 'idp'): mids.append(unq(ln))
      elif mode == 'str': strs.append(unq(ln))
      elif mode == 'ctxt': ctxt = (ctxt or '') + unq(ln)
    elif ln.strip() == '':
      commit(); ctxt = None; mid = None; mids = []; strs = []; mode = None
  commit()
  return entries

def base(s):
  return re.sub(r'\s+', ' ', s.replace('\\n', '\n')).strip()
def demnem(s):
  return s.replace('_', '')
def normcmp(s):
  # Compare natural-language labels ignoring GTK mnemonics ('_'), newlines,
  # whitespace, case and dotted-picker prefixes.
  b = base(s)
  if '.' in b and b.split('.', 1)[0] in ('dotDistribution',):
    b = b.split('.', 1)[1]
  return re.sub(r'\s+', ' ', demnem(b)).strip().lower()
def key_match(code, loc):
  return normcmp(code) == normcmp(loc)

# build po lookups by normalized msgid (first non-empty translation wins).
# `clut` additionally keys entries by (msgctxt, msgid) for context-qualified keys.
def po_collapsed(entries):
  lut, clut = {}, {}
  for (ctxt, mid), val in entries.items():
    if val and val.strip():
      lut.setdefault(normcmp(mid), val)
      if ctxt:
        clut.setdefault((normcmp(ctxt), normcmp(mid)), val)
  return lut, clut

# Code msgctx helper name -> upstream gettext msgctxt string.
MSCTX_MAP = {
  'cursorType': 'a cursor type',
  'dotDistribution': 'A variant of the textured pen texture distribution',
  'colorPart': 'part of string representation of a color',
}

# Code keys whose wording differs from the po msgid -> exact po msgid.
ALIAS = {
  'Add Page': 'Add Page (When in Fixed-Size Layout)',
  'Align end': 'Align Right',
  'Align start': 'Align Left',
  'Block Pinch to Zoom': 'Block Pinch to _Zoom',
  'Dashed narrow': 'Dashed (narrow)',
  'Dashed equidistant': 'Dashed (equidistant)',
  'Dashed wide': 'Dashed (wide)',
  'Deselect all': 'Deselect All Strokes',
  'Document Settings': 'Adjust document settings',
  'Golden Ratio': 'Golden Ratio (1:1.618)',
  'Zoom': 'Zoom In/Out',
  'Invert background and pattern colors': 'Invert the brightness of the background and pattern colors',
  'Invert selected colors': 'Invert Color Brightness of All Selected Strokes',
  'Lock aspect ratio': 'Lock Aspect Ratio While Resizing the Selection',
  'Select all': 'Select All Strokes',
  'Select All': 'Select All Strokes',
  'Draw With Touch Input': 'Draw With _Touch Input',
  'Set whether format borders are shown': 'Set whether the format borders are shown',
  'Set whether touch scrolling is inertial': 'Inertial Touch Scrolling',
  'Defaults to 96.': 'Set the Dpi (dots per inch). Defaults to 96.',
  'Save As': 'Save _As',
  'About Rnote': 'A_bout Rnote',
  'Pages': 'Pages Type',
  'Cube root': 'Cubic root',
  'Quadratic': 'Quadratic Parabola',
  'Cubic': 'Cubic Parabola',
}

# Web-only strings (no desktop po entry). English equals the key; provide zh;
# other languages fall back to English.
WEB_EXTRA = {
  'Alpha': '透明度',
  'Background': '背景',
  'Color picker': '颜色选择器',
  'Custom color': '自定义颜色',
  'No color': '无颜色',
  'Increase': '增加',
  'Decrease': '减少',
  'Done': '完成',
  'Rounded': '圆角',
  'Recent Documents': '最近的文档',
  'Real size': '实际大小',
  'Resolution (DPI)': '分辨率（DPI）',
  'Export Region': '导出区域',
  'Text Width': '文本宽度',
  'Pin to Workspace': '固定到工作区',
  'Pinned to Workspace': '已固定到工作区',
  'No pinned documents yet. Pin a document to restore it quickly.': '还没有固定的文档。固定文档可快速恢复。',
  'Unsaved changes': '未保存的更改',
  'Settings applied': '设置已应用',
  'Shape Builder Type': '形状构建类型',
  'Strokes': '笔画',
  'Documents': '文档',
  'Current Document': '当前文档',
  'Edit': '编辑',
  'File': '文件',
  'Opened': '已打开',
  'Font Family': '字体',
  'Toggle pen options sidebar': '切换笔选项侧边栏',
  'Toggle workspace sidebar': '切换工作区侧边栏',
  'Limit movement to Vertical Page Borders': '将移动限制在页面垂直边框内',
  'Limit movement to Horizontal Page Borders': '将移动限制在页面水平边框内',
  'Only select elements that are inside or below the page selected, not ones on the left/right': '仅选择所选页面内或下方的元素，不选择左侧/右侧的元素',
  'Only select elements between the current position and the next horizontal border below': '仅选择当前位置与下方下一条水平边框之间的元素',
  'PDF pages use the document page size; fixed layouts export one page each': 'PDF 页面使用文档页面大小；固定布局每页导出一页',
  'Set the application language': '设置应用语言',
  'Version 0.15.0-vue · a Vue 3 rebuild of Rnote 0.15': '版本 0.15.0-vue · Rnote 0.15 的 Vue 3 重构版',
  'Canvas 2D rendering · gzip JSON (.rnote) container · autosave to localStorage': 'Canvas 2D 渲染 · gzip JSON（.rnote）容器 · 自动保存到本地',
  'Changes UI and tool behavior for E-Paper': '为电子墨水屏调整界面与工具行为',
  'Creating a new document will discard any unsaved changes.\nDo you want to save the current document?': '新建文档将丢弃未保存的更改。\n是否保存当前文档？',
  'Hold Ctrl to temporarily invert': '按住 Ctrl 可暂时反转',
  'Select with rectangle': '矩形选择',
  'Select with polygon': '多边形选择',
  'Width of new text boxes': '新文本框的宽度',
  'Remove Page': '删除页面',
  'Selection': '选区',
  'Current Page': '当前页面',
  'All Pages': '所有页面',
  'Entire Document': '整个文档',
  # Undo/redo history action labels and shape tooltips (generated on the web;
  # no desktop po msgid).
  'Add Strokes': '添加笔画',
  'Draw Stroke': '绘制笔画',
  'Erase Strokes': '擦除笔画',
  'Edit Text': '编辑文本',
  'Nudge Selection': '轻推选区',
  'Invert Colors': '反转颜色',
  'Cubic Bezier': '三次贝塞尔曲线',
  'Quadratic Bezier': '二次贝塞尔曲线',
  'Foci Ellipse': '焦点椭圆',
  'Quadrant 2D Coordinate System': '象限二维坐标系',
  'Semi-Infinite (Continuous Vertical)': '半无限（纵向连续）',
  'System Handwriting': '系统手写',
}

en_json = json.load(open(os.path.join(LOC_DIR, 'en.json'), encoding='utf-8'))

report = {}
for loc_file in sorted(glob.glob(os.path.join(LOC_DIR, '*.json'))):
  loc = os.path.basename(loc_file)[:-5]
  data = json.load(open(loc_file, encoding='utf-8'))
  po, po_ctx = po_collapsed(parse_po(po_name(loc)))
  renamed = []; added = []; frompo = 0
  new = {}
  used_src = set()
  for k in code_keys:
    # An existing value is kept unless it is an untranslated English fallback
    # placeholder in a non-English locale (value identical to the key).
    is_placeholder = loc != 'en' and data.get(k) == k and re.search(r'[A-Za-z]', k)
    # Translations carrying a GTK mnemonic hint like "快捷键 [_K]" are stale;
    # re-resolve them from the po (web has no use for [_X] hints).
    stale_mnem = bool(re.search(r'\s?\[_[A-Za-z]\]', data.get(k, '')))
    if k in data and not is_placeholder and not stale_mnem:
      new[k] = data[k]; continue
    # high-confidence rename (a differently-spelled existing key)
    cand = [lk for lk in data if lk != k and key_match(k, lk)]
    if len(cand) == 1:
      new[k] = data[cand[0]]; renamed.append((cand[0], k)); continue
    # msgctxt-qualified keys, e.g. cursorType.Dot (Medium) -> po entry with
    # msgctxt "cursorType" and msgid "Dot (Medium)".
    if '.' in k:
      cpart, npart = k.split('.', 1)
      po_ctxt_name = MSCTX_MAP.get(cpart, cpart)
      cval = po_ctx.get((normcmp(po_ctxt_name), normcmp(npart)))
      if cval:
        new[k] = cval; added.append(k); frompo += 1; continue
    # fill from po: explicit alias first, then normalized direct match
    mid = ALIAS.get(k)
    val = po.get(normcmp(mid)) if mid else None
    if not val:
      val = po.get(normcmp(k))
    if val:
      new[k] = val; added.append(k); frompo += 1; continue
    # web-only strings
    if k in WEB_EXTRA:
      if loc == 'en':
        new[k] = k
      elif loc.startswith('zh'):
        new[k] = WEB_EXTRA[k]
      else:
        new[k] = k
      added.append(k); continue
    # last resort
    new[k] = k if loc == 'en' else en_json.get(k, k)
    added.append(k)
  report[loc] = (len(renamed), len(added), frompo)
  if not DRY:
    # Web adaptation of GTK mnemonics: "[_K]" (used by translators to keep a
    # key shortcut after a non-Latin label) renders as an underlined letter in
    # GTK; the web has no mnemonics, so strip the hint to match the visuals.
    ordered = {k: re.sub(r'\s?\[_[A-Za-z]\]', '', new[k]) for k in sorted(new)}
    with open(loc_file, 'w', encoding='utf-8') as fh:
      json.dump(ordered, fh, ensure_ascii=False, indent=2)
      fh.write('\n')

print(f"{'locale':9} renamed added from_po")
for loc,(r,a,fp) in report.items():
  print(f"{loc:9} {r:7} {a:5} {fp:7}")
print("\nDRY RUN" if DRY else "\nAPPLIED")
