#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Trustline — Setup PostgreSQL Backup Cron on EC2
#  Creates a nightly automated database dump.
#
#  Usage (on EC2):
#    bash ~/Ep2pchat/scripts/setup_postgres_backup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="/var/backups/trustline_db"
sudo mkdir -p "$BACKUP_DIR"
sudo chown ec2-user:ec2-user "$BACKUP_DIR"

# Create the backup script
SCRIPT_FILE="/usr/local/bin/trustline_backup.sh"
sudo tee "$SCRIPT_FILE" > /dev/null << 'EOF'
#!/usr/bin/env bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/trustline_db"
echo "Starting Trustline DB Backup: $DATE"

# Run dump via docker exec inside the postgres container
docker exec trustline-postgres pg_dump -U trustline trustline > "$BACKUP_DIR/trustline_$DATE.sql"

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -type f -name "trustline_*.sql" -mtime +7 -delete

echo "Backup complete: $DATE"
EOF

sudo chmod +x "$SCRIPT_FILE"

# Add to crontab if not already there (runs every day at 3 AM)
(crontab -l 2>/dev/null | grep -v "$SCRIPT_FILE" || true; echo "0 3 * * * $SCRIPT_FILE >> /var/log/trustline_backup.log 2>&1") | crontab -

echo "✅ Backup script installed at $SCRIPT_FILE"
echo "✅ Cron job scheduled for 3 AM daily"
echo "✅ Backups will be saved to $BACKUP_DIR (retained for 7 days)"
