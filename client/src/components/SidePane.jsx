import React, { useState, useMemo } from 'react';
import { HOUSE_LAYOUT } from '../game/HouseLayout';
import { getInteractionsForRole, filterByTimeWindow, CATEGORIES } from '../game/InteractionData';

/**
 * SidePane - Sliding info panel that appears when clicking players or rooms.
 * Displays detailed stats and information, designed to be information-dense
 * and extensible for future features.
 *
 * Props:
 *  - data: { type: 'player' | 'room', payload: Object } | null
 *  - onClose: () => void
 */
export default function SidePane({ data, onClose, onCommandAction }) {
  const isOpen = data !== null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: 320,
      height: '100%',
      zIndex: 20,
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s ease-in-out',
      pointerEvents: isOpen ? 'auto' : 'none',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Background with blur */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10, 10, 25, 0.92)',
        backdropFilter: 'blur(12px)',
        borderLeft: '1px solid rgba(255, 215, 0, 0.2)',
      }} />

      {/* Content (scrollable) */}
      <div style={{
        position: 'relative',
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '16px 18px',
        fontFamily: '"Courier New", monospace',
        color: '#e0e0e0',
        fontSize: 13,
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            color: '#aaa',
            fontSize: 16,
            width: 28,
            height: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,80,80,0.3)';
            e.currentTarget.style.color = '#ff6b6b';
            e.currentTarget.style.borderColor = 'rgba(255,80,80,0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.color = '#aaa';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
          }}
        >
          ✕
        </button>

        {data?.type === 'player' && <PlayerPanel member={data.payload} onCommandAction={onCommandAction} />}
        {data?.type === 'room' && <RoomPanel room={data.payload} />}
      </div>
    </div>
  );
}

/* ─── Shared UI helpers ─────────────────────────────────────────────── */

function SectionHeader({ label, color = '#FFD700' }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
      paddingBottom: 6,
      borderBottom: `1px solid ${color}33`,
    }}>
      <span style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}66`,
        flexShrink: 0,
      }} />
      <span style={{ color, fontWeight: 'bold', fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

function StatRow({ label, value, color, bar, barColor }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: 11 }}>{label}</span>
        <span style={{ color: color || '#fff', fontWeight: 'bold', fontSize: 12 }}>{value}</span>
      </div>
      {bar !== undefined && (
        <div style={{
          marginTop: 3,
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, bar))}%`,
            borderRadius: 2,
            background: barColor || '#4ADE80',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}
    </div>
  );
}

function Badge({ text, color = '#FFD700', bgColor }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 'bold',
      letterSpacing: 0.5,
      color,
      background: bgColor || `${color}20`,
      border: `1px solid ${color}40`,
      textTransform: 'uppercase',
    }}>
      {text}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />;
}

/* ─── Player Panel ──────────────────────────────────────────────────── */

const ROLE_COLORS = {
  father: '#60A5FA',
  mother: '#F472B6',
  son: '#4ADE80',
  daughter: '#FBBF24',
};

const STATE_LABELS = {
  idle: { text: 'Idle', color: '#4ADE80' },
  walking: { text: 'Walking', color: '#60A5FA' },
  choosing: { text: 'Thinking...', color: '#FBBF24' },
  performing: { text: 'Busy', color: '#F472B6' },
};

// Driven by CATEGORIES from interactions.json
const CATEGORY_COLORS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.color])
);

function getRoomDisplayName(roomId) {
  const room = HOUSE_LAYOUT.rooms.find(r => r.id === roomId);
  return room ? room.name : roomId || 'Unknown';
}

function PlayerPanel({ member, onCommandAction }) {
  const roleColor = ROLE_COLORS[member.role] || '#aaa';
  const stateInfo = STATE_LABELS[member.state] || { text: member.state, color: '#aaa' };

  // Available actions for this character, grouped by category
  const [openCategory, setOpenCategory] = useState(null);
  const [searchText, setSearchText] = useState('');

  const availableActions = useMemo(() => {
    const roleActions = getInteractionsForRole(member.role);
    // Group by category
    const grouped = {};
    for (const action of roleActions) {
      if (!grouped[action.category]) grouped[action.category] = [];
      grouped[action.category].push(action);
    }
    // Sort categories alphabetically, sort actions within by priority desc
    const sorted = {};
    for (const cat of Object.keys(grouped).sort()) {
      sorted[cat] = grouped[cat].sort((a, b) => b.priority - a.priority);
    }
    return sorted;
  }, [member.role]);

  // Filter by search text
  const filteredActions = useMemo(() => {
    if (!searchText.trim()) return availableActions;
    const q = searchText.toLowerCase();
    const result = {};
    for (const [cat, actions] of Object.entries(availableActions)) {
      const matches = actions.filter(a =>
        a.label.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.room.toLowerCase().includes(q)
      );
      if (matches.length > 0) result[cat] = matches;
    }
    return result;
  }, [availableActions, searchText]);

  const totalActions = Object.values(filteredActions).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, paddingRight: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `${roleColor}22`,
            border: `2px solid ${roleColor}`,
            color: roleColor,
            fontWeight: 'bold',
            fontSize: 16,
            fontFamily: '"Courier New", monospace',
            flexShrink: 0,
          }}>{member.name[0]}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFD700', letterSpacing: 1 }}>
              {member.name}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <Badge text={member.role} color="#C084FC" />
              <Badge text={stateInfo.text} color={stateInfo.color} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Section */}
      <SectionHeader label="Status" />
      <StatRow label="Current State" value={stateInfo.text} color={stateInfo.color} />
      <StatRow label="Location" value={getRoomDisplayName(member.currentRoom)} color="#60A5FA" />

      {/* ── Current Activity (interaction) ── */}
      {member.activityLabel && (
        <>
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <span style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Activity</span>
          </div>
          <div style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: `${CATEGORY_COLORS[member.currentInteraction?.category] || '#555'}22`,
            border: `1px solid ${CATEGORY_COLORS[member.currentInteraction?.category] || '#555'}44`,
            marginBottom: 6,
          }}>
            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: 13, marginBottom: 4 }}>
              {member.activityLabel}
            </div>
            {member.currentInteraction && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge text={member.currentInteraction.category} color={CATEGORY_COLORS[member.currentInteraction.category] || '#aaa'} />
                <Badge text={member.activityAnim || 'idle'} color="#90A4AE" />
              </div>
            )}
          </div>
          {member.interactionDuration > 0 && (
            <StatRow
              label="Progress"
              value={`${Math.floor((member.interactionTimer / member.interactionDuration) * 100)}%`}
              bar={(member.interactionTimer / member.interactionDuration) * 100}
              barColor={CATEGORY_COLORS[member.currentInteraction?.category] || '#4ADE80'}
            />
          )}
        </>
      )}

      <Divider />

      {/* ═══════ ACTIONS — Command this character ═══════ */}
      <SectionHeader label={`Actions (${totalActions})`} color="#FF9800" />

      {/* Search bar */}
      <div style={{ marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search actions..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 5,
            border: '1px solid rgba(255,152,0,0.3)',
            background: 'rgba(255,255,255,0.06)',
            color: '#e0e0e0',
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category accordion */}
      {Object.entries(filteredActions).map(([category, actions]) => {
        const catColor = CATEGORY_COLORS[category] || '#aaa';
        const isOpen = openCategory === category || searchText.trim() !== '';
        const catIcon = CATEGORY_ICONS_SIDE[category] || '📋';

        return (
          <div key={category} style={{ marginBottom: 4 }}>
            {/* Category header (toggle) */}
            <button
              onClick={() => setOpenCategory(prev => prev === category ? null : category)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                padding: '5px 8px',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                fontWeight: 'bold',
                textTransform: 'capitalize',
                background: isOpen ? `${catColor}18` : 'rgba(255,255,255,0.03)',
                border: isOpen ? `1px solid ${catColor}44` : '1px solid rgba(255,255,255,0.06)',
                color: isOpen ? catColor : '#888',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 13 }}>{catIcon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{category}</span>
              <span style={{ fontSize: 10, color: '#666' }}>({actions.length})</span>
              <span style={{ fontSize: 10, transition: 'transform 0.15s ease', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </button>

            {/* Expanded action list */}
            {isOpen && (
              <div style={{ paddingLeft: 6, paddingTop: 4 }}>
                {actions.map(action => (
                  <ActionButton
                    key={action.id}
                    action={action}
                    catColor={catColor}
                    isCurrentAction={member.currentInteraction?.id === action.id}
                    onClick={() => {
                      if (onCommandAction) onCommandAction(member.name, action.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {totalActions === 0 && searchText.trim() && (
        <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic', marginTop: 4 }}>
          No actions match "{searchText}"
        </div>
      )}

      <Divider />

      {/* Position Section */}
      <SectionHeader label="Position" color="#60A5FA" />
      <StatRow label="X" value={member.position.x.toFixed(2)} />
      <StatRow label="Z" value={member.position.z.toFixed(2)} />
      <StatRow label="Walk Speed" value={`${member.walkSpeed.toFixed(1)} m/s`} />
      <StatRow label="Facing" value={member.facingRight ? '→ Right' : '← Left'} />
      {member.path && member.path.length > 0 && (
        <StatRow
          label="Path Progress"
          value={`${member.pathIndex || 0} / ${member.path.length}`}
          bar={((member.pathIndex || 0) / Math.max(1, member.path.length)) * 100}
          barColor="#60A5FA"
        />
      )}

      <Divider />

      {/* Needs Section (placeholder for future) */}
      <SectionHeader label="Needs" color="#F87171" />
      <StatRow label="Energy" value="—" bar={75} barColor="#4ADE80" />
      <StatRow label="Hunger" value="—" bar={60} barColor="#FBBF24" />
      <StatRow label="Hygiene" value="—" bar={85} barColor="#60A5FA" />
      <StatRow label="Social" value="—" bar={50} barColor="#C084FC" />
      <StatRow label="Fun" value="—" bar={40} barColor="#F472B6" />

      <Divider />

      {/* Skills Section (placeholder for future) */}
      <SectionHeader label="Skills" color="#FBBF24" />
      <StatRow label="Cooking" value="—" bar={0} barColor="#FBBF24" />
      <StatRow label="Creativity" value="—" bar={0} barColor="#C084FC" />
      <StatRow label="Fitness" value="—" bar={0} barColor="#F87171" />
      <StatRow label="Logic" value="—" bar={0} barColor="#60A5FA" />

      <Divider />

      {/* Relationships (placeholder for future) */}
      <SectionHeader label="Relationships" color="#C084FC" />
      <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>
        No relationship data yet
      </div>

      <Divider />

      {/* Inventory (placeholder for future) */}
      <SectionHeader label="Inventory" color="#F59E0B" />
      <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>
        Empty
      </div>
    </div>
  );
}

/* ─── Category icons for the action accordion ───────────────────────── */

const CATEGORY_ICONS_SIDE = {
  cooking:       '🍳',
  eating:        '🍽️',
  hygiene:       '🚿',
  chores:        '🧹',
  sleeping:      '💤',
  entertainment: '🎬',
  exercise:      '🏃',
  social:        '💬',
  relaxing:      '☕',
  education:     '📚',
  errand:        '🚗',
  hobby:         '🎨',
  routine:       '⚙️',
  transit:       '🚶',
};

/* ─── ActionButton — single command action a player can be told to do ─ */

function ActionButton({ action, catColor, isCurrentAction, onClick }) {
  const roomLabel = getRoomDisplayName(action.room);
  const timeLabel = action.timeWindow
    ? `${formatHour(action.timeWindow.start)}–${formatHour(action.timeWindow.end)}`
    : 'Anytime';

  return (
    <button
      onClick={onClick}
      title={action.description}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
        padding: '5px 8px',
        marginBottom: 3,
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: '"Courier New", monospace',
        textAlign: 'left',
        background: isCurrentAction ? `${catColor}25` : 'rgba(255,255,255,0.03)',
        border: isCurrentAction ? `1px solid ${catColor}66` : '1px solid rgba(255,255,255,0.06)',
        color: '#ddd',
        transition: 'all 0.12s ease',
      }}
      onMouseEnter={e => {
        if (!isCurrentAction) {
          e.currentTarget.style.background = `${catColor}18`;
          e.currentTarget.style.borderColor = `${catColor}44`;
        }
      }}
      onMouseLeave={e => {
        if (!isCurrentAction) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isCurrentAction && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: catColor, boxShadow: `0 0 4px ${catColor}`,
            flexShrink: 0,
          }} />
        )}
        <span style={{ fontSize: 12, fontWeight: isCurrentAction ? 'bold' : 'normal', color: isCurrentAction ? catColor : '#ddd' }}>
          {action.label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 9, color: '#666' }}>
        <span>{roomLabel}</span>
        <span>·</span>
        <span>{timeLabel}</span>
        <span>·</span>
        <span>{action.duration.min}–{action.duration.max}m</span>
      </div>
    </button>
  );
}

function formatHour(h) {
  const hr = Math.floor(h) % 12 || 12;
  const ampm = h < 12 || h >= 24 ? 'a' : 'p';
  return `${hr}${ampm}`;
}

/* ─── Room Panel ────────────────────────────────────────────────────── */

function RoomPanel({ room }) {
  // Get furniture in this room
  const furniture = HOUSE_LAYOUT.furniture.filter(f => f.room === room.id);
  const bounds = room.bounds;
  const area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, paddingRight: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#FFD700', letterSpacing: 1 }}>
          {room.name}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <Badge text={room.id} color="#60A5FA" />
          <Badge text={`${area.toFixed(0)} m²`} color="#4ADE80" />
        </div>
      </div>

      {/* Room Details */}
      <SectionHeader label="Details" />
      <StatRow label="Floor Color" value={room.floorColor} color={room.floorColor} />
      <StatRow label="Wall Color" value={room.wallColor} color={room.wallColor} />

      <div style={{ display: 'flex', gap: 12, marginTop: 4, marginBottom: 4 }}>
        <div>
          <span style={{ color: '#888', fontSize: 10 }}>Width</span>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
            {(bounds.maxX - bounds.minX).toFixed(0)}m
          </div>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: 10 }}>Depth</span>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
            {(bounds.maxZ - bounds.minZ).toFixed(0)}m
          </div>
        </div>
        <div>
          <span style={{ color: '#888', fontSize: 10 }}>Area</span>
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
            {area.toFixed(0)}m²
          </div>
        </div>
      </div>

      <Divider />

      {/* Furniture List */}
      <SectionHeader label={`Furniture (${furniture.length})`} color="#F59E0B" />
      {furniture.length === 0 ? (
        <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>Empty room</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {furniture.map(f => (
            <div key={f.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 12, color: '#ddd', fontWeight: 'bold', textTransform: 'capitalize' }}>
                  {f.id.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>
                  {f.size.w}×{f.size.d}×{f.size.h}m
                </div>
              </div>
              <div style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: f.color,
                border: '1px solid rgba(255,255,255,0.2)',
              }} />
            </div>
          ))}
        </div>
      )}

      <Divider />

      {/* Doors / Connections */}
      <SectionHeader label="Connections" color="#60A5FA" />
      {(() => {
        const doors = HOUSE_LAYOUT.doors.filter(d => d.from === room.id || d.to === room.id);
        if (doors.length === 0) {
          return <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>No connections</div>;
        }
        return doors.map((d, i) => {
          const connectedId = d.from === room.id ? d.to : d.from;
          const connectedRoom = HOUSE_LAYOUT.rooms.find(r => r.id === connectedId);
          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
              fontSize: 12,
            }}>
              <span style={{ color: '#60A5FA' }}>→</span>
              <span style={{ color: '#ddd' }}>{connectedRoom?.name || connectedId}</span>
              <span style={{ color: '#555', fontSize: 10 }}>({d.width}m wide)</span>
            </div>
          );
        });
      })()}

      <Divider />

      {/* Environment (placeholder for future) */}
      <SectionHeader label="Environment" color="#4ADE80" />
      <StatRow label="Temperature" value="—" bar={65} barColor="#FBBF24" />
      <StatRow label="Cleanliness" value="—" bar={80} barColor="#4ADE80" />
      <StatRow label="Lighting" value="—" bar={70} barColor="#F59E0B" />
      <StatRow label="Noise Level" value="—" bar={20} barColor="#F87171" />

      <Divider />

      {/* Occupants (placeholder for future) */}
      <SectionHeader label="Occupants" color="#C084FC" />
      <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>
        Tracking coming soon
      </div>
    </div>
  );
}
