#!/usr/bin/env python3
"""Builds evidence/ for the HouseBets Hubie's Road package from the HouseBets workshop (run once by the auditor; the outputs are
pinned in src/loader.ts and listed in MANIFEST.md#evidence). Sources (outside this package):
  W = housebets-new-deal-2026-10-09/, the HouseBets workshop folder two levels above the package (capture rigs, bundles, 12 Oct capture, 13 Oct full capture + ledger)
Every exhibit records its source path and the sha256 of the source bytes it was cut from."""
import hashlib, json, os, re, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); PKG = os.path.dirname(HERE)
W = os.path.abspath(os.path.join(PKG, '..', '..', 'housebets-new-deal-2026-10-09'))
EV = os.path.join(PKG, 'evidence'); os.makedirs(EV, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
def dump(name, obj):
    open(os.path.join(EV, name), 'w', encoding='utf-8').write(json.dumps(obj, indent=2, ensure_ascii=False) + '\n'); print('wrote', name)

prim_rel = 'data/housebets-road-phaseA-auto1-6500rounds.json'
prim_raw = open(os.path.join(PKG, prim_rel), 'rb').read(); prim = json.loads(prim_raw)
sr = prim['meta']['staticReads']
src_note = {'file': prim_rel, 'sha256': sha(prim_raw)}

# E01 the server's published road spec, as answered to the capture (GET /housegames/road/fairness, 13 Oct 2026)
dump('E01-road-fairness-spec-2026-10-13.json', {'exhibit': 'E01', 'what': "HouseBets House Games Hubie's Road: the server's published fairness spec (GET /housegames/road/fairness)",
     'source': dict(src_note, field="meta.staticReads['/road/fairness']"), 'answer': sr['/road/fairness']})
# E03 the limits answer (min bet, max bet, max win, wallet decimals)
dump('E03-road-limits-2026-10-13.json', {'exhibit': 'E03', 'what': 'HouseBets road limits (GET /housegames/limits/road)',
     'source': dict(src_note, field="meta.staticReads['/limits/road']"), 'answer': sr['/limits/road']})

# E02 the game page's rules panel, as shipped in the road bundle (bundles/LIVE-BUNDLES.md: the page's use of it is INFERRED, not checked)
bp = os.path.join(W, 'bundles', 'platform-housegames-road-game.js'); braw = open(bp, 'rb').read(); bt = braw.decode('utf-8', 'replace')
strings = {}
for key in re.findall(r'(rulesRoad[A-Za-z]+|rulesBetRange|rulesLimitsH):"', bt):
    m = re.search(key + r':"((?:[^"\\]|\\.)*)"', bt)
    if m and key not in strings: strings[key] = m.group(1)
assert 'rulesRoadReturn' in strings and 'rulesRoadIdle' in strings and 'rulesRoadFair' in strings, 'bundle text moved'
dump('E02-road-rules-panel-2026-10-10.json', {'exhibit': 'E02', 'what': "HouseBets Hubie's Road game page: the rules panel text (English), as shipped in the road bundle",
     'source': {'file': 'bundles/platform-housegames-road-game.js (HouseBets workshop)', 'sha256': sha(braw), 'bytes': len(braw), 'checkedOnLivePage': 'no: bundles/LIVE-BUNDLES.md (10 Oct 2026) lists the road page as loading this file by inference (no "2" file exists), not as checked on the page'},
     'rulesPanelEnglish': strings})

# E04 the platform bet history rows of every round in this package's scored 13 Oct datasets (the 12 Oct file is not in it)
lp = os.path.join(W, 'capture-full-2026-10-12', 'ledger', 'ledger-2026-10-13-final.json'); lraw = open(lp, 'rb').read(); L = json.loads(lraw)
led = {x['id']: x for x in L['items']}
files = ['housebets-road-phaseA-auto1-6500rounds.json', 'supplementary/housebets-road-phaseC-elevated-150rounds.json',
         'supplementary/housebets-road-phaseC-elevated-10usd-150rounds.json', 'supplementary/housebets-road-phaseD-playerseeds-200rounds.json',
         'supplementary/housebets-road-phaseE-multistep-600rounds.json']
rows, missing = [], []
for f in files:
    for r in json.load(open(os.path.join(PKG, 'data', f)))['rounds']:
        rid = next(q['response']['game']['roundId'] for q in r['requests'] if q['path'] == '/road/bet' and q.get('status') == 200)
        x = led.get(rid)
        if x is None: missing.append(rid); continue
        rows.append({k: x[k] for k in ('id', 'game', 'placed_at', 'stake', 'payout', 'currency', 'status')})
assert not missing, f'{len(missing)} rounds not in the ledger'
dump('E04-road-bet-history-2026-10-13.json', {'exhibit': 'E04', 'what': 'HouseBets bet history (GET /api/v1/transactions/bets?category=casino) rows of the 7,600 scored road rounds of the 13 Oct phases of this package (A, C, C $10, D, E); the 67 rounds of the 12 Oct file are not in it; fields id = roundId, stake, payout, status',
     'source': {'file': 'capture-full-2026-10-12/ledger/ledger-2026-10-13-final.json (HouseBets workshop)', 'sha256': sha(lraw), 'readAt': L['readAt'], 'entries': len(L['items'])},
     'rows': sorted(rows, key=lambda r: r['placed_at'])})

# E05 the whole-account reconciliation (every captured round of all 11 games against the history and the wallet): the full
# output of the workshop's reconcile-full.py over the final ledger read, re-run here (it reads local files only)
import subprocess
CF = os.path.join(W, 'capture-full-2026-10-12')
cmd = ['python3', '-I', 'reconcile-full.py', '--ledger', 'ledger/ledger-2026-10-13-final.json', '--before', '986.84718000']   # H2: the exact command
run = subprocess.run(cmd, cwd=CF, capture_output=True, text=True)
assert run.returncode == 0 and run.stdout.rstrip().endswith('RECONCILED'), run.stdout[-500:] + run.stderr[-500:]
head = (f"# E05 — HouseBets account reconciliation: output of `{' '.join(cmd)}` run in the HouseBets workshop's capture-full-2026-10-12/\n"
        f"# reconcile-full.py sha256 {sha(open(os.path.join(CF, 'reconcile-full.py'), 'rb').read())}; ledger-2026-10-13-final.json sha256 {sha(lraw)} (read {L['readAt']})\n"
        f"# exit {run.returncode}; per-dataset rows = rounds, staked, paid, net (exact decimals of the JSON text)\n")
open(os.path.join(EV, 'E05-account-reconcile-2026-10-13.txt'), 'w', encoding='utf-8').write(head + run.stdout); print('wrote E05')

# E06 the empty-client-seed control of Phase D (POST /change_seed with clientSeed "")
dp = os.path.join(PKG, 'data', 'supplementary', 'housebets-road-phaseD-playerseeds-200rounds.json'); draw = open(dp, 'rb').read()
dump('E06-road-empty-seed-control-2026-10-13.json', {'exhibit': 'E06', 'what': "Phase D empty-seed control: the server's answer to POST /change_seed {clientSeed: \"\"}",
     'source': {'file': 'data/supplementary/housebets-road-phaseD-playerseeds-200rounds.json', 'sha256': sha(draw), 'field': 'meta.emptySeedControl'}, 'record': json.loads(draw)['meta']['emptySeedControl']})

# E07 the round left open on purpose on 12 Oct and the server's close of it (the abandoned-round rule, E01 rules[6])
hp = os.path.join(PKG, 'data', 'supplementary', 'housebets-road-full-67rounds-withopen.json'); hraw = open(hp, 'rb').read(); H = json.loads(hraw)
lo = H['meta']['leftOpen']; r = next(x for x in H['rounds'] if x.get('closedByServer'))
states = [{'at': q.get('at'), 'path': q['path'], 'body': {k: v for k, v in q['body'].items() if k != 'generation'}, 'game': {k: q['response']['game'].get(k) for k in ('roundId', 'active', 'difficulty', 'traps', 'lanes', 'stake', 'position', 'multiplier', 'value', 'outcome', 'payout', 'createdAt')}}
          for q in r['requests'] if q.get('status') == 200 and isinstance(q.get('response'), dict) and isinstance(q['response'].get('game'), dict)]
dg = r['detail']['response']['game']
dump('E07-road-abandoned-round-2026-10-13.json', {'exhibit': 'E07', 'what': 'The road round left open on purpose on 12 Oct 2026 (one lane crossed), the checks that found it still active, and the server\'s own record of finishing it',
     'source': {'file': 'data/supplementary/housebets-road-full-67rounds-withopen.json', 'sha256': sha(hraw), 'fields': ['meta.leftOpen', 'meta.openChecks', 'rounds[closedByServer]']},
     'leftOpenAt': lo['at'], 'openChecks': [{k: c.get(k) for k in ('at', 'hoursSinceLeft', 'stillActive')} for c in H['meta'].get('openChecks', [])],
     'roundAsLeft': states, 'serverRecord': {k: dg.get(k) for k in ('roundId', 'active', 'difficulty', 'traps', 'lanes', 'stake', 'position', 'field', 'trapLane', 'multiplier', 'value', 'outcome', 'payout', 'fairness', 'createdAt', 'settledAt')},
     'betHistoryRow': {k: led[dg['roundId']][k] for k in ('id', 'game', 'placed_at', 'stake', 'payout', 'currency', 'status')},
     'betHistorySource': {'file': 'capture-full-2026-10-12/ledger/ledger-2026-10-13-final.json (HouseBets workshop)', 'sha256': sha(lraw), 'readAt': L['readAt']}})
