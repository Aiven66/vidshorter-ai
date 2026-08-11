from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.goto('http://localhost:5100/video-clips')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    page.screenshot(path='/Users/aiven/Desktop/AI/codex/projects/.tmp_layout_desktop.png', full_page=False)

    layout_info = page.evaluate("""() => {
        const aside = document.querySelector('aside');
        const header = document.querySelector('header');
        const nav = document.querySelector('nav');
        const body = document.body;
        return {
            hasAside: !!aside,
            asideWidth: aside ? window.getComputedStyle(aside).width : null,
            asideClass: aside ? aside.className : null,
            asideVisible: aside ? window.getComputedStyle(aside).display : null,
            hasHeader: !!header,
            headerClass: header ? header.className : null,
            hasNav: !!nav,
            navText: nav ? nav.innerText.substring(0, 300) : null,
            bodyClass: body.className,
            bodyWidth: window.innerWidth,
        };
    }""")
    print("LAYOUT_INFO:", layout_info)

    browser.close()
