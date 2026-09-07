#!/bin/zsh
# Resume AthleteOS longitudinal stress test (convs 14-18 + athlete B).
# Run from repo root in a normal terminal (not agent sandbox):
#   zsh scripts/stress-longitudinal/resume.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
vals={}
for line in Path('.env.local').read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k,v=line.split('=',1); vals[k.strip()]=v.strip().strip('"').strip("'")
openai=[f"{k}={vals[k]}" for k in vals if k.startswith('OPENAI_')]
db=vals['DATABASE_URL']
Path('.env.stress-longitudinal.local').write_text(
    f"DATABASE_URL={db}\nDATABASE_URL_UNPOOLED={vals.get('DATABASE_URL_UNPOOLED', db)}\nATHLETEOS_ENV=development\n"+"\n".join(openai)+"\n"
)
print('DB host:', urlparse(db).hostname)
print(Path('scripts/stress-longitudinal/out/state.json').read_text())
PY
export STRESS_MAX_N=18
exec node --import ./scripts/stress-longitudinal/alias-register.mjs --experimental-strip-types scripts/stress-longitudinal/run.mts
