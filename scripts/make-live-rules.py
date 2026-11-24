#!/usr/bin/env python3
"""Builds the dated rules-panel exhibit for the live HouseBets road page bundle of 19 Oct 2026 (bundle last-modified
Fri, 16 Oct 2026 09:18:09 GMT), next to the 10 Oct exhibit E02-road-rules-panel-2026-10-10.json (run once by the auditor; the output is pinned in
src/loader.ts and listed in MANIFEST.md#evidence). Sources (outside this package, HouseBets workshop):
  W/bundles/platform-housegames-road-game.js                    the 10 Oct copy (E02-road-rules-panel-2026-10-10.json was cut from it)
  W/bundles/live-2026-10-19/platform-housegames-road-game.js    the live copy, fetched 19 Oct 2026
  W/bundles/live-2026-10-19/platform-housegames-road-game.headers  its HTTP response headers (only date, last-modified,
                                                                       etag and content-type are copied; no cookie is kept)
W = housebets-new-deal-2026-10-09/, the HouseBets workshop folder two levels above the package (or pass it as the first argument).
The English text of a key is its first occurrence in the bundle: the same reading reproduces every key of E02-road-rules-panel-2026-10-10.json from the
10 Oct copy (checked below, the script stops if it does not)."""
import hashlib, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); PKG = os.path.dirname(HERE)
W = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(PKG, '..', '..', 'housebets-new-deal-2026-10-09'))
BUNDLE = 'platform-housegames-road-game.js'
OLD = os.path.join(PKG, 'evidence', 'E02-road-rules-panel-2026-10-10.json')
OUT = 'E08-road-rules-panel-live-2026-10-19.json'
sha = lambda b: hashlib.sha256(b).hexdigest()

def firsts(text):
    d = {}
    for m in re.finditer(r'[,{]([A-Za-z_$][A-Za-z0-9_$]*):"((?:[^"\\]|\\.)*)"', text):
        d.setdefault(m.group(1), m.group(2))
    return d
def calls(text):   # the rules keys the page code asks its translator for: ("rulesX" ...
    return sorted(set(re.findall(r'\("(rules[A-Za-z0-9]*)"', text)))

old_raw = open(os.path.join(W, 'bundles', BUNDLE), 'rb').read(); old_t = old_raw.decode('utf-8')
new_p = os.path.join(W, 'bundles', 'live-2026-10-19', BUNDLE); new_raw = open(new_p, 'rb').read(); new_t = new_raw.decode('utf-8')
hdr_p = os.path.join(W, 'bundles', 'live-2026-10-19', BUNDLE.replace('.js', '.headers'))
hdr = {}
for line in open(hdr_p, encoding='utf-8'):
    k, _, v = line.partition(':')
    if k.strip().lower() in ('date', 'last-modified', 'etag', 'content-type'): hdr[k.strip().lower()] = v.strip()

old_ex = json.load(open(OLD, encoding='utf-8'))
old_panel = old_ex['rulesPanelEnglish']
assert old_ex['source']['sha256'] == sha(old_raw), 'the 10 Oct copy is not the bundle E02-road-rules-panel-2026-10-10.json was cut from'
F_old, F_new = firsts(old_t), firsts(new_t)
assert all(F_old.get(k) == v for k, v in old_panel.items()), 'first-occurrence reading does not reproduce E02-road-rules-panel-2026-10-10.json'
assert int(re.search(r'W/"([0-9a-f]+)-', hdr['etag']).group(1), 16) == len(new_raw), 'live copy size differs from its etag'

added_calls = sorted(set(calls(new_t)) - set(calls(old_t))); removed_calls = sorted(set(calls(old_t)) - set(calls(new_t)))
keys = list(old_panel.keys()) + [k for k in added_calls if k not in old_panel]
keys += [k for k in sorted(F_new) if k.startswith('rules') and k not in F_old and k not in keys]
panel = {k: F_new.get(k) for k in keys}
changed = {k: {'E02 (10 Oct)': F_old.get(k), 'E08 (19 Oct)': F_new.get(k)} for k in keys if F_old.get(k) != F_new.get(k)}
obj = {
  'exhibit': 'E08',
  'what': 'HouseBets road game page: the rules panel text (English) as shipped in the bundle the live page URL served on 19 Oct 2026 '
          '(last-modified Fri, 16 Oct 2026 09:18:09 GMT, the same last-modified as the other ten House Games bundles fetched that day). E02 is the same panel in the 10 Oct copy, '
          'the bundle in force while this package\'s rounds were captured (12-13 Oct).',
  'source': {'file': 'bundles/live-2026-10-19/' + BUNDLE + ' (HouseBets workshop)', 'url': '/static/' + BUNDLE, 'sha256': sha(new_raw), 'bytes': len(new_raw),
             'lastModified': hdr.get('last-modified'), 'etag': hdr.get('etag'), 'fetchedAt': hdr.get('date'), 'contentType': hdr.get('content-type'),
             'loadedByLivePage': 'not re-checked on 19 Oct; the same /static URL the live page loaded on 10 Oct (bundles/LIVE-BUNDLES.md)'},
  'previous': {'exhibit': 'E02', 'file': 'evidence/E02-road-rules-panel-2026-10-10.json', 'bundleSha256': sha(old_raw), 'bytes': len(old_raw)},
  'rulesPanelEnglish': panel,
  'changedSinceE02': changed,
  'panelKeysCalled': {'note': 'rules keys the page code passes to its translator, ("rulesX" ...), in the 10 Oct copy vs the live copy',
                      'added': added_calls, 'removed': removed_calls},
}
open(os.path.join(PKG, 'evidence', OUT), 'w', encoding='utf-8').write(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')
print('wrote', OUT, 'changed keys:', ', '.join(changed) or 'none', '| calls added:', added_calls, 'removed:', removed_calls)
