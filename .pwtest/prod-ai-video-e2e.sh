#!/bin/bash
# AI 成片 · 生产端到端回归探针
#
# 取管理员 token → 校验 /api/admin/models 配置层 → 调 /api/ai-video 真实出片
# → 断言响应头 engine=llm / template 正确 → ffmpeg 全解码校验。
#
# 用法： bash .pwtest/prod-ai-video-e2e.sh [template ...]     # 默认 growth novel
set -euo pipefail

ENV=/Users/aiven/Desktop/AI/codex/projects/.env.production
U=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV" | cut -d= -f2- | tr -d '"')
K=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV" | cut -d= -f2- | tr -d '"')
PROD=https://www.clipopai.com
OUT=/tmp/clipop-e2e
mkdir -p "$OUT"

TEMPLATES=("$@")
[ ${#TEMPLATES[@]} -eq 0 ] && TEMPLATES=(growth novel)
TOPICS=(晨间习惯 "深夜书店的最后一盏灯")

# 1) 管理员 token（magiclink 换取 access_token，不落盘）
R=$(curl -s -X POST "$U/auth/v1/admin/generate_link" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"admin@126.com"}')
HASH=$(printf '%s' "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hashed_token',''))")
[ -n "$HASH" ] || { echo "FAIL: no hashed_token"; exit 1; }
TOKEN=$(curl -s -X POST "$U/auth/v1/verify" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"token_hash\":\"$HASH\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
[ -n "$TOKEN" ] || { echo "FAIL: no access_token"; exit 1; }
echo "== token ok (len=${#TOKEN}) =="

# 2) 配置层：三家密钥来源应为 db
echo "== GET /api/admin/models =="
curl -s -o "$OUT/models.json" -w "http=%{http_code}\n" "$PROD/api/admin/models" -H "Authorization: Bearer $TOKEN"
python3 - "$OUT/models.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
print('  activeLlm =', d.get('activeLlm'))
for p in d.get('providers',[]):
    for f in p.get('fields',[]):
        if f.get('secret'):
            print("  %-12s %-22s source=%s" % (p['id'], f['key'], f['source']))
PY

# 3) 逐模版真实出片
FAIL=0
for i in "${!TEMPLATES[@]}"; do
  T="${TEMPLATES[$i]}"; TOPIC="${TOPICS[$i]:-${TOPICS[0]}}"
  echo "== POST /api/ai-video template=$T =="
  curl -s -X POST "$PROD/api/ai-video" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -D "$OUT/$T.headers" -o "$OUT/$T.mp4" \
    -d "{\"topic\":\"$TOPIC\",\"locale\":\"zh\",\"template\":\"$T\"}"
  H=$(tr -d '\r' < "$OUT/$T.headers")
  echo "$H" | grep -iE '^(x-ai-video-|content-type|content-length)' | sed 's/^/  /'
  ENGINE=$(printf '%s' "$H" | awk 'tolower($1)=="x-ai-video-engine:"{print $2}')
  GOTTPL=$(printf '%s' "$H" | awk 'tolower($1)=="x-ai-video-template:"{print $2}')
  if ffmpeg -v error -i "$OUT/$T.mp4" -f null - 2>/dev/null; then DEC=ok; else DEC=FAIL; fi
  ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration \
    -of default=noprint_wrappers=1 "$OUT/$T.mp4" 2>/dev/null | sed 's/^/  /'
  if [ "$ENGINE" = "llm" ] && [ "$GOTTPL" = "$T" ] && [ "$DEC" = "ok" ]; then
    echo "  RESULT: PASS"
  else
    echo "  RESULT: FAIL (engine=$ENGINE template=$GOTTPL decode=$DEC)"; FAIL=1
  fi
done
exit $FAIL