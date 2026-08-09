#!/bin/bash
# 检查/创建 video_notes 表
set -e

ENV_FILE="${1:-.env.prod}"

SUPA_URL=$(awk -F'=' '/^NEXT_PUBLIC_SUPABASE_URL=/{print $2}' "$ENV_FILE" | sed 's/^"//;s/"$//' | tr -d '\r')
SUPA_KEY=$(awk -F'=' '/^SUPABASE_SERVICE_ROLE_KEY=/{print $2}' "$ENV_FILE" | sed 's/^"//;s/"$//' | tr -d '\r')

if [ -z "$SUPA_URL" ] || [ -z "$SUPA_KEY" ]; then
  echo "MISSING_CREDENTIALS from $ENV_FILE"
  exit 1
fi

echo "URL_HOST=$(echo $SUPA_URL | sed -E 's|^https?://([^/]+).*|\1|')"
echo "KEY_LEN=${#SUPA_KEY}"

# 尝试查询 video_notes 表
HTTP_CODE=$(curl -s -o /tmp/vn_resp.json -w "%{http_code}" \
  -X GET "$SUPA_URL/rest/v1/video_notes?select=id&limit=1" \
  -H "apikey: $SUPA_KEY" \
  -H "Authorization: Bearer $SUPA_KEY" \
  -H "Accept: application/vnd.pgrst.object+json" || true)

echo "HTTP_STATUS:$HTTP_CODE"
echo "RESPONSE:"
cat /tmp/vn_resp.json 2>/dev/null
echo
