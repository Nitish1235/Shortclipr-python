"""Build public, static editorial pages. Run after editing this file."""
import json
from html import escape
from pathlib import Path
from seo_expansion import new_pages, new_guides, details, guide_extras, links, guide_product

ROOT = Path(__file__).resolve().parents[1] / 'public'
DOMAIN = 'https://shortclipr.com'
PUBLISHED_DATE = '2026-11-08'
MODIFIED_DATE = '2026-11-08'
DISPLAY_PUBLISHED = 'November 8, 2026'
DISPLAY_MODIFIED = 'November 8, 2026'

# These pages describe creative possibilities while the product is in development.
pages = []

guides = []

types = [('Animated explainers','Make one idea easier to understand.'),('Comparisons and visual facts','Show a meaningful difference side by side.'),('Quizzes and visual puzzles','Invite a guess and reveal the answer.'),('Character comedy','Build a joke around a simple conflict.'),('Mini stories and fables','Follow a character through one change.'),('Mystery and suspense','Use a clue to build curiosity.'),('Horror shorts','Create tension with a small unsettling detail.'),('Historical stories','Make a past event understandable through a sequence.'),('Maps and geography','Follow a place, route or journey.'),('Space and scale journeys','Compare things that are hard to imagine.'),('What-if simulations','Explore a clearly stated scenario and its assumptions.'),('Myth-busting experiments','Examine a claim and explain the evidence.'),('Animated conversations','Explore two perspectives on an idea.'),('Sports tactics','Make a movement or decision easier to see.'),('Architecture and room transformations','Explore a change in a space.'),('News and event recaps','Summarize a verified event with context.')]

pages += new_pages
guides += new_guides

def e(s): return escape(s, quote=True)
def link(path): return f'/{path}/'
page_images = {
    'animated-explainer-video-maker': ('science-clip.png', 'Child watching a visible moon in a daytime sky', 'EXPLAINER / WHY THE MOON APPEARS IN DAYLIGHT'),
    'text-to-animation': ('fable-clip.png', 'A bedside lamp helping a seedling grow on a rainy windowsill', 'MINI STORY / A LITTLE LIGHT FOR A SEEDLING'),
    'faceless-video-maker': ('history-clip.png', 'Animated trade-route map with moving merchant boats', 'VISUAL HISTORY / FOLLOW THE TRADE ROUTE'),
    'faceless-youtube-shorts': ('history-clip.png', 'Animated trade-route map with moving merchant boats', 'FACELESS SHORT / A JOURNEY ACROSS THE MAP'),
    'animated-tiktok-video-maker': ('mystery-clip.png', 'A mysterious hallway with an unusual moving shadow', 'MYSTERY SHORT / THE SHADOW MOVED FIRST'),
    'animated-reels-maker': ('quiz-clip.png', 'A visual puzzle with staircases and red balls', 'VISUAL PUZZLE / WHICH PATH LEADS OUT?'),
    'animated-story-video-maker': ('fable-clip.png', 'A bedside lamp helping a seedling grow on a rainy windowsill', 'ANIMATED FABLE / A SMALL ACT OF LIGHT'),
    'video-quiz-maker': ('quiz-clip.png', 'A visual puzzle with staircases and red balls', 'QUIZ / WHICH BALL REACHES THE TOP?'),
    'educational-video-maker': ('science-clip.png', 'Child watching a visible moon in a daytime sky', 'SCIENCE SHORT / WHY CAN WE SEE THE MOON?'),
}
guide_images = {
    'how-to-make-animated-explainer-video': page_images['animated-explainer-video-maker'],
    'how-to-make-faceless-youtube-shorts': page_images['faceless-video-maker'],
    'faceless-tiktok-video-ideas': page_images['animated-tiktok-video-maker'],
    'how-to-make-animated-tiktok-videos': page_images['animated-tiktok-video-maker'],
    'how-to-write-an-animation-brief': page_images['animated-story-video-maker'],
    'how-to-make-a-quiz-video': page_images['video-quiz-maker'],
    'short-video-storytelling': page_images['animated-story-video-maker'],
    'video-aspect-ratio-guide': page_images['faceless-video-maker'],
}
page_images.update({
    'faceless-tiktok-video-maker': page_images['animated-tiktok-video-maker'],
    'animated-youtube-shorts-maker': page_images['faceless-youtube-shorts'],
    'faceless-ai-shorts-generator': page_images['animated-tiktok-video-maker'],
})
guide_images.update({
    'faceless-educational-video-guide': page_images['educational-video-maker'],
    'how-to-make-history-shorts': page_images['faceless-youtube-shorts'],
    'animated-mystery-story-ideas': page_images['animated-tiktok-video-maker'],
    'visual-comparison-video-guide': page_images['animated-explainer-video-maker'],
    'animation-brief-examples': page_images['animated-story-video-maker'],
    'how-to-make-faceless-ai-shorts': page_images['animated-tiktok-video-maker'],
    'faceless-shorts-channel-ideas': page_images['faceless-youtube-shorts'],
    'faceless-video-script-template': page_images['animated-story-video-maker'],
})

page_answers = {
    'animated-explainer-video-maker': 'An animated explainer video makes one focused idea easier to understand through a short visual sequence and narration. With ShortClipr, you begin with the question, audience and takeaway, then shape them into an animated short you can review before sharing.',
    'text-to-animation': 'Text-to-animation turns a written topic, question or creative brief into a visual short. ShortClipr is designed to help you describe the subject, audience, tone and ending, then explore that idea as a finished animated video rather than a timeline you have to assemble.',
    'faceless-video-maker': 'A faceless video communicates through animation, objects, characters, text and narration instead of footage of the creator. ShortClipr helps creators plan explainers, stories, quizzes and visual facts without needing to record themselves on camera.',
    'faceless-youtube-shorts': 'Faceless YouTube Shorts are vertical short-form videos that do not require the creator to appear on camera. A clear question, story or reveal gives each Short a job, while animation and narration carry the idea for the audience.',
    'animated-tiktok-video-maker': 'An animated TikTok uses visual storytelling instead of filmed presenter footage. Start with one question, conflict or change that can be understood quickly, then build the short around a clear payoff that works on a vertical phone screen.',
    'animated-reels-maker': 'An animated Reel turns one message, lesson or small story into a vertical video for Instagram. The strongest briefs define the audience, the key visual and the change or takeaway viewers should understand by the end.',
    'animated-story-video-maker': 'An animated story video gives a character a goal, introduces one meaningful obstacle and ends with a visible change. ShortClipr is designed for compact stories and fables that can be understood as a complete short.',
    'video-quiz-maker': 'A quiz video presents one verifiable question, gives viewers a moment to think and reveals the answer with a brief explanation. ShortClipr helps turn the question, choices and payoff into a clear animated sequence.',
    'educational-video-maker': 'An educational animated video teaches one defined concept to one defined audience. ShortClipr helps turn a lesson brief into a focused visual explanation with examples, narration and a takeaway viewers can remember.',
    'faceless-tiktok-video-maker': 'A faceless TikTok video shares a story, explanation, quiz or visual fact without requiring you to film yourself. ShortClipr helps you start with a creative brief and develop it as a vertical animated short built around one clear idea.',
    'animated-youtube-shorts-maker': 'An animated YouTube Short is a vertical video that explains, compares or tells a compact story through visuals and narration. Start with one self-contained idea and give it an opening, a visible development and a satisfying ending.',
    'faceless-ai-shorts-generator': 'A faceless AI shorts generator turns a written brief into a short video with generated narration, visual direction, animation and final assembly. ShortClipr helps creators start without filming themselves while keeping review and publishing decisions in human hands.',
}

page_questions = {
    'animated-explainer-video-maker': 'What is an animated explainer video maker?',
    'text-to-animation': 'What does text-to-animation mean?',
    'faceless-video-maker': 'What is a faceless video maker?',
    'faceless-youtube-shorts': 'What are faceless YouTube Shorts?',
    'animated-tiktok-video-maker': 'What is an animated TikTok video maker?',
    'animated-reels-maker': 'What is an animated Reels maker?',
    'animated-story-video-maker': 'What is an animated story video maker?',
    'video-quiz-maker': 'What is an animated quiz video maker?',
    'educational-video-maker': 'What is an educational animation maker?',
    'faceless-tiktok-video-maker': 'What is a faceless TikTok video maker?',
    'animated-youtube-shorts-maker': 'What is an animated YouTube Shorts maker?',
    'faceless-ai-shorts-generator': 'What is a faceless AI shorts generator?',
}

def breadcrumb_data(path, title):
    parts = [('ShortClipr', DOMAIN + '/story-machine/')]
    if path.startswith('guides/'):
        parts.append(('Guides', DOMAIN + '/guides/'))
    parts.append((title, DOMAIN + link(path)))
    return {
        '@type': 'BreadcrumbList',
        '@id': DOMAIN + link(path) + '#breadcrumb',
        'itemListElement': [
            {'@type': 'ListItem', 'position': index, 'name': name, 'item': url}
            for index, (name, url) in enumerate(parts, 1)
        ],
    }

def structured_data(path, title, description, image=None, is_article=False):
    canonical = DOMAIN + link(path)
    organization_id = DOMAIN + '/#organization'
    website_id = DOMAIN + '/#website'
    webpage_id = canonical + '#webpage'
    graph = [
        {
            '@type': 'Organization', '@id': organization_id, 'name': 'ShortClipr',
            'url': DOMAIN + '/story-machine/', 'logo': DOMAIN + '/logo.svg',
        },
        {
            '@type': 'WebSite', '@id': website_id, 'url': DOMAIN + '/',
            'name': 'ShortClipr', 'publisher': {'@id': organization_id},
        },
        breadcrumb_data(path, title),
        {
            '@type': 'WebPage', '@id': webpage_id, 'url': canonical,
            'name': title, 'description': description,
            'isPartOf': {'@id': website_id}, 'about': {'@id': organization_id},
            'breadcrumb': {'@id': canonical + '#breadcrumb'},
            'datePublished': PUBLISHED_DATE, 'dateModified': MODIFIED_DATE,
        },
    ]
    if is_article:
        article = {
            '@type': 'Article', '@id': canonical + '#article', 'headline': title,
            'description': description, 'datePublished': PUBLISHED_DATE,
            'dateModified': MODIFIED_DATE,
            'author': {'@type': 'Organization', 'name': 'ShortClipr Editorial Team', 'url': DOMAIN + '/about/'},
            'publisher': {'@id': organization_id}, 'mainEntityOfPage': {'@id': webpage_id},
        }
        if image:
            article['image'] = [DOMAIN + '/seo-assets/' + image[0]]
        graph.append(article)
        graph[3]['mainEntity'] = {'@id': canonical + '#article'}
    return json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, separators=(',', ':'))

def breadcrumb_html(path, title):
    items = [('<a href="/story-machine/">ShortClipr</a>', '')]
    if path.startswith('guides/'):
        items.append(('<a href="/guides/">Guides</a>', ''))
    items.append((e(title), ' aria-current="page"'))
    return '<nav class="breadcrumbs" aria-label="Breadcrumb">' + '<span aria-hidden="true"> / </span>'.join(f'<span{current}>{label}</span>' for label,current in items) + '</nav>'

def layout(path,title,description,body,image=None,is_article=False):
    canonical = DOMAIN + link(path)
    image_meta = f'<meta property="og:image" content="{DOMAIN}/seo-assets/{e(image[0])}"><meta property="og:image:alt" content="{e(image[1])}"><meta name="twitter:image" content="{DOMAIN}/seo-assets/{e(image[0])}">' if image else ''
    schema = structured_data(path,title,description,image,is_article)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(title)} | ShortClipr</title><meta name="description" content="{e(description)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><link rel="canonical" href="{canonical}"><meta property="og:type" content="{'article' if is_article else 'website'}"><meta property="og:site_name" content="ShortClipr"><meta property="og:title" content="{e(title)} | ShortClipr"><meta property="og:description" content="{e(description)}"><meta property="og:url" content="{canonical}">{image_meta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)} | ShortClipr"><meta name="twitter:description" content="{e(description)}"><meta name="theme-color" content="#171914"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/seo.css"><script type="application/ld+json">{schema}</script></head><body><header class="nav"><a class="brand" href="/story-machine/"><img src="/logo.svg" alt="">ShortClipr<span>.</span></a><nav aria-label="Main navigation"><a href="/video-ideas/">Video ideas</a><a href="/guides/">Guides</a><a href="/about/">About</a></nav><a class="nav-cta" href="/studio/create">Explore the studio ↗</a></header>{breadcrumb_html(path,title)}<main>{body}</main><footer><div><a class="brand" href="/story-machine/">ShortClipr<span>.</span></a><p>Little films. Big ideas.</p></div><div><a href="/video-ideas/">Video ideas</a><a href="/guides/">Creator guides</a><a href="/about/">About</a><a href="/editorial-policy/">Editorial policy</a></div><small>ShortClipr is in development. Creative formats and availability may change.</small></footer></body></html>'''

def save(path,title,description,body,image=None,is_article=False):
    folder=ROOT/path; folder.mkdir(parents=True,exist_ok=True)
    document=layout(path,title,description,body,image,is_article)
    document=document.replace('</head>', '<link rel="stylesheet" href="/seo-content.css"><link rel="stylesheet" href="/seo-typography.css"></head>')
    document=document.replace('Examples of the visual direction a short can take.', 'Illustrated concepts showing possible creative directions; these are not finished videos.')
    if image:
        document=document.replace('</figcaption>', '<span class="concept-label"> / CONCEPT ILLUSTRATION</span></figcaption>', 1)
    (folder/'index.html').write_text(document,encoding='utf-8')

def card(path,title,description,number):
    return f'<a class="card" href="{link(path)}"><span>{number:02} / EXPLORE ↗</span><h3>{e(title)}</h3><p>{e(description)}</p></a>'

for path,title,headline,description,advice,example,tip in pages:
    related = [p for p in pages if p[0]!=path][:3]
    image = page_images[path]
    hero_media = f'<figure class="hero-image"><img src="/seo-assets/{e(image[0])}" alt="{e(image[1])}" width="466" height="473"><figcaption>{e(image[2])}</figcaption></figure>' if image else '<div class="hero-art" aria-hidden="true"><div class="art-frame"><span>IDEA / IN MOTION</span><div class="art-circle">✳</div><strong>MAKE<br>IT<br>MOVE<span>.</span></strong><small>A LITTLE FILM FOR A BIG IDEA ↗</small></div></div>'
    body=f'''<section class="hero"><div><p class="eyebrow">SHORTCLIPR / CREATIVE STUDIO</p><h1>{e(headline)}</h1><p class="lead">{e(description)}</p><div class="actions"><a class="button" href="/studio/create">Explore the studio ↗</a><a class="text-link" href="/video-ideas/">Find your format →</a></div><p class="note">ShortClipr is in development. The experience and availability may change.</p></div>{hero_media}</section><section class="intro split"><div><p class="eyebrow">THE STARTING POINT</p><h2>{e(title)}<span>.</span></h2></div><div><p>{e(advice)}</p><h3>Try a creative brief</h3><blockquote>“{e(example)}”</blockquote><p>{e(tip)}</p></div></section><section class="steps"><div class="section-head"><div><p class="eyebrow">THE CREATIVE PROCESS</p><h2>ONE IDEA.<br><em>A LITTLE FILM.</em></h2></div><p>Start with the part that matters most: what you want your audience to see, learn or feel.</p></div><div class="step-grid"><article><span>01 / THE SPARK</span><h3>Describe your idea.</h3><p>Write a topic or brief and tell the story you want to share.</p></article><article><span>02 / THE DIRECTION</span><h3>Choose your format.</h3><p>Explore a video type, visual direction, duration and frame.</p></article><article><span>03 / THE RESULT</span><h3>Review your short.</h3><p>Check the finished video and its details before sharing it with your audience.</p></article></div></section><section class="related"><div class="section-head"><div><p class="eyebrow">KEEP EXPLORING</p><h2>MORE WAYS<br>TO CREATE<span>.</span></h2></div><a class="text-link" href="/guides/">Read the guides ↗</a></div><div class="cards">{''.join(card(p[0],p[1],p[3],i+1) for i,p in enumerate(related))}</div></section>'''
    answer_box = f'<section class="answer-box" aria-labelledby="quick-answer"><p class="eyebrow">QUICK ANSWER</p><h2 id="quick-answer">{e(page_questions[path])}</h2><p>{e(page_answers[path])}</p></section>'
    body = body.replace('</section><section class="intro split">', '</section>'+answer_box+'<section class="intro split">', 1)
    faq = f'''<section class="answer-faq"><div><p class="eyebrow">COMMON QUESTIONS</p><h2>BEFORE YOU<br>START CREATING.</h2></div><div><details><summary>What can I create with ShortClipr?<span>+</span></summary><p>{e(description)}</p></details><details><summary>Do I need to film myself?<span>+</span></summary><p>No. ShortClipr is designed for animated, faceless videos, so the idea can lead without requiring you to appear on camera.</p></details><details><summary>Does ShortClipr publish to social platforms for me?<span>+</span></summary><p>No. You review and download the finished result, then choose where and when to publish it.</p></details></div></section>'''
    body += faq
    if path in details:
        sections = ''.join(f'<section><h3>{e(heading)}</h3><p>{e(copy)}</p></section>' for heading,copy in details[path])
        articles = {g[0]:g[1] for g in guides}
        related_guides = ''.join(f'<li><a href="/guides/{e(slug)}/">{e(articles[slug])} →</a></li>' for slug in links.get(path, []))
        extra = f'<section class="editorial-detail"><p class="eyebrow">MAKE IT YOURS / SHORTCLIPR</p><h2>FROM IDEA TO VIDEO.</h2>{sections}<h3>Keep exploring</h3><ul>{related_guides}</ul><a class="button" href="/studio/create">Explore the creation desk ↗</a></section>'
        body = body.replace('<section class="related">', extra+'<section class="related">')
    save(path,title,description,body,image)

for path,title,description,*sections in guides:
    content=''.join(f'<section><h2>{e(s.split("|",1)[0])}</h2><p>{e(s.split("|",1)[1])}</p></section>' for s in sections)
    image = guide_images[path]
    guide_media = f'<figure class="guide-image"><img src="/seo-assets/{e(image[0])}" alt="{e(image[1])}" width="466" height="473"><figcaption>{e(image[2])}</figcaption></figure>' if image else ''
    article_hero_class = 'article-hero with-media' if image else 'article-hero'
    first_answer = f"{description} {sections[0].split('|',1)[1]}"
    body=f'''<article class="article"><div class="{article_hero_class}"><div><p class="eyebrow">THE SHORTCLIPR GUIDE / CREATIVE NOTES</p><h1>{e(title)}<span>.</span></h1><p class="lead">{e(description)}</p><p class="article-meta">By <a href="/about/">ShortClipr Editorial Team</a> · Published {DISPLAY_PUBLISHED} · Updated {DISPLAY_MODIFIED}</p></div>{guide_media}</div><div class="article-layout"><aside><span>IN THIS GUIDE</span>{''.join(f'<p>{e(s.split("|",1)[0])}</p>' for s in sections)}<a href="/guides/">← All guides</a></aside><div class="article-copy"><section class="article-answer"><p class="eyebrow">QUICK ANSWER</p><h2>{e(title)}</h2><p>{e(first_answer)}</p></section><p class="article-opening">A useful short starts with a clear purpose. These steps will help you shape an idea for your audience and review it before sharing.</p>{content}<div class="article-cta"><p class="eyebrow">YOUR TURN</p><h2>GIVE YOUR IDEA A WORLD.</h2><p>Explore the ShortClipr studio and start with a brief of your own.</p><a class="button" href="/studio/create">Explore the studio ↗</a></div></div></div></article>'''
    if path in guide_extras:
        heading,copy = guide_extras[path]
        body = body.replace('<div class="article-cta">', f'<section><h2>{e(heading)}</h2><p>{e(copy)}</p></section><div class="article-cta">')
    if path in guide_product:
        product = guide_product[path]
        label = next(p[1] for p in pages if p[0] == product)
        body = body.replace('<div class="article-cta">', f'<p>Explore the <a href="/{e(product)}/">{e(label)}</a> to plan your next short with ShortClipr.</p><div class="article-cta">')
    save('guides/'+path,title,description,body,image,is_article=True)

body='<section class="listing"><p class="eyebrow">THE SHORTCLIPR LIBRARY</p><h1>IDEAS WORTH<br><em>PUTTING IN MOTION.</em></h1><p class="lead">Practical notes on making short videos that teach, surprise and tell a good story.</p><div class="cards">'+''.join(card('guides/'+g[0],g[1],g[2],i+1) for i,g in enumerate(guides))+'</div></section>'
save('guides','Guides to animated and faceless videos','Practical guides to animated videos, faceless Shorts, TikTok ideas, storytelling and more.',body)
gallery = [('science-clip.png','Child watching a visible moon in a daytime sky','SCIENCE EXPLAINER','WHY CAN WE SEE THE MOON?'),('history-clip.png','A trade route unfolds on a map','HISTORICAL STORY','FOLLOW THE TRADE ROUTE'),('space-clip.png','An astronaut passes a ringed planet','SPACE JOURNEY','HOW FAR IS FOREVER?'),('fable-clip.png','A lamp helps a young seedling','MINI FABLE','A LITTLE LIGHT FOR A SEEDLING'),('mystery-clip.png','A shadow moves differently from its owner','MYSTERY SHORT','THE SHADOW MOVED FIRST'),('quiz-clip.png','A visual puzzle with staircases and red balls','VISUAL QUIZ','WHICH PATH LEADS OUT?')]
body='<section class="listing"><p class="eyebrow">THE STORY COLLECTION / 16 IDEAS</p><h1>WHAT WILL<br><em>YOU MAKE?</em></h1><p class="lead">From a question that needs answering to a story that needs telling, find a starting point for your next short.</p><p class="note">These are creative directions in the planned product. Individual results and availability may vary.</p><section class="clip-gallery"><div class="section-head"><div><p class="eyebrow">A FEW POSSIBLE FILMS</p><h2>IDEAS, IN MOTION.</h2></div><p>Examples of the visual direction a short can take.</p></div><div class="clip-grid">'+''.join(f'<figure><img src="/seo-assets/{e(image)}" alt="{e(alt)}" width="466" height="473"><figcaption><span>{e(format_name)}</span><strong>{e(caption)}</strong></figcaption></figure>' for image,alt,format_name,caption in gallery)+'</div></section><div class="type-list">'+''.join(f'<article><span>{i+1:02}</span><h2>{e(name)}</h2><p>{e(description)}</p></article>' for i,(name,description) in enumerate(types))+'</div><div class="section-head"><h2>FIND YOUR<br>STARTING POINT.</h2></div><div class="cards">'+''.join(card(p[0],p[1],p[3],i+1) for i,p in enumerate(pages))+'</div><div class="article-cta"><h2>START WITH A SPARK.</h2><p>Choose an idea and explore the creation desk.</p><a class="button" href="/studio/create">Explore the studio ↗</a></div></section>'
save('video-ideas','Animated video ideas and formats','Explore 16 creative directions for short animated videos, from explainers and quizzes to stories and visual facts.',body)

about_body='''<section class="trust-hero"><p class="eyebrow">ABOUT SHORTCLIPR</p><h1>IDEAS DESERVE<br><em>A WORLD.</em></h1><p class="lead">ShortClipr is a creative studio for turning focused ideas into short animated videos without requiring creators to film themselves.</p></section><section class="answer-box"><p class="eyebrow">QUICK ANSWER</p><h2>What is ShortClipr?</h2><p>ShortClipr is being built as a web-based creative studio for animated explainers, faceless short-form videos, quizzes and compact stories. Creators begin with a topic or brief, choose a direction and review the resulting short before deciding where to share it.</p></section><section class="trust-grid"><article><span>01 / PURPOSE</span><h2>MAKE IDEAS EASIER TO SEE.</h2><p>ShortClipr focuses on one useful outcome: helping a creator give an idea a clear visual shape. The public library covers explainers, comparisons, stories, quizzes, educational shorts and other focused formats.</p></article><article><span>02 / FOR CREATORS</span><h2>NO CAMERA REQUIRED.</h2><p>The experience is designed for people who want to teach, tell stories or build a short-form series without appearing on camera. Animation, characters, objects and narration can carry the idea.</p></article><article><span>03 / HONEST PREVIEW</span><h2>CONCEPTS ARE LABELLED.</h2><p>ShortClipr is in development. Concept artwork and planned capabilities are identified clearly, and public pages avoid promising outcomes, availability or platform performance that cannot be verified.</p></article></section><section class="article-cta trust-cta"><p class="eyebrow">EXPLORE SHORTCLIPR</p><h2>FIND A STARTING POINT.</h2><p>Browse creative formats and practical guides, or take an idea to the creation desk.</p><a class="button" href="/video-ideas/">Explore video ideas ↗</a></section>'''
save('about','About ShortClipr','Learn what ShortClipr is, who it is designed for and how its animated short-form creative studio is being developed.',about_body)

policy_body='''<section class="trust-hero"><p class="eyebrow">SHORTCLIPR EDITORIAL POLICY</p><h1>USEFUL BEFORE<br><em>PROMOTIONAL.</em></h1><p class="lead">How ShortClipr creates, reviews and updates its public guides, examples and product information.</p></section><section class="answer-box"><p class="eyebrow">OUR STANDARD</p><h2>How is ShortClipr content reviewed?</h2><p>The ShortClipr Editorial Team writes for creators first: answer the question clearly, distinguish concepts from finished work, avoid unsupported performance claims, and review factual or platform-specific details before publication.</p></section><section class="policy-list"><article><span>01</span><div><h2>Clarity</h2><p>Every guide should answer a specific creator question in plain language. Important limitations and next steps should be visible rather than hidden behind promotional wording.</p></div></article><article><span>02</span><div><h2>Accuracy</h2><p>Factual claims are checked before publication. Platform requirements can change, so creators are directed to review current official requirements before uploading.</p></div></article><article><span>03</span><div><h2>Originality</h2><p>Briefs, examples and creative frameworks should add practical value instead of repeating generic summaries. Illustrative concepts are labelled so they are not mistaken for finished customer work.</p></div></article><article><span>04</span><div><h2>Updates</h2><p>Guides display publication and update dates. Material corrections and meaningful changes should update the visible date and the structured page information together.</p></div></article><article><span>05</span><div><h2>Commercial transparency</h2><p>ShortClipr content can explain how the platform supports a task, but it must not invent testimonials, rankings, customer results or guarantees. Product availability is described as it exists.</p></div></article></section><section class="article-cta trust-cta"><p class="eyebrow">LAST REVIEWED</p><h2>{DISPLAY_MODIFIED}</h2><p>Read more about the product and the team responsible for this library.</p><a class="button" href="/about/">About ShortClipr ↗</a></section>'''
save('editorial-policy','ShortClipr editorial policy','How ShortClipr writes, reviews, labels and updates its creator guides and product information.',policy_body)

paths=[p[0] for p in pages]+['guides','video-ideas','about','contact','editorial-policy']+['guides/'+g[0] for g in guides]
(ROOT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{DOMAIN}{link(path)}</loc><lastmod>{MODIFIED_DATE}</lastmod></url>\n' for path in ['story-machine']+paths)+'</urlset>\n',encoding='utf-8')
(ROOT/'robots.txt').write_text('User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://shortclipr.com/sitemap.xml\n',encoding='utf-8')
print(f'Built {len(paths)} public pages and sitemap.')
