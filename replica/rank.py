# Ranks review themes: low ratings and recent reviews weigh more; thin themes are flagged.
import csv, json, re, sys
from collections import defaultdict
rows = [r for r in csv.DictReader(open('reviews.csv')) if r['url'].startswith('http')]
themes = {k: [re.compile(p, re.I) for p in v] for k, v in json.load(open('themes.json')).items()}
def weight(r):
    w = 1.0
    if r['rating'] in ('1', '2'): w += 1.0
    elif r['rating'] == '3': w += 0.5
    y = r['date'][:4]
    if y.isdigit():
        w += 0.5 if int(y) >= 2025 else (0.25 if int(y) >= 2023 else 0)
    else: w += 0.25  # recent-looking page date without a year
    return w
hits = defaultdict(list); unmatched = []
for r in rows:
    found = [k for k, ps in themes.items() if any(p.search(r['text']) for p in ps)]
    for k in found: hits[k].append(r)
    if not found and r['rating'] in ('1', '2'): unmatched.append(r)
out = [f"# Competitor review themes\n\n{len(rows)} reviews, {len({r['app'] for r in rows})} apps, sources: {', '.join(sorted({r['source'] for r in rows}))}.\n"]
for k, rs in sorted(hits.items(), key=lambda kv: -sum(weight(r) for r in kv[1])):
    srcs = {r['source'].split(' (')[0].replace(' IN', '').replace(' US', '') for r in rs}
    apps = {r['app'] for r in rs}
    thin = ' (THIN)' if len(rs) < 3 or len(srcs) < 2 else ''
    out.append(f"\n## {k}{thin}\nscore {sum(weight(r) for r in rs):.1f} · {len(rs)} reviews · {len(srcs)} source types ({', '.join(sorted(srcs))}) · apps: {', '.join(sorted(apps))}\n")
    for r in sorted(rs, key=weight, reverse=True)[:4]:
        out.append(f"- \"{r['text']}\" ({r['app']}, {r['source']}, {r['date']}{', ' + r['rating'] + '★' if r['rating'] else ''}) {r['url']}")
out.append("\n## Low ratings that matched no theme (read by hand)\n" + "\n".join(f"- \"{r['text']}\" ({r['app']}) {r['url']}" for r in unmatched))
open(sys.argv[1] if len(sys.argv) > 1 else 'feedback.md', 'w').write('\n'.join(out))
print('\n'.join(out)[:6000])
