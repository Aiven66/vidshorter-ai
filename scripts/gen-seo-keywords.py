# -*- coding: utf-8 -*-
"""Clipop AI 全功能 SEO 关键词库生成器（参考附件格式，覆盖当前全部功能）。"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = "/Users/aiven/Desktop/AI/codex/projects/Clipop_AI_SEO关键词库_全功能刷新.xlsx"

# (关键词, 关键词类型, 优先级, 搜索意图, 预估月搜索量US, 竞争度, CPC(USD), 落地页, 备注)
KW = [
    # ---------- 品牌词 ----------
    ("clipop ai", "品牌词", "P0", "导航型", "1,000-2,000", "低", "0.5", "首页", "核心品牌词，必须占据首位，确保品牌词无歧义"),
    ("clipopai", "品牌词", "P0", "导航型", "500-1,000", "低", "0.3", "首页", "品牌连写变体，配置301或canonical"),
    ("clipop", "品牌词", "P0", "导航型", "400-800", "低", "0.3", "首页", "短品牌词，同步覆盖域名.com域名语义，避免歧义与竞品混淆"),
    ("clipop ai review", "品牌词", "P0", "商业型", "200-500", "低", "1.2", "评价页/博客", "高转化意图，布局评测与用户证言"),
    ("clipop ai pricing", "品牌词", "P0", "交易型", "100-300", "低", "0.8", "定价页", "付费决策关键页，清晰展示免费60积分与Starter/Pro套餐"),
    ("clipop ai free", "品牌词", "P0", "交易型", "100-300", "低", "0.6", "注册页/首页", "免费获客入口，突出60 credits免费赠送"),
    ("clipop ai login", "品牌词", "P0", "导航型", "100-200", "低", "0.2", "登录页", "用户回流入口，登录页可索引但不泄露信息"),
    ("clipop ai alternative", "品牌词", "P1", "商业型", "100-200", "低", "1.5", "竞品对比页", "截流竞品用户，突出Bilibili支持、AI工具箱与免费额度差异"),
    ("clipop ai vs opus clip", "品牌词", "P1", "商业型", "50-100", "低", "2.0", "竞品对比页", "高价值对比词，Opus Clip为行业头部，突出B站/AI工具箱差异化"),
    ("clipop ai vs vidyo", "品牌词", "P1", "商业型", "30-80", "低", "1.8", "竞品对比页", "对比Vidyo，突出数字人/播客剪辑/背景消除等独有功能"),
    ("clipop ai app", "品牌词", "P1", "导航型", "50-100", "低", "0.5", "首页/产品页", "Upload入口，明确为Web端+macOS桌面端无需下载"),
    ("clipop ai credits", "品牌词", "P1", "信息型", "50-100", "低", "0.4", "定价页/FAQ", "积分机制页，解释每天60积分与工具扣费规则"),
    ("clipop ai tutorial", "品牌词", "P1", "信息型", "50-100", "低", "0.6", "博客/帮助中心", "How-to教程，覆盖视频剪辑到AI工具箱的使用"),
    ("clipop ai features", "品牌词", "P1", "信息型", "50-100", "低", "0.5", "功能页", "全功能清单页，结构化列出亮点检测/AI工具箱/数字人"),
    ("clipop ai promo code", "品牌词", "P1", "交易型", "50-100", "低", "0.8", "注册页/优惠页", "优惠券入口页"),
    ("clipop ai discount", "品牌词", "P1", "交易型", "50-100", "低", "0.7", "定价页", "折扣相关落地，强化付费转化"),
    ("is clipop ai free", "品牌词", "P2", "信息型", "30-80", "低", "0.4", "FAQ/定价页", "消除免费额度与去水印付费的认知误区"),
    ("clipop ai watermark", "品牌词", "P2", "信息型", "20-50", "低", "0.3", "FAQ", "免费720p带水印，付费无水印高清，明确差异化"),
    ("clipop ai bilibili", "品牌词", "P2", "导航型", "20-50", "低", "0.3", "首页/专题页", "B站支持为核心差异化，抢占中文创作者"),
    ("clipop api", "品牌词", "P2", "商业型", "20-50", "低", "1.0", "API文档页", "开放API接口词（Pro），吸引开发者"),
    # ---------- 业务词：长视频转短视频核心 ----------
    ("ai video clipping tool", "业务词", "P0", "商业型", "4,000-8,000", "中", "1.2", "首页/产品页", "核心大词，首页+产品页双布局"),
    ("ai video clipper", "业务词", "P0", "商业型", "3,000-5,000", "中", "1.1", "首页/产品页", "高流量核心词"),
    ("long video to shorts ai", "业务词", "P0", "商业型", "8,000-12,000", "中", "1.5", "首页/专题页", "高意图转化词，重点布局专题Landing"),
    ("ai highlight generator", "业务词", "P0", "商业型", "2,000-4,000", "中", "1.3", "功能页/首页", "自动高光检测卖点词"),
    ("auto video clipping software", "业务词", "P0", "商业型", "1,500-3,000", "中", "1.2", "产品页", "自动化剪辑软件词"),
    ("ai short form video generator", "业务词", "P0", "商业型", "5,000-9,000", "中", "1.4", "首页/产品页", "泛功能大词"),
    ("best ai video clipping tool", "业务词", "P0", "商业型", "1,000-2,000", "中", "1.6", "对比页/博客", "评测型长尾词，获客+转化"),
    ("ai video repurposing tool", "业务词", "P0", "商业型", "1,500-3,000", "中", "1.3", "首页/专题页", "内容再利用概念词"),
    ("ai video highlight detector", "业务词", "P1", "商业型", "500-1,000", "中", "1.2", "功能页", "高光检测精确词"),
    ("automatic video clipping", "业务词", "P1", "商业型", "1,000-2,000", "中", "1.1", "产品页", "自动化语义词"),
    ("ai clip generator", "业务词", "P1", "商业型", "2,000-4,000", "中", "1.2", "功能页/首页", "口语化高频词"),
    ("ai shorts maker", "业务词", "P1", "商业型", "2,500-5,000", "中", "1.3", "产品页", "Shorts生成词"),
    ("ai video cutter", "业务词", "P1", "商业型", "1,000-2,000", "中", "0.9", "产品页", "精确工具词"),
    ("long form to short form video ai", "业务词", "P1", "商业型", "1,500-2,500", "中", "1.4", "专题页", "长转短原理词，FAQ/博客配合"),
    ("ai viral clip generator", "业务词", "P1", "商业型", "500-1,000", "中", "1.5", "功能页", "爆款检测卖点词"),
    ("ai video editing automation", "业务词", "P1", "商业型", "600-1,200", "中", "1.2", "产品页/博客", "自动化编辑概念词"),
    ("auto highlight video editor", "业务词", "P1", "商业型", "400-800", "中", "1.2", "功能页", "自动高光编辑词"),
    ("ai content repurposing", "业务词", "P1", "商业型", "800-1,600", "中", "1.3", "专题页/博客", "多渠道再利用"),
    ("smart video clipping", "业务词", "P2", "信息型", "200-500", "低", "0.7", "博客/功能页", "科普型内容词"),
    ("turn video into shorts online", "业务词", "P2", "交易型", "600-1,200", "低", "0.9", "注册页/免费页", "免费起步转化词"),
    ("youtube to shorts converter ai", "业务词", "P1", "商业型", "3,000-6,000", "中", "1.4", "专题页", "YouTube核心转化词"),
    ("bilibili to shorts", "业务词", "P0", "商业型", "1,000-2,000", "中", "0.8", "首页/专题页", "核心差异化：支持B站，覆盖中文创作者"),
    ("ai video summarizer", "业务词", "P1", "商业型", "2,000-4,000", "中", "1.0", "功能页/视频笔记页", "视频摘要共鸣词，衔接视频笔记"),
    # ---------- 场景词：AI工具箱 ----------
    ("ai background remover", "场景词", "P0", "商业型", "2,000-4,000", "中", "1.2", "AI工具箱/背景消除页", "人像/商品抠图，对标remove.bg（新功能）"),
    ("remove background from image free", "场景词", "P0", "交易型", "3,000-5,000", "中", "1.0", "AI工具-背景消除页", "免费入口转化词"),
    ("remove bg from photo online", "场景词", "P1", "商业型", "1,500-3,000", "中", "0.9", "AI工具-背景消除页", "在线免安装"),
    ("product photo background remover", "场景词", "P1", "商业型", "800-1,600", "中", "1.1", "AI工具-背景消除页", "电商商品图场景（OPPC）"),
    ("portrait background removal ai", "场景词", "P1", "商业型", "600-1,200", "中", "1.0", "AI工具-背景消除页", "人像抠图"),
    ("ai image upscaler", "场景词", "P0", "商业型", "2,000-4,000", "中", "1.3", "AI工具-图片放大页", "Swin2SR超分卖点"),
    ("upscale image ai free", "场景词", "P1", "交易型", "3,000-6,000", "中", "1.0", "AI工具-图片放大页", "高清放大免费词"),
    ("enhance image resolution ai", "场景词", "P1", "商业型", "1,200-2,500", "中", "1.1", "AI工具-图片放大页", "分辨率增强语义词"),
    ("colorize black and white photos ai", "场景词", "P0", "商业型", "1,500-3,000", "中", "1.0", "AI工具-上色页", "老照片上色"),
    ("ai photo colorizer", "场景词", "P1", "商业型", "800-1,600", "中", "1.0", "AI工具-上色页", "照片自动上色词"),
    ("restore old photos ai", "场景词", "P1", "商业型", "600-1,200", "中", "1.2", "AI工具-上色页/博客", "老照片修复延伸"),
    ("remove watermark from video ai", "场景词", "P0", "商业型", "1,200-2,500", "中", "1.2", "AI工具-视频去水印页", "视频去水印（含付费去水印）"),
    ("ai video watermark remover free", "场景词", "P1", "交易型", "800-1,600", "中", "1.1", "AI工具-视频去水印页", "免费去水印入口"),
    ("ai photo watermark remover", "场景词", "P1", "商业型", "800-1,600", "中", "1.0", "AI工具-图片去水印页", "图片去水印LaMa模型"),
    ("remove logo from photo ai", "场景词", "P1", "商业型", "600-1,200", "中", "1.0", "AI工具-图片去水印页", "去Logo用例布"),
    ("ai video editor with chat", "场景词", "P1", "商业型", "500-1,000", "中", "1.2", "AI工具-对话剪辑页", "Chat式剪辑新交互"),
    ("chat based video editor", "场景词", "P2", "商业型", "300-600", "低", "1.0", "AI工具-对话剪辑页/博客", "语义化剪辑概念词"),
    # ---------- 场景词：数字人 ----------
    ("ai digital human video generator", "场景词", "P0", "商业型", "1,000-2,000", "中", "1.4", "数字人产品页", "AI数字人视频卖点"),
    ("ai virtual spokesperson", "场景词", "P1", "商业型", "600-1,200", "中", "1.3", "数字人产品页", "品牌代言人场景"),
    ("ai talking avatar video", "场景词", "P1", "商业型", "2,000-4,000", "中", "1.4", "数字人产品页", "口播数字人（对标HeyGen）"),
    ("digital human live commerce", "场景词", "P1", "商业型", "500-1,000", "中", "1.3", "数字人直播页", "AI直播带货（对标topview.ai）"),
    ("ai livestream selling 数字人直播", "场景词", "P1", "商业型", "400-900", "中", "1.2", "数字人直播页", "中英组合词，覆盖直播带货专业人群"),
    ("create ai presenter video", "场景词", "P1", "商业型", "400-900", "低", "1.2", "数字人产品页", "AI主播视频生成词"),
    ("digital human for ecommerce", "场景词", "P2", "商业型", "300-600", "低", "1.2", "数字人直播页/博客", "电商数字人细分"),
    ("ai avatar product video", "场景词", "P2", "商业型", "200-500", "低", "1.0", "数字人产品页/博客", "手持产品介绍视频场景"),
    # ---------- 场景词：播客/营销/新闻/文章转视频 ----------
    ("podcast to shorts ai", "场景词", "P0", "商业型", "1,500-3,000", "中", "1.3", "播客产品页", "播客剪辑高增长词"),
    ("ai podcast clipping tool", "场景词", "P1", "商业型", "600-1,200", "中", "1.2", "播客产品页", "播客剪辑工具词"),
    ("video podcast to clips", "场景词", "P1", "商业型", "400-900", "中", "1.1", "播客产品页/博客", "视频播客转精彩片段"),
    ("convert podcast to short video", "场景词", "P1", "交易型", "400-900", "低", "1.0", "播客产品页", "转化词"),
    ("podcast highlight reel ai", "场景词", "P2", "信息型", "300-600", "低", "1.0", "播客产品页/博客", "播客高光集锦"),
    ("ai marketing video generator", "场景词", "P0", "商业型", "1,000-2,000", "中", "1.3", "营销视频页", "营销视频卖点词"),
    ("ai product promo video maker", "场景词", "P1", "商业型", "600-1,200", "中", "1.2", "营销视频页", "产品宣传片"),
    ("automated news video shorts", "场景词", "P1", "商业型", "400-800", "中", "1.2", "新闻视频页", "新闻短视频自动化"),
    ("ai news video generator", "场景词", "P1", "商业型", "500-1,000", "中", "1.2", "新闻视频页", "新闻视频生成"),
    ("blog post to video ai", "场景词", "P0", "商业型", "1,000-2,000", "中", "1.3", "文章转视频页", "文章转视频卖点"),
    ("article to video converter", "场景词", "P1", "商业型", "600-1,200", "中", "1.2", "文章转视频页", "长文转视频"),
    ("turn article into video", "场景词", "P2", "信息型", "400-800", "低", "1.1", "文章转视频页/博客", "图文转视频教程词"),
    # ---------- 场景词：视频笔记/桌面端 ----------
    ("ai video notes generator", "场景词", "P1", "商业型", "400-800", "低", "1.1", "视频笔记页", "视频笔记卖点"),
    ("convert video to notes", "场景词", "P2", "信息型", "300-600", "低", "0.9", "视频笔记页/博客", "视频转笔记"),
    ("ai meeting video summary", "场景词", "P1", "商业型", "500-1,000", "中", "1.1", "视频笔记页", "会议视频摘要"),
    ("clipop desktop app", "品牌词", "P2", "导航型", "100-300", "低", "0.5", "下载页", "macOS桌面客户端卖点"),
    ("clipop mac app", "品牌词", "P2", "导航型", "100-300", "低", "0.5", "下载页", "桌面端稳定处理"),
    ("video clipping desktop software", "业务词", "P2", "商业型", "200-500", "低", "0.9", "下载页/产品页", "桌面剪辑软件词"),
    # ---------- 中文词：B站/本地化 ----------
    ("bilibili 视频转短视频", "场景词", "P0", "信息型", "800-1,500", "低", "0.5", "首页/专题页", "核心差异化中文词，覆盖B站创作者"),
    ("b站 视频剪辑 AI 工具", "场景词", "P0", "商业型", "1,000-2,000", "中", "1.1", "首页/专题页", "中文商业转换词"),
    ("youtube 视频 转 短视频", "场景词", "P1", "商业型", "800-1,500", "中", "1.0", "专题页", "中文YouTube转短剧词"),
    ("ai 数字人直播", "场景词", "P1", "商业型", "2,000-4,000", "中", "1.5", "数字人直播页", "中文直播带货核心词"),
    ("ai 视频去水印 工具", "场景词", "P1", "交易型", "1,000-2,000", "中", "1.0", "AI工具-去水印页", "中文去水印转换词"),
    ("ai 图片背景消除 工具", "场景词", "P1", "商业型", "800-1,600", "中", "0.9", "AI工具-背景消除页", "中文抠图词（对标remove.bg）"),
    ("ai 老照片上色", "场景词", "P1", "商业型", "500-1,000", "中", "0.8", "AI工具-上色页", "中文老照片上色"),
    ("ai 视频亮点剪辑", "场景词", "P1", "商业型", "600-1,200", "中", "1.0", "首页/功能页", "中文高光检测词"),
]

# ---------- 组装 ----------
def strip_col(c):  # 去掉备注里误输入的换行符等
    return c.replace("\n", " ").strip()

wb = openpyxl.Workbook()

# ===== Sheet 1: 关键词总库 =====
ws = wb.active
ws.title = "SEO关键词总库"
headers = ["序号", "关键词", "关键词类型", "优先级", "搜索意图", "预估月搜索量(US)", "竞争度", "CPC估算(USD)", "对应落地页建议", "SEO策略备注"]
ws.append(headers)
for i, (kw, typ, prio, intent, vol, comp, cpc, page, note) in enumerate(KW, start=1):
    ws.append([i, strip_col(kw), typ, prio, intent, vol, comp, cpc, page, strip_col(note)])

# ===== Sheet 2: 统计 =====
ws2 = wb.create_sheet("优先级分布统计")
ws2.append(["维度", "分类", "关键词数量", "占比"])
total = len(KW)
def group_stats(key_idx, labels):
    from collections import Counter
    c = Counter(row[key_idx] for row in KW)
    rows = []
    for lab in labels:
        n = c.get(lab, 0)
        rows.append([lab, n, round(n / total * 100, 1)])
    return rows
for lab, n, pct in group_stats(2, ["P0", "P1", "P2"]):
    ws2.append(["优先级", lab, n, f"{pct}%"])
for lab, n, pct in group_stats(1, ["品牌词", "业务词", "场景词"]):
    ws2.append(["关键词类型", lab, n, f"{pct}%"])
for lab, n, pct in group_stats(3, ["导航型", "信息型", "商业型", "交易型"]):
    ws2.append(["搜索意图", lab, n, f"{pct}%"])

# ===== Sheet 3: 执行策略 =====
ws3 = wb.create_sheet("SEO执行策略建议")
ws3.append(["阶段", "时间周期", "核心动作", "目标关键词类型", "预期效果"])
plan = [
    ("第一阶段\n基础建设", "第1-2个月",
     "1. 全站技术SEO审计（速度/移动端/结构化数据/Core Web Vitals）\n"
     "2. 首页 Title/H1/Meta 植入 P0 品牌词+业务词（长视频转短视频核心词）\n"
     "3. 建立 XML Sitemap、Robots.txt，提交 Google Search Console / Bing Webmaster\n"
     "4. 产品功能页（视频剪辑、AI工具箱、数字人）逐个独立 URL 做 On-page 优化\n"
     "5. 为 AI工具箱 6 个工具（背景消除/放大/上色/去水印/对话剪辑）建独立Landing",
     "品牌词P0 + 业务词P0", "品牌词占首位，核心功能页收录，基础排名进入前30"),
    ("第二阶段\n内容矩阵", "第3-4个月",
     "1. 搭建博客/资源中心，每周2-3篇长尾内容（How-to/教程）\n"
     "2. 建场景专题页：YouTube转Shorts、Bilibili转短视频、播客剪辑、文章转视频、数字人直播\n"
     "3. AI工具箱各工具独立专题（对标remove.bg的图片背景消除、超分、上色、去水印）\n"
     "4. 制作竞品对比页（vs Opus Clip / Vidyo / Heimdall、vs remove.bg）\n"
     "5. 布局FAQ Schema / How-to Schema，覆盖信息型长尾词",
     "场景词P0-P1 + 业务词P1 + 信息词P2", "长尾词进前10，场景专题页稳定流量，博客月流量突破500UV"),
    ("第三阶段\n权威建设", "第5-8个月",
     "1. 外链建设：AI工具目录站、客座博客、播客采访、YouTube创作者合作\n"
     "2. 数据型内容获取自然外链（如 '2026短视频与AI数字人趋势报告'）\n"
     "3. 优化内链结构，提升核心页面权重\n"
     "4. 布局多语言页面（英文为主、增加日/西/中文本地化）\n"
     "5. 监控竞品外链策略，针对 high-volume 大词突破",
     "业务词P0 + 场景词P0", "高竞争大词进前20，域名权重提升，自然流量月增30%+"),
    ("第四阶段\n转化优化", "第9-12个月",
     "1. 基于 Search Console 数据优化 CTR（标题/描述 A/B 测试）\n"
     "2. 高排名页增加转化入口（CTA、60积分免费试用、付费去水印/无水印高清）\n"
     "3. 建设 FAQ/产品/聚合 Schema 获取富摘要\n"
     "4. 针对品牌词P1聚合评测与用户证言\n"
     "5. 国际化扩展：CLIPvip多语种页面（西/日/东南亚/B站创作者）",
     "全层级优化 + 品牌词P1", "核心大词进前10，自然注册转化率提升，月有机流量突破5000UV"),
]
for row in plan:
    ws3.append(list(row))

# ===== Sheet 4: 功能扫描摘要 =====
ws4 = wb.create_sheet("产品功能扫描摘要")
ws4.append(["功能模块", "具体功能", "SEO关键词映射", "差异化优势"])
features = [
    ("视频输入", "YouTube链接粘贴", "youtube to shorts converter ai, youtube to shorts free", "支持直接粘贴链接，无需下载"),
    ("视频输入", "Bilibili链接粘贴", "bilibili to shorts, bilibili 视频转短视频", "核心差异化：多数竞品仅支持YouTube，覆盖中文创作者"),
    ("视频输入", "本地上传(MP4/MOV/AVI)", "upload video to shorts ai, video clipping desktop software", "支持私有/未发布视频处理，配macOS桌面端更稳"),
    ("AI核心", "自动高光检测(Auto Highlight)", "ai highlight generator, auto highlight video editor", "检测hooks、话题转换、清晰演示、强烈陈述"),
    ("AI核心", "高能/爆款时刻识别", "ai viral clip generator, ai video moment finder", "多信号分析：情绪、动作、语音"),
    ("AI核心", "自动字幕生成", "ai video caption generator", "社媒就绪字幕，提升观看完成率"),
    ("输出导出", "多平台适配(Shorts/Reels/TikTok/B站)", "youtube to shorts ai, youtube to reels converter", "一次生成多平台格式"),
    ("输出导出", "竖屏9:16自动裁剪", "ai video cropping tool, vertical video generator", "智能主体追踪裁剪"),
    ("输出导出", "按套餐差异化导出(720p水印/1080p/4K无水印)", "clipop ai watermark, ai video watermark remover free", "免费720p带水印，付费解锁高清无水印，清晰付费分层"),
    ("AI工具箱", "图片背景消除(MODNet)", "ai background remover, remove background from image free, product photo background remover", "对标remove.bg，人像/商品抠图，输出透明PNG"),
    ("AI工具箱", "图片去水印(LaMa)", "ai photo watermark remover, remove logo from photo ai", "一键+手动涂抹掩码双模式"),
    ("AI工具箱", "视频去水印", "remove watermark from video ai, ai video watermark remover free", "视频水印/Logo移除"),
    ("AI工具箱", "图片超分辨率放大(Swin2SR)", "ai image upscaler, upscale image ai free", "2x超分增强清晰度"),
    ("AI工具箱", "黑白照片上色", "colorize black and white photos ai, ai photo colorizer", "老照片自动上色，色彩浓度可调"),
    ("AI工具箱", "对话式视频剪辑(Chat Edit)", "ai video editor with chat, chat based video editor", "自然语言指令剪辑视频"),
    ("数字人", "AI数字人视频生成", "ai digital human video generator, ai talking avatar", "对标HeyGen，口播自然"),
    ("数字人", "数字人直播带货", "digital human live commerce, ai livestream selling 数字人直播", "对标topview.ai，手持产品自然讲解"),
    ("播客", "播客转短视频/剪辑", "podcast to shorts ai, ai podcast clipping tool", "自动提取播客高光片段"),
    ("营销/新闻", "营销视频/新闻短视频生成", "ai marketing video generator, ai news video generator", "一键产出营销素材/新闻高光"),
    ("文章转视频", "博客/文章转视频", "blog post to video ai, article to video converter", "图文转短视频"),
    ("视频笔记", "视频摘要与笔记生成", "ai video notes generator, ai video summarizer", "自动提取要点，提升内容回看价值"),
    ("订阅/积分", "Free/Starter/Pro套餐与60积分", "clipop ai pricing, clipop ai free, clipop ai credits", "注册送60积分，免费体验闭环"),
    ("本地化", "中英文多语言界面", "youtube 视频转短视频, ai 数字人直播, ai 视频去水印", "中英双语，覆盖B站/抖音中文创作者"),
    ("桌面端", "macOS桌面客户端(Clipop Agent)", "clipop desktop app, clipop mac app, video clipping desktop software", "本机稳定处理，下载页完善转化链路"),
]
for row in features:
    ws4.append(list(row))

# ---------- 样式 ----------
header_fill = PatternFill("solid", fgColor="1F4E78")
header_font = Font(bold=True, color="FFFFFF", size=11)
thin = Side(style="thin", color="D9D9D9")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
left = Alignment(horizontal="left", vertical="center", wrap_text=True)

def style_sheet(sheet, widths, align_map=None):
    # header
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = border
    for r in sheet.iter_rows(min_row=2):
        for cell in r:
            cell.border = border
            cell.alignment = center
    for idx, w in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(idx)].width = w
    sheet.freeze_panes = "A2"
    # 长文本列左对齐
    for ci in (align_map or []):
        for cell in sheet.iter_rows(min_col=ci, max_col=ci):
            cell[0].alignment = left
    sheet.auto_filter.ref = sheet.dimensions

style_sheet(ws, [6, 34, 10, 9, 10, 16, 9, 14, 24, 46], align_map=[2, 9, 10])
style_sheet(ws2, [12, 14, 14, 10])
style_sheet(ws3, [16, 12, 72, 24, 26], align_map=[3, 4, 5])
style_sheet(ws4, [14, 30, 42, 40], align_map=[2, 3, 4])

wb.save(OUT)
print("SAVED:", OUT, "总关键词数:", len(KW))