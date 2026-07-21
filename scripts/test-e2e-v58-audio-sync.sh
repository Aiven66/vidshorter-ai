#!/usr/bin/env bash
# v58 Production E2E Test — Audio Sync + Content Position + Audio Content
#
# This script verifies that v58 (muxed single-input + -ss) correctly:
#   1. Cuts to the correct startTime position (different startTime → different
#      first-frame MD5 — v57 failed this because YouTube ignored `begin` param)
#   2. Audio/video sync (drift < 1s — v56 failed with 5.35s drift)
#   3. Audio has real content (not silence — v55/v56 had "no sound" bug)
#
# Usage: bash scripts/test-e2e-v58-audio-sync.sh
set -uo pipefail

PRODUCTION_URL="${PRODUCTION_URL:-https://clipopai.vercel.app}"
TEST_VIDEO_ID="${TEST_VIDEO_ID:-dQw4w9WgXcQ}" # Rick Astley - Never Gonna Give You Up
# Use two different startTimes to verify content position differs
START_TIME_1="${START_TIME_1:-30}"
START_TIME_2="${START_TIME_2:-60}"
DURATION="${DURATION:-10}"

OUTPUT_DIR="/tmp/v58-e2e-$$"
mkdir -p "$OUTPUT_DIR"

log() { printf '\n=== %s ===\n' "$1"; }
pass() { printf '  ✅ PASS: %s\n' "$1"; }
fail() { printf '  ❌ FAIL: %s — %s\n' "$1" "${2:-}"; exit 1; }

command -v ffprobe >/dev/null || fail "ffprobe required (brew install ffmpeg)"
command -v ffmpeg >/dev/null || fail "ffmpeg required"
command -v curl >/dev/null || fail "curl required"
command -v python3 >/dev/null || fail "python3 required"

log "v58 E2E Test Setup"
echo "  Production URL: $PRODUCTION_URL"
echo "  Test video: $TEST_VIDEO_ID"
echo "  startTimes: $START_TIME_1 and $START_TIME_2 (duration: ${DURATION}s)"
echo "  Output dir: $OUTPUT_DIR"

# ─── STEP 0: Verify build version ─────────────────────────────────────────
log "Step 0: Verify production build version"
HTML=$(curl -sS -m 15 "${PRODUCTION_URL}/?_=${RANDOM}")
VERSION=$(echo "$HTML" | grep -oE 'data-build-version="[^"]+"' | head -1 | sed 's/data-build-version="//;s/"//')
[ -z "$VERSION" ] && fail "build version" "no data-build-version found in HTML"
echo "$VERSION" | grep -q "v58" || fail "build version" "expected v58, got: $VERSION"
pass "production build is v58: $VERSION"

# ─── STEP 1: Resolve stream URL ───────────────────────────────────────────
log "Step 1: Resolve YouTube stream URL"
RESOLVE_RESP=$(curl -sS -m 60 "${PRODUCTION_URL}/api/yt-stream?videoId=${TEST_VIDEO_ID}")
STREAM_URL=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('streamUrl',''))" 2>/dev/null || echo "")
[ -z "$STREAM_URL" ] && fail "resolve stream" "no streamUrl in response: $(echo "$RESOLVE_RESP" | head -c 300)"
USER_AGENT=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('userAgent',''))" 2>/dev/null || echo "")
VISITOR_DATA=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('visitorData',''))" 2>/dev/null || echo "")
X_CLIENT_NAME=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('xClientName','1'))" 2>/dev/null || echo "1")
CLIENT_VERSION=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clientVersion',''))" 2>/dev/null || echo "")
CLIENT_NAME=$(echo "$RESOLVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('client','direct'))" 2>/dev/null || echo "direct")
pass "resolved stream: ${STREAM_URL:0:80}..."

# ─── STEP 2: Cut clip at startTime_1 ────────────────────────────────────────
log "Step 2: Cut clip at startTime=$START_TIME_1"
OUTPUT_1="${OUTPUT_DIR}/clip-${START_TIME_1}s.mp4"
HTTP_CODE=$(curl -sS -m 180 -o "$OUTPUT_1" -w "%{http_code}" \
  -X POST "${PRODUCTION_URL}/api/cut-clip" \
  -H "Content-Type: application/json" \
  -d "{
    \"streamUrl\": \"${STREAM_URL}\",
    \"userAgent\": \"${USER_AGENT}\",
    \"visitorData\": \"${VISITOR_DATA}\",
    \"xClientName\": \"${X_CLIENT_NAME}\",
    \"clientVersion\": \"${CLIENT_VERSION}\",
    \"clientName\": \"${CLIENT_NAME}\",
    \"videoId\": \"${TEST_VIDEO_ID}\",
    \"startTime\": ${START_TIME_1},
    \"duration\": ${DURATION},
    \"endTime\": $((START_TIME_1 + DURATION))
  }")
[ "$HTTP_CODE" = "200" ] || fail "cut clip @ ${START_TIME_1}s" "HTTP $HTTP_CODE: $(head -c 300 "$OUTPUT_1")"
SIZE_1=$(stat -f%z "$OUTPUT_1" 2>/dev/null || stat -c%s "$OUTPUT_1")
[ "$SIZE_1" -lt 5000 ] && fail "output size @ ${START_TIME_1}s" "too small: $SIZE_1 bytes"
pass "cut clip @ ${START_TIME_1}s: $SIZE_1 bytes"

# ─── STEP 3: Cut clip at startTime_2 ──────────────────────────────────────
log "Step 3: Cut clip at startTime=$START_TIME_2"
OUTPUT_2="${OUTPUT_DIR}/clip-${START_TIME_2}s.mp4"
HTTP_CODE=$(curl -sS -m 180 -o "$OUTPUT_2" -w "%{http_code}" \
  -X POST "${PRODUCTION_URL}/api/cut-clip" \
  -H "Content-Type: application/json" \
  -d "{
    \"streamUrl\": \"${STREAM_URL}\",
    \"userAgent\": \"${USER_AGENT}\",
    \"visitorData\": \"${VISITOR_DATA}\",
    \"xClientName\": \"${X_CLIENT_NAME}\",
    \"clientVersion\": \"${CLIENT_VERSION}\",
    \"clientName\": \"${CLIENT_NAME}\",
    \"videoId\": \"${TEST_VIDEO_ID}\",
    \"startTime\": ${START_TIME_2},
    \"duration\": ${DURATION},
    \"endTime\": $((START_TIME_2 + DURATION))
  }")
[ "$HTTP_CODE" = "200" ] || fail "cut clip @ ${START_TIME_2}s" "HTTP $HTTP_CODE: $(head -c 300 "$OUTPUT_2")"
SIZE_2=$(stat -f%z "$OUTPUT_2" 2>/dev/null || stat -c%s "$OUTPUT_2")
[ "$SIZE_2" -lt 5000 ] && fail "output size @ ${START_TIME_2}s" "too small: $SIZE_2 bytes"
pass "cut clip @ ${START_TIME_2}s: $SIZE_2 bytes"

# ─── STEP 4: Verify MP4 structure (both clips) ─────────────────────────────
log "Step 4: Verify MP4 structure"
for f in "$OUTPUT_1" "$OUTPUT_2"; do
  # Check ftyp box at offset 4 using python (more reliable than xxd)
  BOXTYPE=$(python3 -c "
with open('$f', 'rb') as fh:
    data = fh.read(8)
    print(data[4:8].hex())
" 2>/dev/null || echo "")
  if [ "$BOXTYPE" != "66747970" ]; then
    fail "ftyp box ($f)" "got: $BOXTYPE (expected 66747970)"
  fi
  # Check no moof (fragmented fMP4) — use python to scan for moof box
  HAS_MOOF=$(python3 -c "
with open('$f', 'rb') as fh:
    data = fh.read()
    print('yes' if b'moof' in data else 'no')
" 2>/dev/null || echo "no")
  if [ "$HAS_MOOF" = "yes" ]; then
    fail "MP4 structure ($f)" "contains moof (fragmented fMP4)"
  fi
  # Verify both video and audio streams are present
  STREAMS=$(ffprobe -v error -show_streams -print_format json "$f" 2>/dev/null)
  HAS_VIDEO=$(echo "$STREAMS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
print('yes' if any(s.get('codec_type')=='video' for s in data.get('streams',[])) else 'no')
" 2>/dev/null || echo "no")
  HAS_AUDIO=$(echo "$STREAMS" | python3 -c "
import sys,json
data = json.load(sys.stdin)
print('yes' if any(s.get('codec_type')=='audio' for s in data.get('streams',[])) else 'no')
" 2>/dev/null || echo "no")
  if [ "$HAS_VIDEO" != "yes" ]; then
    fail "video stream ($f)" "no video stream found"
  fi
  if [ "$HAS_AUDIO" != "yes" ]; then
    fail "audio stream ($f)" "no audio stream found (THIS WAS THE v57/v58 BUG)"
  fi
  pass "MP4 structure ($f): ftyp + progressive + video + audio streams"
done

# ─── STEP 5: Verify content position differs (CRITICAL — v57 failed here) ──
log "Step 5: Verify content position differs (CRITICAL)"
# Extract first I-frame (keyframe) as PNG and compute MD5
# If two different startTimes produce the same first frame, YouTube ignored seek
ffmpeg -y -i "$OUTPUT_1" -frames:v 1 -q:v 2 "${OUTPUT_DIR}/frame-1.png" 2>/dev/null
ffmpeg -y -i "$OUTPUT_2" -frames:v 1 -q:v 2 "${OUTPUT_DIR}/frame-2.png" 2>/dev/null
[ -f "${OUTPUT_DIR}/frame-1.png" ] || fail "frame extraction 1" "no frame produced"
[ -f "${OUTPUT_DIR}/frame-2.png" ] || fail "frame extraction 2" "no frame produced"
MD5_1=$(md5 -q "${OUTPUT_DIR}/frame-1.png" 2>/dev/null || md5sum "${OUTPUT_DIR}/frame-1.png" | awk '{print $1}')
MD5_2=$(md5 -q "${OUTPUT_DIR}/frame-2.png" 2>/dev/null || md5sum "${OUTPUT_DIR}/frame-2.png" | awk '{print $1}')
echo "  First frame MD5 @ ${START_TIME_1}s: $MD5_1"
echo "  First frame MD5 @ ${START_TIME_2}s: $MD5_2"
[ "$MD5_1" = "$MD5_2" ] && fail "content position" "first frames are IDENTICAL — YouTube ignored seek (v57 bug)"
pass "content position differs (first frames are different)"

# ─── STEP 6: Verify audio/video sync (drift < 1s) ──────────────────────────
log "Step 6: Verify audio/video sync (drift < 1s)"
for f in "$OUTPUT_1" "$OUTPUT_2"; do
  PROBE=$(ffprobe -v error -show_streams -print_format json "$f" 2>/dev/null)
  V_START=$(echo "$PROBE" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for s in data.get('streams', []):
    if s.get('codec_type') == 'video':
        print(s.get('start_time', '0'))
        break
" 2>/dev/null || echo "0")
  A_START=$(echo "$PROBE" | python3 -c "
import sys,json
data = json.load(sys.stdin)
for s in data.get('streams', []):
    if s.get('codec_type') == 'audio':
        print(s.get('start_time', '0'))
        break
" 2>/dev/null || echo "0")
  echo "  $f: video start=$V_START, audio start=$A_START"
  DRIFT=$(python3 -c "print(abs(${V_START:-0} - ${A_START:-0}))" 2>/dev/null || echo "999")
  echo "  drift: ${DRIFT}s"
  # Use python to compare floats (bash can't do float comparison)
  python3 -c "
drift = float('${DRIFT}')
if drift > 1.0:
    print(f'  ❌ FAIL: drift {drift}s > 1s — audio out of sync')
    exit(1)
print(f'  ✅ PASS: drift {drift}s ≤ 1s — audio in sync')
" || fail "audio/video sync ($f)" "drift ${DRIFT}s > 1s"
done

# ─── STEP 7: Verify audio has real content (not silence) ───────────────────
log "Step 7: Verify audio has real content (not silence)"
for f in "$OUTPUT_1" "$OUTPUT_2"; do
  # volumedetect outputs TWO n_samples lines:
  #   1st: n_samples: 0 (video stream — no audio samples)
  #   2nd: n_samples: <big number> (audio stream — real audio data)
  # We must use the 2nd (audio) value, not the 1st (video placeholder).
  VOLDET=$(ffmpeg -i "$f" -af volumedetect -f null - 2>&1 || true)
  MEAN_VOL=$(echo "$VOLDET" | grep -oE "mean_volume: -?[0-9.]+ dB" | head -1 | sed 's/mean_volume: //;s/ dB//')
  MAX_VOL=$(echo "$VOLDET" | grep -oE "max_volume: -?[0-9.]+ dB" | head -1 | sed 's/max_volume: //;s/ dB//')
  # Use tail -1 to get the AUDIO stream's n_samples (2nd occurrence)
  N_SAMPLES=$(echo "$VOLDET" | grep -oE "n_samples: [0-9]+" | tail -1 | sed 's/n_samples: //')
  echo "  $f: mean_volume=${MEAN_VOL:-?} dB, max_volume=${MAX_VOL:-?} dB, n_samples=${N_SAMPLES:-0}"
  # mean_volume = -inf means pure silence
  if [ "${MEAN_VOL:-}" = "-inf" ] || [ -z "${MEAN_VOL:-}" ]; then
    fail "audio content ($f)" "mean_volume is ${MEAN_VOL:-empty} (pure silence or no audio)"
  fi
  # n_samples = 0 means no audio data (use the AUDIO stream's value, not video's)
  if [ "${N_SAMPLES:-0}" -eq 0 ] 2>/dev/null; then
    fail "audio content ($f)" "n_samples is 0 (no audio data in audio stream)"
  fi
  pass "audio content ($f): mean_volume=${MEAN_VOL} dB, n_samples=${N_SAMPLES}"
done

# ─── SUMMARY ──────────────────────────────────────────────────────────────
log "v58 E2E Test Summary"
echo "  Build:        $VERSION"
echo "  Clip @ ${START_TIME_1}s: $SIZE_1 bytes, MD5=$MD5_1"
echo "  Clip @ ${START_TIME_2}s: $SIZE_2 bytes, MD5=$MD5_2"
echo "  Audio sync:   ✅ drift < 1s"
echo "  Content pos:  ✅ first frames differ (seek works)"
echo "  Audio content:✅ real audio (not silence)"
echo ""
echo "  🎉 v58 E2E test PASSED — audio sync issue is FIXED"
echo ""
echo "  Output files saved to: $OUTPUT_DIR"
