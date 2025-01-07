#!/bin/bash
# backup.sh

# Get environment variables
ENV=${NODE_ENV:-development}
DB_USER=${DB_USER:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_NAME=${DB_NAME:-tienhock}
DB_PORT=${DB_PORT:-5432}
DB_PASSWORD=${DB_PASSWORD:-foodmaker}
MANUAL_BACKUP=${MANUAL_BACKUP:-false}

# Backup directory with environment
BACKUP_DIR="/var/backups/postgres/${ENV}"
BACKUP_RETENTION_DAYS=180  # Keep backups for 6 months

# Ensure backup directory exists
mkdir -p $BACKUP_DIR

create_backup() {
    # Generate timestamp
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    
    # Create backup filename
    BACKUP_FILENAME="${BACKUP_DIR}/backup_${DB_NAME}_${TIMESTAMP}"
    
    echo "Creating backup: ${BACKUP_FILENAME}.gz"
    
    # Create compressed backup
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
      -h $DB_HOST \
      -p $DB_PORT \
      -U $DB_USER \
      -d $DB_NAME \
      -F c \
      -b \
      -v \
      -f "${BACKUP_FILENAME}.gz"
    
    # Check if backup was successful
    if [ $? -eq 0 ]; then
        echo "[${ENV}] Backup completed: ${BACKUP_FILENAME}.gz" >> "${BACKUP_DIR}/backup.log"
        
        # Delete backups older than retention period
        find $BACKUP_DIR -name "backup_${DB_NAME}_*.gz" -mtime +$BACKUP_RETENTION_DAYS -delete
        return 0
    else
        echo "[${ENV}] Backup failed at $(date)" >> "${BACKUP_DIR}/backup.log"
        return 1
    fi
}

# For manual backups, bypass the monthly check
if [ "$MANUAL_BACKUP" = "true" ]; then
    echo "Starting manual backup..."
    create_backup
    exit $?
fi

# Monthly backup logic
LAST_RUN_FILE="${BACKUP_DIR}/last_run"
CURRENT_MONTH=$(date +%Y%m)

# Create last_run file if it doesn't exist
if [ ! -f "$LAST_RUN_FILE" ]; then
    echo "000000" > "$LAST_RUN_FILE"
fi

LAST_RUN_MONTH=$(cat "$LAST_RUN_FILE")

# If we're in a new month compared to last run
if [ "$CURRENT_MONTH" != "$LAST_RUN_MONTH" ]; then
    echo "Starting monthly backup..."
    if create_backup; then
        echo "$CURRENT_MONTH" > "$LAST_RUN_FILE"
    fi
else
    echo "Monthly backup already run this month, skipping..."
fi