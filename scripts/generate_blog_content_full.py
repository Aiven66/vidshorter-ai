#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成完整的 blog-content.ts 文件
包含 35+ 篇 SEO 文章，每篇有 en/zh/zh-Hant 三种语言
"""

import os

OUTPUT_PATH = "/Users/aiven/Desktop/AI/codex/projects/src/lib/blog-content.ts"


def escape_ts_str(s):
    """转义 TS 字符串"""
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def gen_article_content(keyword, lang='en', extra_keywords=None):
    """
    生成约 3000 字符的 HTML 文章内容
    结构：intro -> h2*4-6 节 -> 实用技巧 -> FAQ -> CTA
    """
    extra_keywords = extra_keywords or []
    all_kw = [keyword] + extra_keywords

    if lang == 'en':
        return gen_article_content_en(keyword, all_kw)
    elif lang == 'zh':
        return gen_article_content_zh(keyword, all_kw)
    else:
        return gen_article_content_zh_hant(keyword, all_kw)


def gen_article_content_en(keyword, all_kw):
    kw = keyword
    content_parts = []

    intro = (
        f"In the fast-changing world of digital content, creating short-form videos "
        f"has become essential for creators, marketers, and businesses alike. "
        f"An {kw} can dramatically cut the time you spend editing while dramatically "
        f"improving the reach and engagement of your content. "
        f"Long-form videos on YouTube, podcasts, webinars, and live streams contain "
        f"hundreds of valuable moments. The problem is finding those moments, trimming "
        f"them into polished clips, and publishing them at scale — all before the trend dies. "
        f"In this guide, we break down exactly how modern {kw} platforms work, what features "
        f"to look for, and how you can turn a single long video into ten or more viral-ready "
        f"shorts in minutes, not hours."
    )
    content_parts.append(f"<p>{intro}</p>")

    sections = [
        ("Why Long-Form Content Is a Goldmine for Short-Form Publishing",
         f"Long videos are an underrated asset. A one-hour podcast interview, a two-hour live stream, "
         f"or a 45-minute webinar contains dozens of quotable, shareable, and emotionally engaging "
         f"moments. With the right {kw}, those moments are found automatically, scored by engagement "
         f"potential, and exported as vertical clips optimized for YouTube Shorts, TikTok, Instagram Reels, "
         f"and more. The payoff is simple: more content with less effort, and a compounding presence "
         f"across every short-form platform."),
        ("How Modern AI Video Clipping Actually Works",
         f"A serious {kw} combines speech recognition, speaker detection, silence removal, and a "
         f"large language model to identify the most interesting sections. Transcripts are scanned "
         f"for emotional language, strong opinions, surprising statistics, and punchy one-liners. "
         f"The best tools then re-frame the footage into a 9:16 aspect ratio, add captions in the "
         f"correct language, apply a branded template, and export a ready-to-publish file in seconds."),
        ("What Features Separate the Best Tools From the Rest",
         f"When evaluating any {kw}, focus on four things. First, accuracy of highlight detection — "
         f"does it pick the most interesting clips, or just the loudest? Second, creative control — "
         f"can you adjust hook length, caption style, aspect ratio, and branding? Third, export "
         f"quality and format support, especially if you publish in multiple languages. Finally, "
         f"workflow integration: does it save you time across publishing, analytics, and team review?"),
        ("A Real Workflow: From One Long Video to Ten Shorts",
         f"Here is a practical workflow you can copy today. Upload or paste the URL of your long video. "
         f"Let the system transcribe, detect speakers, and find the top highlight candidates. Review "
         f"the ranked list and keep the clips that match your brand voice. Customize captions, choose "
         f"an aspect ratio, and apply your brand colors. Export in batch, then schedule across platforms. "
         f"A good {kw} turns this multi-hour task into less than ten minutes of real work."),
        ("Avoiding Common Pitfalls When Clipping Automatically",
         f"Automatic clipping is powerful, but it is not magic. Always review the generated clips for "
         f"context. Make sure captions are accurate in your language. Preserve the original meaning of "
         f"your content — never let an algorithm take your words out of context. Finally, keep branding "
         f"consistent across every export so your audience recognizes your clips instantly."),
        ("Practical Tips to Boost Views, Retention, and Engagement",
         f"Great clips start with great source material, but smart publishing multiplies the effect. "
         f"Use strong hooks in the first three seconds. Match caption style to your audience — bold "
         f"and punchy for entertainment, clean and minimal for professional brands. Publish during "
         f"peak hours on each platform, and always write a custom title and description that matches "
         f"the content of the specific short, not just the source video."),
    ]

    for title, body in sections:
        content_parts.append(f"<h2>{title}</h2>")
        content_parts.append(f"<p>{body}</p>")

    tips_list = [
        "Always keep the first three seconds visually and emotionally engaging.",
        "Use platform-native captions and burned-in subtitles for silent viewers.",
        "Publish 3-5 shorts per long video to maximize organic reach.",
        "Match hook length to the platform — tighter hooks for TikTok, longer hooks for YouTube Shorts.",
        "Test 2-3 title variations per short to learn what resonates.",
        "Track watch time, not just views, as your leading quality metric.",
        "Re-purpose the same highlight across platforms with platform-specific titles and descriptions.",
    ]
    content_parts.append("<h2>Practical Checklist for Every Clip You Publish</h2>")
    content_parts.append("<ul>")
    for t in tips_list:
        content_parts.append(f"<li>{t}</li>")
    content_parts.append("</ul>")

    faqs = [
        ("How accurate is an AI video clipper?",
         "Accuracy depends on transcript quality, speaker clarity, and the underlying model. Modern tools typically surface 70-90% of the best moments in a long video, which you can then curate by hand."),
        ("Can I use my own brand colors and fonts?",
         "Yes. Top-tier platforms let you configure brand colors, logo placement, caption fonts, and reusable templates so every exported clip feels on-brand."),
        ("Do these tools work for non-English languages?",
         "Modern platforms support dozens of languages for transcription, caption generation, and speaker detection. Always verify support for your specific language before committing to a tool."),
        ("How long does it take to process a one-hour video?",
         "Processing time varies, but a well-architected system can analyze a one-hour video and export multiple clips in well under five minutes total."),
        ("Can I export clips for multiple platforms at once?",
         "Yes. The best exporters produce 9:16 vertical videos for Shorts, TikTok, and Reels, and often a 1:1 square variant for feeds — all from the same source highlight."),
    ]
    content_parts.append("<h2>Frequently Asked Questions</h2>")
    for q, a in faqs:
        content_parts.append(f"<p><strong>Q: {q}</strong></p>")
        content_parts.append(f"<p>A: {a}</p>")

    cta = (
        f"If you are ready to stop manually editing and start publishing more shorts in less time, "
        f"try a modern {kw}. Paste your video URL, let the system find your best moments, and export "
        f"polished, branded shorts in minutes. The best creators use automation to multiply their "
        f"output — not to replace their taste."
    )
    content_parts.append(f"<h2>Start Turning Long Videos Into Shorts Today</h2>")
    content_parts.append(f"<p>{cta}</p>")

    full = "".join(content_parts)
    # 确保内容足够长，如果不够则重复附加说明段落
    while len(full) < 2800:
        filler = (
            "<p>Remember that every short video you publish is a small experiment. "
            "Some will perform unexpectedly well, and others will teach you something about "
            "your audience. Use those learnings to improve every subsequent batch, and your "
            "publishing rhythm will improve week after week.</p>"
        )
        full += filler
    return full


def gen_article_content_zh(keyword, all_kw):
    kw = keyword
    content_parts = []

    intro = (
        f"在数字内容飞速变化的今天，制作短视频对创作者、营销人员和企业都至关重要。"
        f"一款好的 {kw} 可以极大缩短编辑时间，同时显著提升内容的传播范围和互动数据。"
        f"YouTube 长视频、播客访谈、线上研讨会和直播中，隐藏着成百上千个有价值的精彩瞬间。"
        f"真正的挑战在于：在热点失效之前，快速找到这些时刻，剪辑成精致的片段，并以规模化的方式发布。"
        f"本指南将详细拆解现代 {kw} 的工作原理、值得关注的核心功能，以及如何在几分钟内"
        f"把一个长视频变成十条以上、随时可以发布的优质短视频。"
    )
    content_parts.append(f"<p>{intro}</p>")

    sections = [
        ("为什么长内容是短视频创作的金矿",
         f"长视频是一种被低估的内容资产。一小时的访谈、两小时的直播或 45 分钟的研讨会，"
         f"包含着数十段可引用、可传播、富有情绪张力的精彩片段。借助专业的 {kw}，"
         f"这些亮点可以被自动识别，按照潜在传播力排序，并自动导出为适配 YouTube Shorts、"
         f"抖音、小红书和视频号等平台的竖版短视频。结果很简单：用更少的时间产出更多内容，"
         f"并在各大短视频平台上形成持续的品牌曝光。"),
        ("现代 AI 自动剪辑到底是如何工作的",
         f"一款真正优秀的 {kw} 会同时使用语音识别、说话人检测、静音去除和大语言模型，"
         f"来识别视频中最有趣的段落。系统会扫描转录文字，寻找情绪化表达、强烈观点、"
         f"出人意料的数据和有力金句。之后，最好的工具会自动把画面重新构图为 9:16 竖屏，"
         f"在画面上加入对应语言的字幕，应用品牌化模板，几秒钟内导出一个可直接发布的成品。"),
        ("哪些功能区分了真正好用的工具",
         f"在评估任何一款 {kw} 时，请重点关注四件事。第一，亮点识别的准确度——它是挑出最精彩的片段，"
         f"还是只是挑出最吵的片段？第二，创作自由度——能否调整钩子长度、字幕风格、画面比例和品牌元素？"
         f"第三，导出质量和格式支持，尤其是如果你在多语种环境下发布。第四，工作流集成度——"
         f"它是否能在发布、数据分析、团队审核等环节真正节省你的时间？"),
        ("真实工作流：从一个长视频到十条短视频",
         f"以下是一条你今天就可以照搬的实战工作流。上传长视频或粘贴视频链接，让系统自动转录、"
         f"识别说话人，并给出顶级亮点候选。查看评分列表，保留最符合品牌风格的片段。自定义字幕、"
         f"选择画面比例、套用品牌色，然后批量导出，再在各平台上安排发布时间。一个靠谱的 {kw}"
         f"可以把原本数小时的工作，压缩到不到十分钟的实际操作。"),
        ("自动化剪辑时最容易踩的坑",
         f"自动剪辑功能强大，但它不是魔法。务必逐段审核生成的片段，确保上下文完整不被扭曲。"
         f"字幕要核对语言准确度。保留原文含义——永远不要让算法把你的话断章取义。"
         f"最后，所有导出片段的品牌元素保持一致，让观众一眼就能认出是你的内容。"),
        ("提升播放量、完播率和互动率的实用建议",
         f"好的片段源于好的素材，但聪明的发布策略能让效果成倍增长。前三秒一定要有强烈的钩子。"
         f"字幕风格要匹配你的观众——娱乐类用醒目有力，专业品牌用简洁克制。"
         f"选择各平台的高峰时段发布，并为每条短视频写一个具体标题和简介，而不是笼统地重复原视频标题。"),
    ]

    for title, body in sections:
        content_parts.append(f"<h2>{title}</h2>")
        content_parts.append(f"<p>{body}</p>")

    tips_list = [
        "前三秒必须在视觉和情绪上抓住观众。",
        "同时使用平台原生字幕和画面内嵌字幕，照顾静音观看的用户。",
        "每条长视频至少制作 3-5 条短视频，放大自然传播效果。",
        "根据平台调整钩子长度——抖音更紧凑，YouTube Shorts 可稍长。",
        "同一短视频测试 2-3 个标题版本，观察哪个更吸引人。",
        "把完播时长而不是播放量作为内容质量的核心指标。",
        "同一高光可以在多平台发布，但标题和简介要平台化。",
    ]
    content_parts.append("<h2>每条短视频发布前的实操清单</h2>")
    content_parts.append("<ul>")
    for t in tips_list:
        content_parts.append(f"<li>{t}</li>")
    content_parts.append("</ul>")

    faqs = [
        ("AI 自动剪辑的准确度有多高？",
         "准确度取决于转录质量、说话人清晰度和底层模型。现代工具通常能在长视频中发现 70%-90% 的最佳片段，剩下的可以人工二次筛选。"),
        ("是否可以使用自己的品牌色和字体？",
         "可以。一流平台都支持配置品牌颜色、Logo 位置、字幕字体和可复用模板，让每条导出的短视频都保持一致的品牌感。"),
        ("这些工具对中文的支持怎么样？",
         "现代平台普遍支持数十种语言的转录、字幕生成和说话人检测。建议在长期使用前，先以中文素材测试具体工具的效果。"),
        ("处理一个一小时的视频大概需要多久？",
         "处理时间因工具而异，但架构优秀的系统可以在五分钟内完成一小时视频的分析，并导出多条短视频。"),
        ("能否同时为多个平台导出片段？",
         "可以。优秀的导出工具会同时生成 9:16 竖版（Shorts、抖音、Reels）和 1:1 方版，全部来自同一高光片段。"),
    ]
    content_parts.append("<h2>常见问题解答</h2>")
    for q, a in faqs:
        content_parts.append(f"<p><strong>问：{q}</strong></p>")
        content_parts.append(f"<p>答：{a}</p>")

    cta = (
        f"如果你已经准备好告别手动剪辑，让更多短视频在更短时间内产出，"
        f"请尝试一款现代的 {kw}。粘贴你的视频链接，让系统自动找出最佳时刻，"
        f"几分钟内导出精致、有品牌感的短视频。真正优秀的创作者使用自动化来放大产出——"
        f"而不是用自动化代替自己的品味。"
    )
    content_parts.append(f"<h2>今天就开始把长视频变成短视频</h2>")
    content_parts.append(f"<p>{cta}</p>")

    full = "".join(content_parts)
    while len(full) < 2800:
        filler = (
            "<p>请记住，你发布的每一条短视频都是一次小实验。"
            "有些会获得意想不到的好成绩，有些则会让你对观众有新的理解。"
            "把这些经验用到下一批内容上，你的发布节奏和质量就会周而复始地提升。</p>"
        )
        full += filler
    return full


def gen_article_content_zh_hant(keyword, all_kw):
    kw = keyword
    content_parts = []

    intro = (
        f"在數位內容飛速變化的今天，製作短影片對創作者、行銷人員和企業都至關重要。"
        f"一款好的 {kw} 可以大幅縮短編輯時間，同時顯著提升內容的傳播範圍與互動數據。"
        f"YouTube 長影片、Podcast 訪談、線上研討會與直播中，隱藏著成千上百個有價值的精彩瞬間。"
        f"真正的挑戰在於：在熱點失效之前，快速找到這些時刻，剪輯成精緻的片段，並以規模化的方式發布。"
        f"本指南將詳細拆解現代 {kw} 的工作原理、值得關注的核心功能，以及如何在幾分鐘內"
        f"把一支長影片變成十支以上、隨時可以發布的優質短影片。"
    )
    content_parts.append(f"<p>{intro}</p>")

    sections = [
        ("為什麼長內容是短影片創作的金礦",
         f"長影片是一種被低估的內容資產。一小時的訪談、兩小時的直播或 45 分鐘的研討會，"
         f"包含著數十段可引述、可傳播、富有情緒張力的精彩片段。借助專業的 {kw}，"
         f"這些亮點可以被自動識別，按照潛在傳播力排序，並自動匯出為適配 YouTube Shorts、"
         f"抖音、小紅書與影片號等平台的直向短影片。結果很簡單：用更少的時間產出更多內容，"
         f"並在各大短影片平台上形成持續的品牌曝光。"),
        ("現代 AI 自動剪輯到底是如何運作的",
         f"一款真正優秀的 {kw} 會同時使用語音辨識、說話人偵測、靜音去除與大型語言模型，"
         f"來識別影片中最有趣的段落。系統會掃描轉錄文字，尋找情緒化表達、強烈觀點、"
         f"出乎意料的數據與有力金句。之後，最好的工具會自動把畫面重新構圖為 9:16 直向，"
         f"在畫面上加入對應語言的字幕，應用品牌化模板，幾秒鐘內匯出一個可直接發布的成品。"),
        ("哪些功能區分了真正好用的工具",
         f"在評估任何一款 {kw} 時，請重點關注四件事。第一，亮點辨識的準確度——它是挑出最精彩的片段，"
         f"還是只是挑出最吵的片段？第二，創作自由度——能否調整開場長度、字幕風格、畫面比例與品牌元素？"
         f"第三，匯出品質與格式支援，尤其是如果你在多語種環境下發布。第四，工作流程整合度——"
         f"它是否能在發布、數據分析、團隊審核等環節真正節省你的時間？"),
        ("真實工作流程：從一支長影片到十支短影片",
         f"以下是一條你今天就可以照搬的實戰工作流程。上傳長影片或貼上影片連結，讓系統自動轉錄、"
         f"辨識說話人，並給出頂級亮點候選。查看評分列表，保留最符合品牌風格的片段。自訂字幕、"
         f"選擇畫面比例、套用品牌色，然後批次匯出，再在各平台上安排發布時間。一個可靠的 {kw}"
         f"可以把原本數小時的工作，壓縮到不到十分鐘的實際操作。"),
        ("自動化剪輯時最容易踩的坑",
         f"自動剪輯功能強大，但它不是魔法。務必逐段審核生成的片段，確保上下文完整不被扭曲。"
         f"字幕要核對語言準確度。保留原文含義——永遠不要讓演算法把你的話斷章取義。"
         f"最後，所有匯出片段的品牌元素保持一致，讓觀眾一眼就能認出是你的內容。"),
        ("提升播放量、完播率與互動率的實用建議",
         f"好的片段源於好的素材，但聰明的發布策略能讓效果成倍增長。前三秒一定要有強烈的開場。"
         f"字幕風格要匹配你的觀眾——娛樂類用醒目有力，專業品牌用簡潔克制。"
         f"選擇各平台的高峰時段發布，並為每條短影片寫一個具體標題與簡介，而不是統地重複原影片標題。"),
    ]

    for title, body in sections:
        content_parts.append(f"<h2>{title}</h2>")
        content_parts.append(f"<p>{body}</p>")

    tips_list = [
        "前三秒必須在視覺和情緒上抓住觀眾。",
        "同時使用平台原生字幕與畫面內嵌字幕，照顧靜音觀看的使用者。",
        "每條長影片至少製作 3-5 條短影片，放大自然傳播效果。",
        "根據平台調整開場長度——抖音更緊湊，YouTube Shorts 可稍長。",
        "同一短影片測試 2-3 個標題版本，觀察哪個更吸引人。",
        "把完播時長而不是播放量作為內容品質的核心指標。",
        "同一亮點可以在多平台發布，但標題與簡介要平台化。",
    ]
    content_parts.append("<h2>每條短影片發布前的實務清單</h2>")
    content_parts.append("<ul>")
    for t in tips_list:
        content_parts.append(f"<li>{t}</li>")
    content_parts.append("</ul>")

    faqs = [
        ("AI 自動剪輯的準確度有多高？",
         "準確度取決於轉錄品質、說話人清晰度與底層模型。現代工具通常能在長影片中發現 70%-90% 的最佳片段，剩下的可以人工二次篩選。"),
        ("是否可以使用自己的品牌色與字型？",
         "可以。一流平台都支援設定品牌顏色、Logo 位置、字幕字型與可重複使用的模板，讓每條匯出的短影片都保持一致的品牌感。"),
        ("這些工具對繁體中文的支援怎麼樣？",
         "現代平台普遍支援數十種語言的轉錄、字幕生成與說話人偵測。建議在長期使用前，先以繁體中文素材測試具體工具的效果。"),
        ("處理一支一小時的影片大概需要多久？",
         "處理時間因工具而異，但架構優秀的系統可以在五分鐘內完成一小時影片的分析，並匯出多條短影片。"),
        ("能否同時為多個平台匯出片段？",
         "可以。優秀的匯出工具會同時生成 9:16 直向（Shorts、抖音、Reels）與 1:1 方版，全部來自同一亮點片段。"),
    ]
    content_parts.append("<h2>常見問題解答</h2>")
    for q, a in faqs:
        content_parts.append(f"<p><strong>問：{q}</strong></p>")
        content_parts.append(f"<p>答：{a}</p>")

    cta = (
        f"如果你已經準備好告別手動剪輯，讓更多短影片在更短時間內產出，"
        f"請嘗試一款現代的 {kw}。貼上你的影片連結，讓系統自動找出最佳時刻，"
        f"幾分鐘內匯出精緻、有品牌感的短影片。真正優秀的創作者使用自動化來放大產出——"
        f"而不是用自動化代替自己的品味。"
    )
    content_parts.append(f"<h2>今天就開始把長影片變成短影片</h2>")
    content_parts.append(f"<p>{cta}</p>")

    full = "".join(content_parts)
    while len(full) < 2800:
        filler = (
            "<p>請記住，你發布的每一條短影片都是一次小實驗。"
            "有些會獲得意想不到的好成績，有些則會讓你對觀眾有新的理解。"
            "把這些經驗用到下一批內容上，你的發布節奏與品質就會週而復始地提升。</p>"
        )
        full += filler
    return full


# ============ 文章定义 ============

# 核心关键词 (10篇)
CORE_ARTICLES = [
    ("ai-video-clipper-guide", "AI Video Clipper", "AI视频剪辑工具", "AI影片剪輯工具"),
    ("ai-video-to-shorts", "AI Video to Shorts", "AI视频转短视频", "AI影片轉短影片"),
    ("youtube-to-shorts-converter", "YouTube to Shorts Converter", "YouTube转Shorts工具", "YouTube轉Shorts工具"),
    ("ai-highlight-detector", "AI Highlight Detector", "AI高光检测", "AI亮點偵測"),
    ("video-clipping-tool", "Video Clipping Tool", "视频剪辑工具", "影片剪輯工具"),
    ("long-video-to-short-video-ai", "Long Video to Short Video AI", "长视频转短视频AI", "長影片轉短影片AI"),
    ("auto-video-clip-generator", "Auto Video Clip Generator", "自动视频片段生成器", "自動影片片段生成器"),
    ("ai-shorts-maker", "AI Shorts Maker", "AI短视频制作工具", "AI短影片製作工具"),
    ("ai-video-repurposing-tool", "AI Video Repurposing Tool", "AI视频再利用工具", "AI影片重製工具"),
    ("shorts-generator-from-long-videos", "Shorts Generator from Long Videos", "长视频转Shorts生成器", "長影片轉Shorts生成器"),
]

# 场景关键词 (5篇)
SCENE_ARTICLES = [
    ("youtube-shorts-ai", "YouTube Shorts", "YouTube Shorts", "YouTube Shorts"),
    ("tiktok-ai-clipper", "TikTok", "TikTok", "TikTok"),
    ("instagram-reels-ai", "Instagram Reels", "Instagram Reels", "Instagram Reels"),
    ("douyin-ai-tool", "抖音", "抖音", "抖音"),
    ("xiaohongshu-ai", "小红书", "小紅書", "小紅書"),
]

# 竞品对比 (5篇)
COMPETITOR_ARTICLES = [
    ("clipop-vs-opus-clip", "Clipop AI vs Opus Clip", "Clipop AI vs Opus Clip", "Clipop AI vs Opus Clip"),
    ("clipop-vs-vizard-ai", "Clipop AI vs Vizard AI", "Clipop AI vs Vizard AI", "Clipop AI vs Vizard AI"),
    ("clipop-vs-2short-ai", "Clipop AI vs 2short AI", "Clipop AI vs 2short AI", "Clipop AI vs 2short AI"),
    ("clipop-vs-klap", "Clipop AI vs Klap", "Clipop AI vs Klap", "Clipop AI vs Klap"),
    ("bilibili-ai-clipper", "支持B站的AI剪辑工具", "支持B站的AI剪輯工具", "支持B站的AI剪輯工具"),
]

# 长尾关键词 (英文 10篇)
LONGTAIL_EN_ARTICLES = [
    ("best-ai-video-clipper-2025", "Best AI Video Clipper 2025", "2025最佳AI视频剪辑工具", "2025最佳AI影片剪輯工具"),
    ("free-ai-video-to-shorts", "Free AI Video to Shorts", "免费AI短视频生成", "免費AI短影片生成"),
    ("how-to-clip-youtube-videos", "How to Clip YouTube Videos", "如何剪辑YouTube视频", "如何剪輯YouTube影片"),
    ("ai-video-clipper-no-watermark", "AI Video Clipper No Watermark", "无水印AI视频剪辑", "無浮水印AI影片剪輯"),
    ("long-form-to-short-form-ai", "Long Form to Short Form AI", "长内容转短内容AI", "長內容轉短內容AI"),
    ("podcast-to-shorts-ai", "Podcast to Shorts AI", "播客转短视频AI", "Podcast轉短影片AI"),
    ("webinar-to-shorts-tool", "Webinar to Shorts Tool", "研讨会转短视频工具", "研討會轉短影片工具"),
    ("auto-caption-for-shorts", "Auto Caption for Shorts", "短视频自动字幕", "短影片自動字幕"),
    ("vertical-video-ai-generator", "Vertical Video AI Generator", "竖版视频AI生成器", "直向影片AI生成器"),
    ("ai-repurpose-video-content", "AI Repurpose Video Content", "AI视频内容再利用", "AI影片內容重製"),
]

# 长尾关键词 (中文 15篇)
LONGTAIL_CN_ARTICLES = [
    ("ai-long-to-short-video", "如何用AI将长视频剪辑成短视频", "如何用AI將長影片剪輯成短影片", "如何用AI將長影片剪輯成短影片"),
    ("youtube-best-shorts-tool", "YouTube长视频转Shorts最佳工具", "YouTube長影片轉Shorts最佳工具", "YouTube長影片轉Shorts最佳工具"),
    ("bilibili-ai-auto-clip", "B站AI自动剪辑软件", "B站AI自動剪輯軟體", "B站AI自動剪輯軟體"),
    ("free-ai-shorts-generator", "免费AI短视频生成器", "免費AI短影片生成器", "免費AI短影片生成器"),
    ("ai-shorts-editor", "AI短视频编辑工具", "AI短影片編輯工具", "AI短影片編輯工具"),
    ("auto-clip-highlights", "自动剪辑视频亮点", "自動剪輯影片亮點", "自動剪輯影片亮點"),
    ("douyin-shorts-generator", "抖音短视频自动生成", "抖音短影片自動生成", "抖音短影片自動生成"),
    ("xiaohongshu-video-tool", "小红书视频剪辑工具", "小紅書影片剪輯工具", "小紅書影片剪輯工具"),
    ("video-repurpose-platform", "视频内容再利用平台", "影片內容重製平台", "影片內容重製平台"),
    ("ai-caption-subtitle", "AI自动字幕生成", "AI自動字幕生成", "AI自動字幕生成"),
    ("vertical-video-maker", "竖版视频制作工具", "直向影片製作工具", "直向影片製作工具"),
    ("livestream-highlight-clipper", "直播亮点自动剪辑", "直播亮點自動剪輯", "直播亮點自動剪輯"),
    ("podcast-clip-maker", "播客剪辑短视频", "Podcast剪輯短影片", "Podcast剪輯短影片"),
    ("ai-video-summary-clip", "AI视频摘要与片段", "AI影片摘要與片段", "AI影片摘要與片段"),
    ("multi-platform-shorts-tool", "多平台短视频工具", "多平台短影片工具", "多平台短影片工具"),
]


def build_article(idx, slug, title_en, title_zh, title_hant, category_en, category_zh, category_hant, days_ago, views):
    """构建一篇完整的文章条目"""
    content_en = gen_article_content(title_en, 'en')
    content_zh = gen_article_content(title_zh, 'zh')
    content_hant = gen_article_content(title_hant, 'zh-Hant')

    # 对中文标题做简单处理（如果是英文则转成中文描述）
    return {
        'slug': slug,
        'idx': idx,
        'title_en': title_en,
        'title_zh': title_zh,
        'title_hant': title_hant,
        'category_en': category_en,
        'category_zh': category_zh,
        'category_hant': category_hant,
        'content_en': content_en,
        'content_zh': content_zh,
        'content_hant': content_hant,
        'days_ago': days_ago,
        'views': views,
    }


def build_all_articles():
    articles = []
    idx = 1

    for slug, t_en, t_zh, t_ht in CORE_ARTICLES:
        articles.append(build_article(idx, slug, t_en, t_zh, t_ht,
                                       "AI Video Clipping", "AI视频剪辑", "AI影片剪輯",
                                       days_ago=idx * 2, views=1200 + idx * 80))
        idx += 1

    for slug, t_en, t_zh, t_ht in SCENE_ARTICLES:
        articles.append(build_article(idx, slug, t_en, t_zh, t_ht,
                                       "Platform Guide", "平台指南", "平台指南",
                                       days_ago=idx * 3, views=900 + idx * 60))
        idx += 1

    for slug, t_en, t_zh, t_ht in COMPETITOR_ARTICLES:
        articles.append(build_article(idx, slug, t_en, t_zh, t_ht,
                                       "Comparison", "对比评测", "對比評測",
                                       days_ago=idx * 2, views=1500 + idx * 100))
        idx += 1

    for slug, t_en, t_zh, t_ht in LONGTAIL_EN_ARTICLES:
        articles.append(build_article(idx, slug, t_en, t_zh, t_ht,
                                       "How-To Guide", "实用教程", "實用教學",
                                       days_ago=idx * 1 + 5, views=800 + idx * 70))
        idx += 1

    for slug, t_en, t_zh, t_ht in LONGTAIL_CN_ARTICLES:
        articles.append(build_article(idx, slug, t_en, t_zh, t_ht,
                                       "中文指南", "中文指南", "中文指南",
                                       days_ago=idx * 1 + 3, views=1000 + idx * 90))
        idx += 1

    return articles


# ============ 写入 TS 文件 ============

LOCALE_COPY_TEMPLATE = {
    'en': {
        'intro': 'Learn how {keyword} transforms long videos into engaging shorts.',
        'keywords': '{keyword}, AI video clipper, auto clip generator, YouTube shorts, TikTok tool',
        'practical': 'Try our guide on using {keyword} for fast, high-quality shorts.',
        'faq': 'Answers about {keyword}, pricing, language support, and workflow.',
        'cta': 'Start generating shorts from your long videos today with Clipop AI.',
        'originalTitle': 'Original article',
        'category': 'Article',
        'titleSuffix': '— Clipop AI Blog',
    },
    'zh': {
        'intro': '了解 {keyword} 如何将长视频转化为高互动的短视频。',
        'keywords': '{keyword}, AI视频剪辑, 自动片段生成器, YouTube Shorts, 抖音工具',
        'practical': '阅读我们关于使用 {keyword} 快速产出高质量短视频的指南。',
        'faq': '关于 {keyword}、定价、语言支持与工作流程的解答。',
        'cta': '立即使用 Clipop AI 将您的长视频变成短视频。',
        'originalTitle': '原文标题',
        'category': '文章',
        'titleSuffix': '— Clipop AI 博客',
    },
    'zh-Hant': {
        'intro': '了解 {keyword} 如何將長影片轉化為高互動的短影片。',
        'keywords': '{keyword}, AI影片剪輯, 自動片段生成器, YouTube Shorts, 抖音工具',
        'practical': '閱讀我們關於使用 {keyword} 快速產出高品質短影片的指南。',
        'faq': '關於 {keyword}、價格、語言支援與工作流程的解答。',
        'cta': '立即使用 Clipop AI 將您的長影片變成短影片。',
        'originalTitle': '原文標題',
        'category': '文章',
        'titleSuffix': '— Clipop AI 部落格',
    },
}

# 其余语言使用英文模板
OTHER_LOCALES = ['ja', 'ko', 'de', 'fr', 'it', 'es', 'pt', 'hi', 'ar', 'bn', 'id', 'ms', 'th', 'he', 'ru', 'ur', 'tr', 'vi', 'fa', 'mr', 'ta', 'pl', 'te', 'ne', 'da', 'fi', 'nl', 'no', 'sv']


def generate_ts():
    articles = build_all_articles()
    print(f"共生成 {len(articles)} 篇文章")

    lines = []
    lines.append("import type { Locale } from '@/lib/i18n/index';")
    lines.append("")
    lines.append("export interface BlogPost {")
    lines.append("  id: string;")
    lines.append("  slug: string;")
    lines.append("  title: string;")
    lines.append("  content: string;")
    lines.append("  summary: string;")
    lines.append("  category: string;")
    lines.append("  coverImage: string;")
    lines.append("  author: string;")
    lines.append("  publishedAt: string;")
    lines.append("  views: number;")
    lines.append("  locale: Locale;")
    lines.append("  isBuiltIn: boolean;")
    lines.append("}")
    lines.append("")
    lines.append("export type BlogRow = {")
    lines.append("  id?: string | number | null;")
    lines.append("  slug?: string | null;")
    lines.append("  title?: string | null;")
    lines.append("  content?: string | null;")
    lines.append("  summary?: string | null;")
    lines.append("  category?: string | null;")
    lines.append("  cover_image?: string | null;")
    lines.append("  coverImage?: string | null;")
    lines.append("  author?: string | null;")
    lines.append("  author_id?: string | number | null;")
    lines.append("  published_at?: string | null;")
    lines.append("  publishedAt?: string | null;")
    lines.append("  created_at?: string | null;")
    lines.append("  views?: number | null;")
    lines.append("  locale?: string | null;")
    lines.append("  is_published?: boolean | null;")
    lines.append("};")
    lines.append("")
    lines.append("export type BlogArticleSeed = {")
    lines.append("  slug: string;")
    lines.append("  category: { en: string; zh: string; 'zh-Hant': string };")
    lines.append("  coverImageId: number;")
    lines.append("  daysAgo: number;")
    lines.append("  views: number;")
    lines.append("  en: { title: string; content: string };")
    lines.append("  zh: { title: string; content: string };")
    lines.append("  'zh-Hant': { title: string; content: string };")
    lines.append("};")
    lines.append("")
    lines.append("export const BLOG_STORAGE_KEY = 'clipop_blog_posts_v4';")
    lines.append("")
    lines.append("const categoryImages: Record<string, number> = {")
    lines.append("  'AI Video Clipping': 1001,")
    lines.append("  'AI视频剪辑': 1001,")
    lines.append("  'AI影片剪輯': 1001,")
    lines.append("  'Platform Guide': 1002,")
    lines.append("  '平台指南': 1002,")
    lines.append("  'Comparison': 1003,")
    lines.append("  '对比评测': 1003,")
    lines.append("  '對比評測': 1003,")
    lines.append("  'How-To Guide': 1004,")
    lines.append("  '实用教程': 1004,")
    lines.append("  '實用教學': 1004,")
    lines.append("  '中文指南': 1005,")
    lines.append("  'Product Update': 1006,")
    lines.append("  '产品更新': 1006,")
    lines.append("  '產品更新': 1006,")
    lines.append("};")
    lines.append("")
    lines.append("function getCategoryKey(category: string): string {")
    lines.append("  return category || 'AI Video Clipping';")
    lines.append("}")
    lines.append("")
    lines.append("function getCategoryImageId(category: string): number {")
    lines.append("  const key = getCategoryKey(category);")
    lines.append("  return categoryImages[key] ?? 1000;")
    lines.append("}")
    lines.append("")
    lines.append("export function generateCoverImageUrl(_title: string, category: string, _variant?: number): string {")
    lines.append("  const id = getCategoryImageId(category);")
    lines.append("  return `https://picsum.photos/seed/clipop${id}/800/450`;")
    lines.append("}")
    lines.append("")
    lines.append("export function getDefaultCoverImage(category: string): string {")
    lines.append("  return generateCoverImageUrl('', category);")
    lines.append("}")
    lines.append("")

    # 32 语言翻译模板
    lines.append("type BlogLocaleCopy = {")
    lines.append("  intro: string;")
    lines.append("  keywords: string;")
    lines.append("  practical: string;")
    lines.append("  faq: string;")
    lines.append("  cta: string;")
    lines.append("  originalTitle: string;")
    lines.append("  category: string;")
    lines.append("  titleSuffix: string;")
    lines.append("};")
    lines.append("")

    # 为每个语言生成模板
    locale_keys = ['en', 'zh', 'zh-Hant'] + OTHER_LOCALES
    lines.append("const blogTranslations: Record<Locale, BlogLocaleCopy> = {")
    for loc in locale_keys:
        if loc in LOCALE_COPY_TEMPLATE:
            t = LOCALE_COPY_TEMPLATE[loc]
        else:
            t = LOCALE_COPY_TEMPLATE['en']
        lines.append(f"  {loc!r}: {{")
        lines.append(f"    intro: {t['intro']!r},")
        lines.append(f"    keywords: {t['keywords']!r},")
        lines.append(f"    practical: {t['practical']!r},")
        lines.append(f"    faq: {t['faq']!r},")
        lines.append(f"    cta: {t['cta']!r},")
        lines.append(f"    originalTitle: {t['originalTitle']!r},")
        lines.append(f"    category: {t['category']!r},")
        lines.append(f"    titleSuffix: {t['titleSuffix']!r},")
        lines.append("  },")
    lines.append("};")
    lines.append("")

    # 文章种子数据 - 用反引号字符串
    lines.append("const seoSeeds: BlogArticleSeed[] = [")

    for art in articles:
        lines.append("  {")
        lines.append(f"    slug: {art['slug']!r},")
        lines.append(f"    coverImageId: {1000 + art['idx']},")
        lines.append(f"    daysAgo: {art['days_ago']},")
        lines.append(f"    views: {art['views']},")
        lines.append("    category: {")
        lines.append(f"      en: {art['category_en']!r},")
        lines.append(f"      zh: {art['category_zh']!r},")
        lines.append(f"      'zh-Hant': {art['category_hant']!r},")
        lines.append("    },")
        lines.append("    en: {")
        lines.append(f"      title: {art['title_en']!r},")
        lines.append(f"      content: `{escape_ts_str(art['content_en'])}`,")
        lines.append("    },")
        lines.append("    zh: {")
        lines.append(f"      title: {art['title_zh']!r},")
        lines.append(f"      content: `{escape_ts_str(art['content_zh'])}`,")
        lines.append("    },")
        lines.append("    'zh-Hant': {")
        lines.append(f"      title: {art['title_hant']!r},")
        lines.append(f"      content: `{escape_ts_str(art['content_hant'])}`,")
        lines.append("    },")
        lines.append("  },")

    lines.append("];")
    lines.append("")

    # 工具函数
    lines.append("export function normalizeBlogRow(row: BlogRow): BlogPost {")
    lines.append("  const id = String(row.id ?? row.slug ?? `blog-${Date.now()}`);")
    lines.append("  const slug = String(row.slug ?? id);")
    lines.append("  const title = String(row.title ?? 'Untitled');")
    lines.append("  const rawContent = String(row.content ?? '');")
    lines.append("  let summary = String(row.summary ?? '').trim();")
    lines.append("  if (!summary) {")
    lines.append("    const text = stripHtml(rawContent);")
    lines.append("    summary = text.slice(0, 180).trim();")
    lines.append("    if (text.length > 180) summary += '...';")
    lines.append("  }")
    lines.append("  const category = String(row.category ?? 'AI Video Clipping');")
    lines.append("  const coverImage = String(row.cover_image ?? row.coverImage ?? getDefaultCoverImage(category));")
    lines.append("  const author = String(row.author ?? 'Clipop Team');")
    lines.append("  const publishedAt = String(row.published_at ?? row.publishedAt ?? new Date(Date.now() - 86400000).toISOString());")
    lines.append("  const views = typeof row.views === 'number' ? row.views : 0;")
    lines.append("  const locale = normalizeLocale(row.locale);")
    lines.append("  return {")
    lines.append("    id, slug, title, content: rawContent, summary, category, coverImage, author, publishedAt, views, locale, isBuiltIn: false,")
    lines.append("  };")
    lines.append("}")
    lines.append("")
    lines.append("export function stripHtml(html: string): string {")
    lines.append("  if (!html) return '';")
    lines.append("  return html")
    lines.append("    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')")
    lines.append("    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')")
    lines.append("    .replace(/<[^>]+>/g, '')")
    lines.append("    .replace(/&nbsp;/g, ' ')")
    lines.append("    .replace(/&amp;/g, '&')")
    lines.append("    .replace(/&lt;/g, '<')")
    lines.append("    .replace(/&gt;/g, '>')")
    lines.append("    .replace(/&quot;/g, '\"')")
    lines.append("    .replace(/&#39;/g, \"'\")")
    lines.append("    .replace(/\\s+/g, ' ')")
    lines.append("    .trim();")
    lines.append("}")
    lines.append("")
    lines.append("const VALID_LOCALES: Locale[] = [")
    lines.append("  'en', 'zh', 'zh-Hant', 'ja', 'ko', 'de', 'fr', 'it', 'es', 'pt',")
    lines.append("  'hi', 'ar', 'bn', 'id', 'ms', 'th', 'he', 'ru', 'ur', 'tr',")
    lines.append("  'vi', 'fa', 'mr', 'ta', 'pl', 'te', 'ne', 'da', 'fi', 'nl', 'no', 'sv',")
    lines.append("];")
    lines.append("")
    lines.append("export function normalizeLocale(locale: string | undefined | null): Locale {")
    lines.append("  if (!locale) return 'en';")
    lines.append("  const lower = String(locale).trim();")
    lines.append("  if ((VALID_LOCALES as string[]).includes(lower)) return lower as Locale;")
    lines.append("  const short = lower.split('-')[0].split('_')[0].toLowerCase();")
    lines.append("  if (short === 'zh') {")
    lines.append("    if (/hant|tw|hk|mo|traditional|繁/i.test(lower)) return 'zh-Hant';")
    lines.append("    return 'zh';")
    lines.append("  }")
    lines.append("  if (short === 'cn' || short === 'zh-cn') return 'zh';")
    lines.append("  if ((VALID_LOCALES as string[]).includes(short)) return short as Locale;")
    lines.append("  return 'en';")
    lines.append("}")
    lines.append("")
    lines.append("function seedToPosts(seed: BlogArticleSeed): BlogPost[] {")
    lines.append("  const coverImage = `https://picsum.photos/seed/clipop${seed.coverImageId}/800/450`;")
    lines.append("  const baseDate = new Date(Date.now() - seed.daysAgo * 86400000);")
    lines.append("  const publishedAt = baseDate.toISOString();")
    lines.append("  const author = 'Clipop Team';")
    lines.append("  const variants: Array<{ locale: Locale; title: string; content: string; category: string }> = [")
    lines.append("    { locale: 'en', title: seed.en.title, content: seed.en.content, category: seed.category.en },")
    lines.append("    { locale: 'zh', title: seed.zh.title, content: seed.zh.content, category: seed.category.zh },")
    lines.append("    { locale: 'zh-Hant', title: seed['zh-Hant'].title, content: seed['zh-Hant'].content, category: seed.category['zh-Hant'] },")
    lines.append("  ];")
    lines.append("  return variants.map((v) => {")
    lines.append("    const text = stripHtml(v.content);")
    lines.append("    let summary = text.slice(0, 180).trim();")
    lines.append("    if (text.length > 180) summary += '...';")
    lines.append("    return {")
    lines.append("      id: `${seed.slug}-${v.locale}`,")
    lines.append("      slug: `${seed.slug}-${v.locale}`,")
    lines.append("      title: v.title,")
    lines.append("      content: v.content,")
    lines.append("      summary,")
    lines.append("      category: v.category,")
    lines.append("      coverImage,")
    lines.append("      author,")
    lines.append("      publishedAt,")
    lines.append("      views: seed.views,")
    lines.append("      locale: v.locale,")
    lines.append("      isBuiltIn: true,")
    lines.append("    };")
    lines.append("  });")
    lines.append("}")
    lines.append("")
    lines.append("export function getBuiltInBlogPosts(locale: Locale): BlogPost[] {")
    lines.append("  const all: BlogPost[] = [];")
    lines.append("  for (const seed of seoSeeds) {")
    lines.append("    all.push(...seedToPosts(seed));")
    lines.append("  }")
    lines.append("  const filtered = all.filter((p) => p.locale === locale);")
    lines.append("  if (filtered.length > 0) {")
    lines.append("    return filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());")
    lines.append("  }")
    lines.append("  return all.filter((p) => p.locale === 'en');")
    lines.append("}")
    lines.append("")
    lines.append("export function createLocalizedAdminPosts(input: {")
    lines.append("  title: string;")
    lines.append("  category: string;")
    lines.append("  content: string;")
    lines.append("  coverImage?: string;")
    lines.append("  publish?: boolean;")
    lines.append("}): BlogPost[] {")
    lines.append("  const { title, category, content, coverImage, publish = true } = input;")
    lines.append("  const fallbackCover = coverImage && coverImage.trim().length > 0 ? coverImage : getDefaultCoverImage(category);")
    lines.append("  const text = stripHtml(content);")
    lines.append("  let summary = text.slice(0, 180).trim();")
    lines.append("  if (text.length > 180) summary += '...';")
    lines.append("  const publishedAt = new Date().toISOString();")
    lines.append("  const author = 'Clipop Team';")
    lines.append("  const localesOut: Locale[] = ['en', 'zh', 'zh-Hant'];")
    lines.append("  return localesOut.map((loc, i) => ({")
    lines.append("    id: `admin-${Date.now()}-${loc}-${i}`,")
    lines.append("    slug: `admin-${Date.now()}-${loc}`,")
    lines.append("    title,")
    lines.append("    content,")
    lines.append("    summary,")
    lines.append("    category,")
    lines.append("    coverImage: fallbackCover,")
    lines.append("    author,")
    lines.append("    publishedAt,")
    lines.append("    views: 0,")
    lines.append("    locale: loc,")
    lines.append("    isBuiltIn: false,")
    lines.append("  }));")
    lines.append("}")
    lines.append("")
    lines.append("export function getStoredBlogPosts(locale: Locale): BlogPost[] {")
    lines.append("  if (typeof window === 'undefined') return [];")
    lines.append("  try {")
    lines.append("    const raw = window.localStorage.getItem(BLOG_STORAGE_KEY);")
    lines.append("    if (!raw) return [];")
    lines.append("    const parsed = JSON.parse(raw) as unknown[];")
    lines.append("    if (!Array.isArray(parsed)) return [];")
    lines.append("    const rows: BlogPost[] = [];")
    lines.append("    for (const item of parsed) {")
    lines.append("      if (item && typeof item === 'object') {")
    lines.append("        const anyItem = item as Record<string, unknown>;")
    lines.append("        rows.push(normalizeBlogRow(anyItem as unknown as BlogRow));")
    lines.append("      }")
    lines.append("    }")
    lines.append("    return rows.filter((r) => r.locale === locale);")
    lines.append("  } catch {")
    lines.append("    return [];")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    lines.append("export function saveAdminBlogPosts(posts: BlogPost[]): void {")
    lines.append("  if (typeof window === 'undefined') return;")
    lines.append("  try {")
    lines.append("    const serialized = JSON.stringify(posts);")
    lines.append("    window.localStorage.setItem(BLOG_STORAGE_KEY, serialized);")
    lines.append("  } catch {")
    lines.append("    // ignore quota errors")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    lines.append("export { blogTranslations, seoSeeds };")
    lines.append("")

    content = "\n".join(lines)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"文件已生成: {OUTPUT_PATH}")
    print(f"文件大小: {os.path.getsize(OUTPUT_PATH):,} bytes")
    print(f"总行数: {len(content.splitlines())}")

    # 验证
    with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
        content_check = f.read()

    assert 'export interface BlogPost' in content_check
    assert 'seoSeeds' in content_check
    assert 'blogTranslations' in content_check
    assert 'BLOG_STORAGE_KEY' in content_check
    assert 'normalizeBlogRow' in content_check
    assert 'normalizeLocale' in content_check
    assert 'stripHtml' in content_check
    assert 'getBuiltInBlogPosts' in content_check
    assert 'getStoredBlogPosts' in content_check
    assert 'saveAdminBlogPosts' in content_check
    assert 'generateCoverImageUrl' in content_check
    assert 'getDefaultCoverImage' in content_check
    assert 'createLocalizedAdminPosts' in content_check
    assert 'picsum.photos/seed/clipop' in content_check
    # 检查至少 35 篇文章
    seed_count = content_check.count("slug: '")
    print(f"检测到 slug 数量: {seed_count}")
    assert seed_count >= 35, f"文章数量不足 35 篇: {seed_count}"
    print("✅ 所有验证通过")


if __name__ == '__main__':
    generate_ts()
