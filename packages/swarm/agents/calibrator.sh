#!/usr/bin/env bash
# Zaia Swarm — Calibrator Agent v2
# Runs AlliGo forensics calibration suite daily
# Logs accuracy metrics and updates the swarm state

set -euo pipefail

SWARM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLIGO_DIR="/home/computer/alligo"
LOG_DIR="$SWARM_DIR/logs"
DATA_DIR="$SWARM_DIR/data"
TIMESTAMP=$(date '+%Y-%m-%d_%H%M%S')
LOG_FILE="$LOG_DIR/calibrator_$(date '+%Y-%m-%d').log"

export PATH="$HOME/.bun/bin:$PATH"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [calibrator] $*"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE"
}

mkdir -p "$LOG_DIR" "$DATA_DIR"

log "🔬 Starting AlliGo calibration run..."

cd "$ALLIGO_DIR"

# Run calibration — capture both stdout and stderr
CALIBRATION_OUTPUT=""
EXIT_CODE=0
CALIBRATION_OUTPUT=$(bun run src/forensics/run-calibration.ts 2>&1) || EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    log "❌ Calibration failed (exit code $EXIT_CODE)"
    echo "$CALIBRATION_OUTPUT" >> "$LOG_FILE"
    exit 1
fi

echo "$CALIBRATION_OUTPUT" >> "$LOG_FILE"

# Extract accuracy — match "Overall Accuracy: 100.0%" or "Overall Accuracy:     100.0%"
ACCURACY=$(echo "$CALIBRATION_OUTPUT" | grep -oP 'Overall Accuracy:\s+\K[\d.]+' | head -1 || echo "")
if [ -z "$ACCURACY" ]; then
    # Fallback: look for plain percentage
    ACCURACY=$(echo "$CALIBRATION_OUTPUT" | grep -i "accuracy" | grep -oP '[\d.]+(?=%)' | head -1 || echo "unknown")
fi

# Extract test count
TOTAL_TESTS=$(echo "$CALIBRATION_OUTPUT" | grep -oP 'Total Tests:\s+\K\d+' | head -1 || echo "?")
CORRECT=$(echo "$CALIBRATION_OUTPUT" | grep -oP 'Correct Detections:\s+\K\d+' | head -1 || echo "?")
AVG_CONF=$(echo "$CALIBRATION_OUTPUT" | grep -oP 'Avg Confidence:\s+\K[\d.]+' | head -1 || echo "?")

log "📊 Results: accuracy=$ACCURACY% | tests=$TOTAL_TESTS | correct=$CORRECT | avg_confidence=$AVG_CONF%"

# Save structured results
RESULT_FILE="$DATA_DIR/calibration_${TIMESTAMP}.json"
cat > "$RESULT_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "accuracy_pct": "$ACCURACY",
  "total_tests": "$TOTAL_TESTS",
  "correct_detections": "$CORRECT",
  "avg_confidence_pct": "$AVG_CONF",
  "status": "$([ "$EXIT_CODE" -eq 0 ] && echo "ok" || echo "failed")"
}
EOF

# Also save latest result pointer (for easy reading)
cp "$RESULT_FILE" "$DATA_DIR/calibration_latest.json"

# Save raw output
echo "$CALIBRATION_OUTPUT" > "$DATA_DIR/calibration_${TIMESTAMP}.txt"

# Alert on degradation
if [ "$ACCURACY" != "unknown" ] && [ -n "$ACCURACY" ]; then
    # bc comparison
    if (( $(echo "$ACCURACY < 75.0" | bc -l 2>/dev/null || echo 0) )); then
        log "⚠️  ACCURACY DEGRADATION: ${ACCURACY}% < 75% threshold — detector needs tuning"
    elif (( $(echo "$ACCURACY >= 95.0" | bc -l 2>/dev/null || echo 0) )); then
        log "🎯 EXCELLENT: ${ACCURACY}% accuracy — detectors performing optimally"
    else
        log "✅ Good accuracy: ${ACCURACY}%"
    fi
fi

# Push results to prod AlliGo (if key available)
ALLIGO_ADMIN_KEY="${ALLIGO_ADMIN_KEY:-}"
if [ -n "$ALLIGO_ADMIN_KEY" ] && [ "$ACCURACY" != "unknown" ] && [ -n "$ACCURACY" ]; then
    ACCURACY_DECIMAL=$(echo "scale=4; $ACCURACY / 100" | bc -l 2>/dev/null || echo "1.0")
    PUSH_PAYLOAD=$(cat <<JSONEOF
{
  "accuracy": $ACCURACY_DECIMAL,
  "total_tests": $TOTAL_TESTS,
  "correct_detections": $CORRECT,
  "avg_confidence": $(echo "scale=4; ${AVG_CONF:-0} / 100" | bc -l 2>/dev/null || echo "0.9"),
  "timestamp": "$(date -Iseconds)"
}
JSONEOF
)
    PUSH_RESULT=$(curl -s -X POST "https://alligo-production.up.railway.app/api/admin/calibration" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ALLIGO_ADMIN_KEY" \
        -d "$PUSH_PAYLOAD" 2>&1)
    if echo "$PUSH_RESULT" | grep -q '"success":true'; then
        log "📡 Pushed calibration results to prod AlliGo"
    else
        log "⚠️ Failed to push to prod: $PUSH_RESULT"
    fi
fi

log "✅ Calibration complete. Results: $RESULT_FILE"
