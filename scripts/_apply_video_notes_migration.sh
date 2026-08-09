#!/bin/bash
# 通过 Supabase /pg/query endpoint 执行 SQL（service role）
set -e

ENV_FILE="${1:-.env.prod}"
SQL_FILE="${2:-scripts/create-video-notes-table.sql}"

SUPA_URL=$(awk -F'=' '/^NEXT_PUBLIC_SUPABASE_URL=/{print $2}' "$ENV_FILE" | sed 's/^"//;s/"$//' | tr -d '\r')
SUPA_KEY=$(awk -F'=' '/^SUPABASE_SERVICE_ROLE_KEY=/{print $2}' "$ENV_FILE" | sed 's/^"//;s/"$//' | tr -d '\r')

if [ ! -f "$SQL_FILE" ]; then
  echo "SQL_FILE_NOT_FOUND: $SQL_FILE"
  exit 1
fi

SQL=$(cat "$SQL_FILE")
echo "Applying $SQL_FILE to $(echo $SUPA_URL | sed -E 's|^https?://([^/]+).*|\1|') ..."

# /pg/query endpoint expects {"query": "..."} JSON
PAYLOAD=$(jq -n --arg q "$SQL" '{query: $q}')

HTTP_CODE=$(curl -s -o /tmp/pg_query_resp.txt -w "%{http_code}" \
  -X POST "$SUPA_URL/pg/query" \
  -H "apikey: $SUPA_KEY" \
  -H "Authorization: Bearer $SUPA_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" || true)

echo "HTTP_STATUS:$HTTP_CODE"
echo "RESPONSE:"
cat /tmp/pg_query_resp.txt
echo
