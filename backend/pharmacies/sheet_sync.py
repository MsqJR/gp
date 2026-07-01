# Minimum gap between consecutive sheet pulls (seconds).
# Must be long enough so a push that happens on create/update/delete
# (which stamps last_pushed_at) suppresses the next list() pull for the
# same window, preventing newly-added manual products from being deleted.
SHEET_SYNC_INTERVAL_SECONDS = 300  # 5 minutes
