#!/bin/bash
# Script to archive consolidated documentation files

ARCHIVE_DIR="archive_$(date +%Y%m%d)"
mkdir -p "$ARCHIVE_DIR"

# Files to archive (consolidated into new docs)
FILES=(
  "PROJECT_OVERVIEW.md"
  "ARCHITECTURE_EXAMPLE.md"
  "ARCHITECTURE_VISUAL.md"
  "README_ARCHITECTURE.md"
  "QUICK_START.md"
  "SETUP_COMPLETE.md"
  "SETUP_SUMMARY.md"
  "SERVER_SETUP.md"
  "I18N_ARCHITECTURE.md"
  "I18N_GUIDE.md"
  "I18N_QUICK_REFERENCE.md"
  "I18N_SETUP_SUMMARY.md"
  "README_I18N.md"
  "LOGGING_GUIDE.md"
  "LOGGING_IMPLEMENTATION.md"
  "LOGGING_MESSAGES.md"
  "LOGGING_QUICK_REFERENCE.md"
  "LOGGING_UPDATE_SUMMARY.md"
  "SDK_ARCHITECTURE.md"
  "SDK_MIGRATION_GUIDE.md"
  "REACT_SDK_INTEGRATION.md"
  "XFLOW_SDK_GUIDE.md"
  "XFLOW_QUICK_REFERENCE.md"
  "NETWORK_CACHE_UPDATE.md"
  "NETWORK_TABLE_EDIT_API.md"
)

echo "Archiving consolidated documentation files..."
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    mv "$file" "$ARCHIVE_DIR/" 2>/dev/null && echo "✓ Archived: $file" || echo "✗ Not found: $file"
  fi
done

echo ""
echo "Archived files moved to: $ARCHIVE_DIR"
echo "Review the consolidated docs in: ARCHITECTURE.md, SETUP.md, I18N.md, LOGGING.md, SDK.md, API.md"
