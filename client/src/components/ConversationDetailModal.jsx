import React from 'react';

/**
 * ConversationDetailModal — Shows a full conversation thread between characters.
 *
 * Displays:
 *  - Participants (with role colors)
 *  - Full turn-by-turn conversation with timestamps
 *  - Thread status (active, timed-out, completed)
 *  - Topic detection
 */

const ROLE_COLORS = {
  Dad:  '#4FC3F7',
  Mom:  '#CE93D8',
  Emma: '#FF8A80',
  Lily: '#FFF176',
  Jack: '#A5D6A7',
};

const EMOTION_ICONS = {
  happy: '😊',
  excited: '😄',
  sad: '😢',
  angry: '😠',
  worried: '😟',
  confused: '😕',
  tired: '😴',
  neutral: '😐',
  loving: '❤️',
  playful: '😜',
  annoyed: '😤',
  proud: '🥹',
  curious: '🤔',
  frustrated: '😩',
  content: '😌',
  surprised: '😲',
  bored: '😑',
  amused: '😏',
};

export default function ConversationDetailModal({ thread, onClose }) {
  if (!thread) return null;

  const startTime = new Date(thread.startedAt).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const lastTime = new Date(thread.lastActivityAt).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const statusColor = thread.isActive ? '#4ADE80' : '#888';
  const statusText = thread.isActive ? 'Active' : (thread.isOver ? 'Ended' : 'Waiting…');

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>💬</span>
            <span style={{ fontWeight: 'bold', fontSize: 15, color: '#eee' }}>
              Conversation
            </span>
            <span style={{ color: '#666', fontSize: 11 }}>
              {thread.id}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 8,
              background: thread.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(136,136,136,0.2)',
              color: statusColor,
              fontWeight: 'bold',
            }}>
              {statusText}
            </span>
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
        </div>

        {/* Participants */}
        <div style={infoBarStyle}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {thread.participants.map(p => (
              <span key={p} style={{
                color: ROLE_COLORS[p] || '#aaa',
                fontWeight: 'bold',
                fontSize: 13,
              }}>
                {p}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#888' }}>
            <span>📍 {thread.room || 'unknown'}</span>
            <span>🏷️ {thread.topic || 'general'}</span>
            <span>⏱️ {startTime} – {lastTime}</span>
            <span>{thread.turns.length} turn{thread.turns.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Conversation Turns */}
        <div style={turnsContainerStyle}>
          {thread.turns.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: 20, fontSize: 12 }}>
              No messages yet…
            </div>
          ) : (
            thread.turns.map((turn, i) => {
              const isLeft = turn.speaker === thread.participants[0];
              const color = ROLE_COLORS[turn.speaker] || '#aaa';
              const emotionIcon = EMOTION_ICONS[turn.emotion] || '';
              const turnTime = new Date(turn.timestamp).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit', second: '2-digit'
              });

              return (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isLeft ? 'flex-start' : 'flex-end',
                  marginBottom: 8,
                }}>
                  {/* Speaker name + time */}
                  <div style={{
                    fontSize: 10,
                    color: '#888',
                    marginBottom: 2,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                  }}>
                    <span style={{ color, fontWeight: 'bold' }}>{turn.speaker}</span>
                    <span>{turnTime}</span>
                  </div>

                  {/* Bubble */}
                  <div style={{
                    background: isLeft ? 'rgba(79,195,247,0.15)' : 'rgba(206,147,216,0.15)',
                    border: `1px solid ${isLeft ? 'rgba(79,195,247,0.3)' : 'rgba(206,147,216,0.3)'}`,
                    borderRadius: isLeft ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                    padding: '8px 12px',
                    maxWidth: '80%',
                    fontSize: 13,
                    color: '#eee',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}>
                    {emotionIcon && <span style={{ marginRight: 4 }}>{emotionIcon}</span>}
                    "{turn.text}"
                  </div>

                  {/* Emotion label */}
                  {turn.emotion && turn.emotion !== 'neutral' && (
                    <div style={{
                      fontSize: 9,
                      color: '#666',
                      marginTop: 1,
                      fontStyle: 'italic',
                    }}>
                      {turn.emotion}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Waiting indicator */}
          {thread.isActive && (
            <div style={{
              textAlign: 'center',
              color: '#4ADE80',
              fontSize: 11,
              padding: '8px 0',
              opacity: 0.7,
            }}>
              💬 Conversation in progress…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ──

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 99999,
  fontFamily: '"Courier New", monospace',
};

const modalStyle = {
  background: '#1a1a2e',
  border: '1px solid #333',
  borderRadius: 8,
  width: 520,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  borderBottom: '1px solid #333',
};

const closeBtnStyle = {
  background: 'none',
  border: '1px solid #555',
  color: '#888',
  width: 28,
  height: 28,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Courier New", monospace',
};

const infoBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 16px',
  borderBottom: '1px solid #282840',
  background: 'rgba(255,255,255,0.02)',
};

const turnsContainerStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 16px',
  minHeight: 100,
  maxHeight: 400,
};
