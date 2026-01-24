#!/bin/bash
# Weekly Vault Distribution Cron Script
#
# Add to crontab for automatic weekly execution:
# crontab -e
# 0 12 * * 0 /path/to/bloc-step-arcade-backend/scripts/weekly-distribute.sh >> /var/log/vault-distribution.log 2>&1
#
# This runs every Sunday at 12:00 PM UTC

cd "$(dirname "$0")/.."

echo "========================================"
echo "Weekly Vault Distribution"
echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

# Load nvm if available (for Node.js)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Run the distribution script
npx tsx scripts/distributeVault.ts

echo ""
echo "Distribution complete."
echo "========================================"
