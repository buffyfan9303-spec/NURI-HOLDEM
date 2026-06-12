# -*- coding: utf-8 -*-
import io
p = 'src/components/features/CommunityTab.tsx'
s = io.open(p, encoding='utf-8').read()

# import 추가
old = "import Icon from '../atoms/Icon';"
assert old in s, 'import anchor'
s = s.replace(old, old + "\nimport VenueThumb from '../atoms/VenueThumb';", 1)

# 매장 아이콘 → VenueThumb(사진 우선, 폴백 딥톤 타일)
old = """                {/* 매장 아이콘 */}
                <div
                  className="w-12 h-12 shrink-0 rounded-card flex items-center justify-center text-lg font-bold text-white relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${venue.themeColor ?? '#5A6175'}, #0a0c0f)` }}
                  aria-hidden
                >
                  <span className="opacity-30 text-2xl absolute -top-1 -left-1">♠</span>
                  <span className="relative text-base">{venue.name[0]}</span>
                </div>"""
new = """                {/* 매장 썸네일 — 사진 우선, 없으면 딥톤 이니셜 타일 */}
                <VenueThumb name={venue.name} imageUrl={venue.imageUrl ?? venue.images?.[0]} />"""
assert old in s, 'thumb'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('communitytab ok')
