#!/usr/bin/env sh
set -eu

BASE_URL=${1:-http://127.0.0.1:3000}

echo "Checking $BASE_URL/health"
curl --fail --silent --show-error "$BASE_URL/health"
echo

echo "Checking $BASE_URL/api/health/db"
curl --fail --silent --show-error "$BASE_URL/api/health/db"
echo

echo "Checking $BASE_URL/api/rulesets"
curl --fail --silent --show-error "$BASE_URL/api/rulesets"
echo
