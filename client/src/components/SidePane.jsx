import React from 'react';
import { HOUSE_LAYOUT } from '../game/HouseLayout';

/**
 * SidePane - Sliding info panel that appears when clicking players or rooms.
 * Displays detailed stats and information, designed to be information-dense
 * and extensible for future features.
 *
 * Props:
 *  - data: { type: 'player' | 'room', payload: Object } | null
 *  - onClose: () => void
 */
export default function SidePane({ data, onClose }) {
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

        {data?.type === 'player' && <PlayerPanel member={data.payload} />}
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
};

function getRoomDisplayName(roomId) {
  const room = HOUSE_LAYOUT.rooms.find(r => r.id === roomId);
  return room ? room.name : roomId || 'Unknown';
}

function PlayerPanel({ member }) {
  const roleColor = ROLE_COLORS[member.role] || '#aaa';
  const stateInfo = STATE_LABELS[member.state] || { text: member.state, color: '#aaa' };

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
      <StatRow label="Current Activity" value={stateInfo.text} color={stateInfo.color} />
      <StatRow label="Location" value={getRoomDisplayName(member.currentRoom)} color="#60A5FA" />
      <StatRow label="Walk Speed" value={`${member.walkSpeed.toFixed(1)} m/s`} />
      <StatRow label="Facing" value={member.facingRight ? '→ Right' : '← Left'} />

      <Divider />

      {/* Position Section */}
      <SectionHeader label="Position" color="#60A5FA" />
      <StatRow label="X" value={member.position.x.toFixed(2)} />
      <StatRow label="Z" value={member.position.z.toFixed(2)} />
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
