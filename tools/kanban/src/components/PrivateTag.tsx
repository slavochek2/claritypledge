// P1507: marks a spec that lives in .private (archive) or on an embargoed worktree branch.
export function PrivateTag() {
  return (
    <span
      title="Private spec: read-only on this board"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        fontSize: 12,
        padding: '0 8px',
        borderRadius: 99,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        background: 'var(--tag-gray-bg)',
        color: 'var(--tag-gray-text)',
      }}
    >
      .private
    </span>
  )
}
