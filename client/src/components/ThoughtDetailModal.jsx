import React, { useState } from 'react';

/**
 * ThoughtDetailModal — Full inspection modal for a single LLM thought chain.
 *
 * Shows:
 *  - System prompt (collapsible)
 *  - User prompt (collapsible)
 *  - Raw LLM response
 *  - Parsed decision (action, thought, speech, emotion)
 *  - Elapsed time, token estimate
 */

const ROLE_COLORS = {
  Dad:  '#4FC3F7',
  Mom:  '#CE93D8',
  Emma: '#FF8A80',
  Lily: '#FFF176',
  Jack: '#A5D6A7',
};

export default function ThoughtDetailModal({ thought, onClose }) {
  const [expandSystem, setExpandSystem] = useState(false);
  const [expandUser, setExpandUser] = useState(false);
  const [expandRaw, setExpandRaw] = useState(true);

  if (!thought) return null;

  const charColor = ROLE_COLORS[thought.character] || '#aaa';
  const timeStr = new Date(thought.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const decision = thought.parsedDecision;
  const isAgenda = decision?.type === 'agenda';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🧠</span>
            <span style={{ color: charColor, fontWeight: 'bold', fontSize: 16 }}>
              {thought.character}
            </span>
            <span style={{ color: '#666', fontSize: 12 }}>
              Thought #{thought.id}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatBadge label="Time" value={`${thought.elapsed}ms`} color="#4FC3F7" />
            <StatBadge label="Tokens" value={`~${thought.tokenEstimate}`} color="#FFD700" />
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
        </div>

        {/* Decision Summary */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#FFD700', marginBottom: 6 }}>
            {isAgenda ? '📋 AGENDA GENERATION' : '⚡ DECISION SUMMARY'}
          </div>
          {isAgenda ? (
            <div style={{ color: '#ccc', fontSize: 12 }}>
              {decision?.plan?.map((item, i) => (
                <div key={i} style={{ padding: '2px 0' }}>
                  <span style={{ color: '#888' }}>{item.time}</span>
                  {' — '}
                  <span>{item.activity}</span>
                  {item.duration && <span style={{ color: '#555' }}> ({item.duration})</span>}
                </div>
              ))}
            </div>
          ) : decision ? (
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '4px 10px', fontSize: 12 }}>
              <span style={{ color: '#888' }}>Action:</span>
              <span style={{ color: decision.valid ? '#4ADE80' : '#F44336', fontWeight: 'bold' }}>
                {decision.action || 'none'}
                {decision.valid === false && ' (invalid)'}
              </span>
              <span style={{ color: '#888' }}>Thought:</span>
              <span style={{ color: '#ddd', fontStyle: 'italic' }}>"{decision.thought || 'none'}"</span>
              {decision.speech && <>
                <span style={{ color: '#888' }}>Speech:</span>
                <span style={{ color: '#E1BEE7' }}>"{decision.speech}"</span>
              </>}
              {decision.speechTarget && <>
                <span style={{ color: '#888' }}>Target:</span>
                <span style={{ color: ROLE_COLORS[decision.speechTarget] || '#aaa' }}>{decision.speechTarget}</span>
              </>}
              {decision.emotion && <>
                <span style={{ color: '#888' }}>Emotion:</span>
                <span>{decision.emotion}</span>
              </>}
              {decision.lightAction && <>
                <span style={{ color: '#888' }}>Light:</span>
                <span>{decision.lightAction}</span>
              </>}
            </div>
          ) : (
            <span style={{ color: '#F44336', fontSize: 12 }}>No valid decision parsed</span>
          )}
        </div>

        {/* Scrollable prompt sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {/* System Prompt */}
          <CollapsibleSection
            title="SYSTEM PROMPT"
            icon="📐"
            expanded={expandSystem}
            onToggle={() => setExpandSystem(p => !p)}
            charCount={thought.systemPrompt?.length}
          >
            <pre style={preStyle}>{thought.systemPrompt || '(empty)'}</pre>
          </CollapsibleSection>

          {/* User Prompt */}
          <CollapsibleSection
            title="USER PROMPT"
            icon="📝"
            expanded={expandUser}
            onToggle={() => setExpandUser(p => !p)}
            charCount={thought.userPrompt?.length}
          >
            <pre style={preStyle}>{thought.userPrompt || '(empty)'}</pre>
          </CollapsibleSection>

          {/* Raw Response */}
          <CollapsibleSection
            title="RAW LLM RESPONSE"
            icon="🤖"
            expanded={expandRaw}
            onToggle={() => setExpandRaw(p => !p)}
            charCount={thought.rawResponse?.length}
          >
            <pre style={{ ...preStyle, color: '#A5D6A7' }}>{thought.rawResponse || '(no response)'}</pre>
          </CollapsibleSection>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={{ color: '#555', fontSize: 10 }}>
            {timeStr} • Thought #{thought.id} • {thought.character}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────── */

function StatBadge({ label, value, color }) {
  return (
    <div style={{
      padding: '2px 8px',
      borderRadius: 4,
      background: `${color}15`,
      border: `1px solid ${color}33`,
      fontSize: 10,
      color,
    }}>
      <span style={{ color: '#888' }}>{label}: </span>
      <span style={{ fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}

function CollapsibleSection({ title, icon, expanded, onToggle, charCount, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 4,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
          border: expanded ? '1px solid rgba(255,215,0,0.2)' : '1px solid rgba(255,255,255,0.06)',
          color: expanded ? '#FFD700' : '#888',
          fontFamily: '"Courier New", monospace',
          fontSize: 11,
          fontWeight: 'bold',
          transition: 'all 0.15s ease',
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>{icon}</span>
        <span>{title}</span>
        {charCount > 0 && (
          <span style={{ marginLeft: 'auto', color: '#555', fontWeight: 'normal', fontSize: 10 }}>
            {charCount.toLocaleString()} chars (~{Math.ceil(charCount / 4)} tok)
          </span>
        )}
      </button>
      {expanded && (
        <div style={{
          marginTop: 4,
          maxHeight: 300,
          overflowY: 'auto',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────── */

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle = {
  width: '85vw',
  maxWidth: 900,
  height: '80vh',
  maxHeight: 700,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(15, 15, 30, 0.98)',
  border: '1px solid rgba(255, 215, 0, 0.25)',
  borderRadius: 12,
  fontFamily: '"Courier New", monospace',
  color: '#e0e0e0',
  overflow: 'hidden',
  boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
};

const headerStyle = {
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
  background: 'rgba(0,0,0,0.3)',
};

const closeBtnStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  color: '#aaa',
  fontSize: 14,
  width: 28,
  height: 28,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const sectionStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const preStyle = {
  margin: 0,
  padding: '10px 12px',
  fontSize: 11,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: '#ccc',
  fontFamily: '"Courier New", monospace',
};

const footerStyle = {
  padding: '8px 16px',
  borderTop: '1px solid rgba(255,255,255,0.06)',
  textAlign: 'center',
};
