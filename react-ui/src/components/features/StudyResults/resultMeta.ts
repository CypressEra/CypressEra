/** Shared study-result metadata helpers (modal title, popover, status bar). */

/** Human labels for the study-result `type` discriminator. */
export const TYPE_LABELS: Record<string, string> = {
  ac_contingency_analysis: 'AC Contingency Analysis',
};

/** Human label for a result's analysis type ('' when meta is absent). */
export function typeLabelOf(meta: any): string {
  return meta ? TYPE_LABELS[meta.type] || meta.type || '' : '';
}

/** The result's creation time in the user's locale ('' when absent). */
export function formatCreated(meta: any): string {
  return meta?.created_at
    ? new Date(meta.created_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';
}
