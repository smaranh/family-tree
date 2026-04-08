import { memo, useCallback, CSSProperties, MouseEvent } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { PersonNodeData } from '../utils/buildTree';
import useFamilyStore from '../store/familyStore';

// ---------------------------------------------------------------------------
// Styles (inline — keeps the component self-contained for React Flow)
// ---------------------------------------------------------------------------

const CARD_W = 180;
const CARD_H = 100;

const styles = {
  card: (isSpouse: boolean, hasWarning: boolean): CSSProperties => ({
    width: CARD_W,
    height: CARD_H,
    position: 'relative',
    borderRadius: 6,
    background: isSpouse
      ? 'linear-gradient(160deg, #fdf6ee 0%, #f5ece0 100%)'
      : 'linear-gradient(160deg, #fefaf4 0%, #f7edd8 100%)',
    border: `1px solid ${hasWarning ? '#c8915a' : '#d6c4a8'}`,
    boxShadow: '0 2px 8px rgba(80,50,20,0.10), 0 1px 2px rgba(80,50,20,0.08)',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    transition: 'box-shadow 0.18s ease, transform 0.18s ease',
    boxSizing: 'border-box' as const,
  }),

  topStripe: (isSpouse: boolean): CSSProperties => ({
    height: 4,
    borderRadius: '6px 6px 0 0',
    background: isSpouse
      ? 'linear-gradient(90deg, #b8956a, #d4a574)'
      : 'linear-gradient(90deg, #7a5c3a, #a07850)',
    flexShrink: 0,
  }),

  body: (): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    flex: 1,
  }),

  avatar: (): CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: '1.5px solid #c8ae8a',
    flexShrink: 0,
    background: '#e8d9c4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }),

  avatarInitials: (): CSSProperties => ({
    fontSize: 16,
    fontWeight: 600,
    color: '#8a6848',
    letterSpacing: '-0.5px',
    userSelect: 'none',
    fontFamily: "'Georgia', serif",
  }),

  info: (): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),

  name: (): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 700,
    color: '#3d2b1a',
    letterSpacing: '0.1px',
    lineHeight: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),

  dob: (): CSSProperties => ({
    fontSize: 10.5,
    color: '#7a5c3a',
    letterSpacing: '0.4px',
    fontVariantNumeric: 'tabular-nums',
  }),

  missingLabel: (): CSSProperties => ({
    fontSize: 9.5,
    color: '#c8915a',
    letterSpacing: '0.3px',
    fontStyle: 'italic',
  }),

  footer: (): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 8px 5px',
    gap: 4,
  }),

  iconBtn: (): CSSProperties => ({
    width: 20,
    height: 20,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: '#9a7a5a',
    transition: 'color 0.15s, background 0.15s',
  }),

  warningDot: (): CSSProperties => ({
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: '#c8915a',
    border: '1.5px solid #fdf6ee',
  }),
} as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Avatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return (
      <div style={styles.avatar()}>
        <img src={image} alt={name ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div style={styles.avatar()}>
      <span style={styles.avatarInitials()}>{initials}</span>
    </div>
  );
}

// Compact focus/fit icon (crosshair)
function FocusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="0.5" x2="6" y2="3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="6" y1="9" x2="6" y2="11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="0.5" y1="6" x2="3" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="9" y1="6" x2="11.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PersonCard
// ---------------------------------------------------------------------------

function PersonCard({ id, data }: NodeProps<PersonNodeData>) {
  const { person, isSpouse } = data;
  const toggleExpand = useFamilyStore((s) => s.toggleExpand);
  const getChildren = useFamilyStore((s) => s.getChildren);
  const { fitView } = useReactFlow();

  const hasWarning = !person.name || !person.dob;
  const hasChildren = getChildren(person.id).length > 0;

  const handleCardClick = useCallback(() => {
    console.log('handleCardClick', person.id, hasChildren);
    if (!hasChildren) return;
    toggleExpand(person.id);
  }, [hasChildren, toggleExpand, person.id]);

  const handleFocusClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      fitView({ nodes: [{ id }], duration: 400, padding: 0.3 });
    },
    [fitView, id]
  );

  const formattedDob = person.dob
    ? new Date(person.dob).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : null;

  return (
    <div
      style={styles.card(isSpouse, hasWarning)}
      onClick={handleCardClick}
      title={hasChildren ? 'Click to expand/collapse' : undefined}
    >
      {/* React Flow connection handles — hidden visually */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Coloured top stripe */}
      <div style={styles.topStripe(isSpouse)} />

      {/* Warning dot */}
      {hasWarning && <div style={styles.warningDot()} title="Missing name or date of birth" />}

      {/* Main body */}
      <div style={styles.body()}>
        <Avatar name={person.name} image={person.image} />
        <div style={styles.info()}>
          {person.name ? (
            <span style={styles.name()}>{person.name}</span>
          ) : (
            <span style={styles.missingLabel()}>No name</span>
          )}
          {formattedDob ? (
            <span style={styles.dob()}>{formattedDob}</span>
          ) : (
            <span style={styles.missingLabel()}>No date of birth</span>
          )}
        </div>
      </div>

      {/* Footer: focus button */}
      <div style={styles.footer()}>
        <button
          style={styles.iconBtn()}
          onClick={handleFocusClick}
          title="Focus on this person's subtree"
        >
          <FocusIcon />
        </button>
      </div>
    </div>
  );
}

export default memo(PersonCard);
