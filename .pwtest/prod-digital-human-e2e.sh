#!/bin/bash
# 数字人口播 + 声音克隆 · 生产端到端回归探针
#
# 取管理员 token → 校验 /api/digital-human/capabilities
#   → 预设音色试听（拿到公网 wav）
#   → 票据直传 Supabase → voice-enrollment 复刻音色 → 复刻音色试听
#   → /api/digital-human/generate 提交 wan2.2-s2v
#   → /api/digital-human/status 轮询 → 下载成片 → ffmpeg 全解码校验
#
# 用法： bash .pwtest/prod-digital-human-e2e.sh
set -uo pipefail

ENV=/Users/aiven/Desktop/AI/codex/projects/.env.production
U=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV" | cut -d= -f2- | tr -d '"')
K=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV" | cut -d= -f2- | tr -d '"')
PROD=${PROD:-https://www.clipopai.com}
OUT=/tmp/clipop-dh-e2e
mkdir -p "$OUT"
FAIL=0
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }

# 1) 管理员 token
R=$(curl -s -X POST "$U/auth/v1/admin/generate_link" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d '{"type":"magiclink","email":"admin@126.com"}')
HASH=$(printf '%s' "$R" | J "['hashed_token']")
[ -n "$HASH" ] || { echo "FAIL: no hashed_token"; exit 1; }
TOKEN=$(curl -s -X POST "$U/auth/v1/verify" \
  -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
  -d "{\"type\":\"magiclink\",\"token_hash\":\"$HASH\"}" | J "['access_token']")
[ -n "$TOKEN" ] || { echo "FAIL: no access_token"; exit 1; }
echo "== token ok (len=${#TOKEN}) =="
AH="Authorization: Bearer $TOKEN"

# 2) 能力探测
echo "== GET /api/digital-human/capabilities =="
curl -s -o "$OUT/cap.json" -w "  http=%{http_code}\n" "$PROD/api/digital-human/capabilities"
AVAIL=$(cat "$OUT/cap.json" | J "['available']")
MODEL=$(cat "$OUT/cap.json" | J "['model']")
PROV=$(cat "$OUT/cap.json" | J "['provider']")
VC=$(cat "$OUT/cap.json" | J "['voiceCloneAvailable']")
MAXC=$(cat "$OUT/cap.json" | J "['maxNarrationChars']")
echo "  available=$AVAIL provider=$PROV model=$MODEL voiceClone=$VC maxChars=$MAXC"
[ "$AVAIL" = "True" ] || { echo "FAIL: provider unavailable"; FAIL=1; }

# 3) 预设音色试听（同时得到一段真实 wav 作克隆参考）
echo "== POST voice preview (Cherry) =="
curl -s -X POST "$PROD/api/digital-human/voice" -H "$AH" -H 'Content-Type: application/json' \
  -o "$OUT/preview.json" -w "  http=%{http_code}\n" \
  -d '{"action":"preview","voice":"Cherry","text":"你好，很高兴认识你，这是我的声音预览。"}'
PREV=$(cat "$OUT/preview.json" | J "['audioUrl']")
[ -n "$PREV" ] || { echo "FAIL: no preset audioUrl"; cat "$OUT/preview.json"; FAIL=1; }
if [ -n "$PREV" ]; then
  curl -s -o "$OUT/ref.wav" "$PREV"
  SZ=$(stat -f%z "$OUT/ref.wav" 2>/dev/null || echo 0)
  echo "  ref audio bytes=$SZ"
  [ "$SZ" -gt 10000 ] || { echo "FAIL: ref audio too small"; FAIL=1; }
fi

# 4) 复刻音色：票据直传 → voice-enrollment
VOICE="Cherry"
if [ "$VC" = "True" ] && [ -s "$OUT/ref.wav" ]; then
  echo "== voice clone: ticket → PUT → enrollment =="
  curl -s -X POST "$PROD/api/ai-tools/upload" -H "$AH" -H 'Content-Type: application/json' \
    -o "$OUT/ticket.json" -d '{"action":"ticket","filename":"e2e-ref.wav"}'
  UPURL=$(cat "$OUT/ticket.json" | J "['uploadUrl']")
  OBJ=$(cat "$OUT/ticket.json" | J "['objectPath']")
  if [ -n "$UPURL" ] && [ -n "$OBJ" ]; then
    PC=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$UPURL" -H 'Content-Type: audio/wav' --data-binary "@$OUT/ref.wav")
    echo "  PUT=$PC path=$OBJ"
    curl -s -X POST "$PROD/api/digital-human/voice" -H "$AH" -H 'Content-Type: application/json' \
      -o "$OUT/clone.json" -w "  enrollment http=%{http_code}\n" \
      -d "{\"referenceObjectPath\":\"$OBJ\",\"name\":\"e2e\"}"
    CLONED=$(cat "$OUT/clone.json" | J "['voice']['voiceId']")
    if [ -n "$CLONED" ]; then
      VOICE="$CLONED"; echo "  voiceId=$CLONED"
      curl -s -X POST "$PROD/api/digital-human/voice" -H "$AH" -H 'Content-Type: application/json' \
        -o "$OUT/clone-preview.json" -w "  cloned preview http=%{http_code}\n" \
        -d "{\"action\":\"preview\",\"voice\":\"$CLONED\",\"text\":\"你好，很高兴认识你，这是我的声音预览。\"}"
      CP=$(cat "$OUT/clone-preview.json" | J "['audioUrl']")
      [ -n "$CP" ] || { echo "FAIL: no cloned preview url"; FAIL=1; }
      if [ -n "$CP" ]; then
        curl -s -o "$OUT/clone-preview.wav" "$CP"
        echo "  cloned preview bytes=$(stat -f%z "$OUT/clone-preview.wav" 2>/dev/null || echo 0)"
      fi
    else
      echo "FAIL: enrollment returned no voiceId"; cat "$OUT/clone.json" | head -c 300; echo; FAIL=1
    fi
  else
    echo "FAIL: ticket failed"; cat "$OUT/ticket.json" | head -c 200; echo; FAIL=1
  fi
fi

# 5) 生成数字人视频（用公开 https 人像，避免本地文件依赖）
echo "== POST /api/digital-human/generate (voice=$VOICE) =="
IMG="${IMG:-$PROD/avatars/cn-f.jpg}"
curl -s -X POST "$PROD/api/digital-human/generate" -H "$AH" -H 'Content-Type: application/json' \
  -o "$OUT/gen.json" -w "  http=%{http_code}\n" \
  -d "{\"imageUrl\":\"$IMG\",\"text\":\"别划走！这款好物用过就回不去了，现在下单还有限时特惠！\",\"voice\":\"$VOICE\",\"resolution\":\"480P\"}"
TASK=$(cat "$OUT/gen.json" | J "['taskId']")
if [ -z "$TASK" ]; then echo "FAIL: no taskId"; cat "$OUT/gen.json" | head -c 400; echo; FAIL=1; else echo "  taskId=$TASK"; fi

# 6) 轮询状态
VIDEO=""
if [ -n "$TASK" ]; then
  for i in $(seq 1 40); do
    sleep 10
    curl -s -o "$OUT/st.json" "$PROD/api/digital-human/status?taskId=$TASK" -H "$AH"
    ST=$(cat "$OUT/st.json" | J "['status']")
    echo "  poll#$i $ST"
    if [ "$ST" = "succeeded" ]; then VIDEO=$(cat "$OUT/st.json" | J "['videoUrl']"); break; fi
    if [ "$ST" = "failed" ]; then echo "FAIL: $(cat "$OUT/st.json")"; FAIL=1; break; fi
  done
fi

# 7) 成片校验
if [ -n "$VIDEO" ]; then
  curl -s -o "$OUT/out.mp4" "$VIDEO"
  echo "  video bytes=$(stat -f%z "$OUT/out.mp4" 2>/dev/null || echo 0)"
  if ffmpeg -v error -i "$OUT/out.mp4" -f null - 2>/dev/null; then DEC=ok; else DEC=FAIL; FAIL=1; fi
  ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration \
    -of default=noprint_wrappers=1 "$OUT/out.mp4" 2>/dev/null | sed 's/^/  /'
  echo "  decode=$DEC"
else
  echo "FAIL: no video produced"; FAIL=1
fi

echo ""
[ "$FAIL" = "0" ] && echo "DIGITAL_HUMAN_E2E_PASS" || echo "DIGITAL_HUMAN_E2E_FAIL"
exit $FAIL