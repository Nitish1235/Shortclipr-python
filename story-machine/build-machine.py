from pathlib import Path

root = Path(__file__).resolve().parent
svg = '''<svg xmlns="http://www.w3.org/2000/svg" class="machine" viewBox="0 10 700 595" role="img" aria-labelledby="machine-title machine-desc">
<title id="machine-title">The Story Machine</title><desc id="machine-desc">A hand-illustrated lime green story-making machine with an articulated robotic arm, detailed control tower, dimensional conveyor and four illustrated video screens.</desc>
<defs>
 <linearGradient id="lime" x1=".15" y1="0" x2=".9" y2="1"><stop stop-color="#efff77"/><stop offset=".24" stop-color="#c9ff15"/><stop offset=".65" stop-color="#9cda00"/><stop offset="1" stop-color="#639500"/></linearGradient>
 <linearGradient id="side" x1="0" x2="1" y2="1"><stop stop-color="#a9e900"/><stop offset="1" stop-color="#537d0c"/></linearGradient>
 <linearGradient id="blackmetal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3c4b36"/><stop offset=".45" stop-color="#101a12"/><stop offset="1" stop-color="#040b07"/></linearGradient>
 <linearGradient id="chrome" x1="0" x2="1" y2="1"><stop stop-color="#f5ffdd"/><stop offset=".28" stop-color="#92ae78"/><stop offset=".55" stop-color="#263b29"/><stop offset="1" stop-color="#d1e9ba"/></linearGradient>
 <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".33"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#d9ffe5" stop-opacity=".22"/></linearGradient>
 <linearGradient id="sky1" x2="0" y2="1"><stop stop-color="#9cc3ca"/><stop offset=".55" stop-color="#dfd8b9"/><stop offset="1" stop-color="#436b5d"/></linearGradient>
 <linearGradient id="sky2" x2="0" y2="1"><stop stop-color="#a4b7c3"/><stop offset=".55" stop-color="#edd3a9"/><stop offset="1" stop-color="#586c60"/></linearGradient>
 <linearGradient id="sky3" x2="0" y2="1"><stop stop-color="#5d8994"/><stop offset="1" stop-color="#152f2e"/></linearGradient>
 <linearGradient id="sky4" x2="0" y2="1"><stop stop-color="#bbbfad"/><stop offset=".5" stop-color="#a89177"/><stop offset="1" stop-color="#283933"/></linearGradient>
 <filter id="shadow" x="-.3" y="-.5" width="1.6" height="2"><feGaussianBlur stdDeviation="8"/></filter>
 <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v7" stroke="#273c14" stroke-opacity=".27" stroke-width="1"/></pattern>
 <clipPath id="belt-mask"><path d="M49 432 Q33 418 49 399 Q60 390 77 393 L626 466 Q643 469 642 482 Q641 491 629 494 L71 447 Q57 445 49 432Z"/></clipPath>
 <clipPath id="s1"><path d="M0 12Q0 0 11 0H78Q90 1 90 13V164Q89 176 78 176H11Q0 176 0 164Z"/></clipPath>
</defs>
<!-- soft ink shadow anchors the entire machine -->
<path d="M45 515Q193 497 343 523T695 561Q594 589 352 556T45 531Z" fill="#37422c" opacity=".18" filter="url(#shadow)"/>
<!-- Loose lime brush marks sit behind the machine, like the printed reference. -->
<g id="paint-bleed" fill="#bdff00" stroke="none" opacity=".92">
 <path d="M68 411q43-15 85-11l-20 8 65-1-25 9 75-1-16 7-83 1-44 8-52-8Z"/>
 <path d="M103 444q36 5 57 1l-13 8q30 3 40 2l-11 7q27 13 43 17l-16-1q21 18 37 24-25-5-43-19l-14-1q-18-16-42-21l-41-5Z"/>
 <path d="M484 469q48 3 77 10l-15 2 61 7-19 4q38 4 65 1l-14 6q18 4 34 2-13 9-35 10-8 14-22 19l-20-2q-12-12-33-15l-77-19Z"/>
 <path d="M625 448q18 0 35 6l-8 3q19 2 27 9l-10 1q8 6 10 13-11-8-21-8l-8-10Z"/>
 <path d="M302 387q15-24 36-20l-9 10q37-4 59 8l-18 1q26 6 36 17l-36-4-55-3Z" opacity=".7"/>
 <path d="M156 468l-14 1 11 5-20-2 12 6-16-2 18 10 18 2Z" opacity=".75"/>
</g>
'''
svg += (root / 'upper-machine.svg').read_text(encoding='utf-8')
svg += (root / 'conveyor.svg').read_text(encoding='utf-8')

# Four distinct, richly layered miniature scenes. They are illustrations, not claimed product outputs.
scenes = [
'''<rect width="90" height="176" fill="url(#sky1)"/><circle cx="69" cy="29" r="12" fill="#f9e7b7"/><path d="M0 111L25 53l15 25L53 56l37 58v62H0Z" fill="#6d8981"/><path d="M16 75l9-22 8 15-6-3-5 8Z M45 70l8-14 8 14-7-4Z" fill="#edf3dd"/><path d="M0 128l24-31 17 20 18-32 31 42v49H0Z" fill="#385b4f"/><path d="M0 148q20-15 37-9t53-19v56H0Z" fill="#203e37"/><path d="M8 149l5-25 5 25m4 1 5-35 5 35m39-10 5-30 5 30" stroke="#132b25" stroke-width="3"/><path d="M0 156q34-8 90-10" fill="none" stroke="#d0dcc0" opacity=".5"/>''',
'''<rect width="90" height="176" fill="url(#sky2)"/><circle cx="67" cy="29" r="15" fill="#f4ddb2"/><path d="M0 98l24-38 18 32 19-43 29 47v80H0Z" fill="#838d87"/><path d="M0 126l28-32 17 20 18-31 27 38v55H0Z" fill="#586e62"/><path d="M0 141q18-8 33-5t57-18v58H0Z" fill="#2c4739"/><path d="M26 136l4-25 5 2 2 23m-11-25 6-11 6 12m-14 18h18" fill="#e1d1b0" stroke="#4a5144" stroke-width="1.2"/><path d="M0 153q23-4 40-8t50-13" fill="none" stroke="#cbd1b4" opacity=".6"/>''',
'''<rect width="90" height="176" fill="url(#sky3)"/><circle cx="68" cy="25" r="11" fill="#efdcab"/><path d="M0 89l26-37 19 30 17-24 28 35v83H0Z" fill="#56736d"/><path d="M0 118l28-31 19 22 25-34 18 32v69H0Z" fill="#294d47"/><path d="M0 142q23-21 44-12t46-10v56H0Z" fill="#193a31"/><path d="M30 129q-6-24 3-35 11-9 20 2 6 10 1 31l-6 10H35Z" fill="#d9ccb5" stroke="#23362c" stroke-width="2"/><path d="M31 98l-1-14 11 9m10 5 3-14-13 9" fill="#9c9981" stroke="#25392f" stroke-width="2"/><path d="M36 109h2m9 0h2m-9 9 3 2 3-2" stroke="#1d3027" stroke-width="2"/>''',
'''<rect width="90" height="176" fill="url(#sky4)"/><circle cx="65" cy="30" r="13" fill="#e7d4ac"/><path d="M0 103L20 58l18 35 16-37 36 45v75H0Z" fill="#777c6c"/><path d="M0 127l19-34 19 24 20-32 32 39v52H0Z" fill="#4d6255"/><path d="M0 146q26-15 42-11t48-15v56H0Z" fill="#273e35"/><path d="M47 135v-38m-10 38v-28m21 29v-31M33 107l18-20 15 17" fill="none" stroke="#d8c8a7" stroke-width="2"/><path d="M40 112h16m-16 7h16m-16 7h16" stroke="#c4bc9e" stroke-width="1"/>'''
]

for i, (x, y, angle, label) in enumerate([(119, 202, -3, 'WILD PLACES'), (236, 216, -1, 'SMALL HABITS'), (353, 230, 1, 'HIDDEN STORIES'), (470, 244, 3, 'A BETTER DAY')]):
    svg += f'''<g id="frame-{i+1}" transform="translate({x} {y}) translate(45 185) scale(1.13) translate(-45 -185) rotate({angle} 45 88)">
     <path d="M9 8Q9-4 22-3l67 3q10 1 11 13l-2 163q0 11-12 14l-73-5q-9-2-9-13Z" fill="#27392e" stroke="#111810" stroke-width="4"/>
     <path d="M5 9Q5-2 17-2h67q10 1 10 13v162q-1 12-12 12H16Q5 184 5 173Z" fill="url(#chrome)" stroke="#101811" stroke-width="2.5"/>
     <path d="M9 10Q9 2 17 2h65q8 0 8 9v161q0 8-8 8H17q-8 0-8-8Z" fill="#121b17" stroke="#090f0c" stroke-width="2"/>
     <g transform="translate(9 2)" clip-path="url(#s1)">{scenes[i]}<path d="M0 132q45-8 90 3v41H0Z" fill="#111a16" opacity=".8"/><path d="M4 0H48L8 158H0V0Z" fill="url(#glass)"/><text x="7" y="150" fill="#fff" font-family="sans-serif" font-size="8" font-weight="800">{label}</text><text x="7" y="161" fill="#e6efdf" font-family="sans-serif" font-size="6">▶  ILLUSTRATED EXAMPLE</text></g>
     <path d="M37 5h23q3 0 3 3t-3 3H37q-3 0-3-3t3-3Z" fill="#172019"/><path d="M13 16l1 119" stroke="#f2fff0" stroke-opacity=".4" stroke-width="1"/><circle cx="49" cy="113" r="12" fill="#0a120e" opacity=".63"/><path d="M46 107l9 6-9 6Z" fill="#fff"/>
    </g>'''

svg += '''<g id="pencil-marks" fill="none" stroke="#11190e" stroke-linecap="round" stroke-linejoin="round"><path d="M28 448q6 13 21 15m-5-22q7 11 20 13M640 522q18-4 26-18M119 535l29 5m396 39 29 4" stroke-width="1.5"/><path d="M43 451q30 8 63 11m-35-5 26 6m189-4 80 11m-63-7 37 5m75 8 86 11m-60-5 40 6M639 526q16-2 25-12m-20 15q16-4 25-15" stroke-width="1" opacity=".65"/><path d="M381 45l20-8m-75 41 12-5m139 40 5 17" stroke-width="1" opacity=".6"/></g></svg>'''

svg_path = root / 'machine.svg'
svg_path.write_text(svg.replace(' class="machine"', '', 1), encoding='utf-8')
page = root / 'index.html'
html = page.read_text(encoding='utf-8')
if '<svg xmlns="http://www.w3.org/2000/svg" class="machine"' in html:
    start = html.index('<svg xmlns="http://www.w3.org/2000/svg" class="machine"')
    end_note = html.index('<span class="hand out-note">', start)
    end = html.rfind('</svg>', start, end_note) + len('</svg>')
    html = html[:start] + svg + html[end:]
else:
    start = html.index('<div class="machine-wrap reference-wrap">')
    end = html.index('</div></section>', start)
    html = (html[:start] + '<div class="machine-wrap"><p class="hand machine-note">IDEAS<br>SCRIPTS<br>VISUALS<br>VOICE<br>AUTO EDIT<br>PUBLISH <span>↙</span></p>' + svg +
            '<span class="hand out-note">SHORT<br>VIDEOS<br>OUT! ↗</span>' +
            '<button class="motion-toggle" type="button" aria-pressed="false">Pause animation <span aria-hidden="true">Ⅱ</span></button>' + html[end:])
    html = html.replace('</body></html>', '<script src="machine.js"></script></body></html>')
page.write_text(html, encoding='utf-8')
