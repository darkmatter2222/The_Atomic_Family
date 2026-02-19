import React, { useState } from 'react';

/**
 * ThoughtDetailModal — Full inspection modal for a multi-agent reasoning pipeline.
 *
 * Shows:
 *  - Pipeline type badge (Full / Conversation / Background / Agenda)
 *  - Pipeline flow visualization (stage icons connected by arrows)
 *  - Each stage as a collapsible section with:
 *    · Agent name and icon
 *    · System prompt
 *    · User prompt
 *    · Response
 *    · Stage elapsed time and tokens
 *  - Final parsed decision summary
 */

const ROLE_COLORS = {
  Dad:  '#4FC3F7',
  Mom:  '#CE93D8',
  Emma: '#FF8A80',
  Lily: '#FFF176',
  Jack: '#A5D6A7',
};

const PIPELINE_COLORS = {
  full:         { bg: '#1A237E', border: '#3F51B5', label: '🧠 Full Deliberation', color: '#7986CB' },
  conversation: { bg: '#1B5E20', border: '#4CAF50', label: '💬 Conversation',      color: '#81C784' },
  background:   { bg: '#4A148C', border: '#9C27B0', label: '💭 Background Think',  color: '#BA68C8' },
  agenda:       { bg: '#E65100', border: '#FF9800', label: '📋 Agenda Planning',   color: '#FFB74D' },
  error:        { bg: '#B71C1C', border: '#F44336', label: '❌ Error',             color: '#E57373' },
  unknown:      { bg: '#37474F', border: '#607D8B', label: '❓ Unknown',           color: '#90A4AE' },
};

export default function ThoughtDetailModal({ thought, onClose }) {
  const [expandedStages, setExpandedStages] = useState({});
  const [renderError, setRenderError] = useState(null);

  if (!thought) return null;

  // Safely access fields with fallbacks
  const charColor = ROLE_COLORS[thought.character] || '#aaa';
  let timeStr;
  try {
    timeStr = new Date(thought.timestamp).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch {
    timeStr = '??:??:??';
  }

  const decision = thought.parsedDecision;
  const isAgenda = decision?.type === 'agenda';
  const isBackground = thought.pipelineType === 'background';
  const stages = thought.stages || [];
  const pipelineType = thought.pipelineType || 'unknown';
  const pipelineConfig = PIPELINE_COLORS[pipelineType] || PIPELINE_COLORS.unknown;
  const tokenEstimate = thought.tokenEstimate || 0;
  const elapsed = thought.elapsed || 0;

  const toggleStage = (idx) => {
    setExpandedStages(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // If there was a rendering error, show a fallback
  if (renderError) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={headerStyle}>
            <span style={{ color: '#F44336', fontWeight: 'bold' }}>⚠ Render Error</span>
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
          <div style={{ padding: 20, color: '#E57373', fontSize: 12 }}>
            <p>Error rendering thought detail:</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#888' }}>{String(renderError)}</pre>
            <p style={{ color: '#888', marginTop: 12 }}>Raw data:</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 10, color: '#555', maxHeight: 300, overflow: 'auto' }}>
              {JSON.stringify(thought, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  try {
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
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: pipelineConfig.bg,
              border: `1px solid ${pipelineConfig.border}`,
              color: pipelineConfig.color,
              fontSize: 10,
              fontWeight: 'bold',
            }}>
              {pipelineConfig.label}
            </span>
            <span style={{ color: '#555', fontSize: 11 }}>
              #{thought.id}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatBadge label="Stages" value={stages.length} color={pipelineConfig.color} />
            <StatBadge label="Time" value={`${elapsed}ms`} color="#4FC3F7" />
            <StatBadge label="Tokens" value={`~${tokenEstimate}`} color="#FFD700" />
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
        </div>

        {/* Pipeline Flow Visualization */}
        {stages.length > 1 && (
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            flexWrap: 'wrap',
          }}>
            {stages.map((stage, i) => (
              <React.Fragment key={i}>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: stage.error ? 'rgba(244,67,54,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${stage.error ? 'rgba(244,67,54,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    fontSize: 10,
                    color: stage.error ? '#E57373' : '#bbb',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleStage(i)}
                  title={`${stage.agent}: ${stage.elapsed}ms, ~${stage.tokens} tok`}
                >
                  {stage.icon || '⚙️'} {stage.name}
                  <span style={{ color: '#555', marginLeft: 4 }}>{stage.elapsed}ms</span>
                </span>
                {i < stages.length - 1 && (
                  <span style={{ color: '#444', fontSize: 12 }}>→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Decision Summary */}
        <div style={sectionStyle}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: pipelineConfig.color, marginBottom: 6 }}>
            {isAgenda ? '📋 AGENDA' : isBackground ? '💭 INNER THOUGHT' : '⚡ DECISION'}
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
          ) : isBackground ? (
            <div style={{ fontSize: 12 }}>
              {decision?.thought && (
                <div style={{ color: '#CE93D8', fontStyle: 'italic', marginBottom: 4 }}>
                  💭 "{decision.thought}"
                </div>
              )}
              {decision?.mood && (
                <div style={{ color: '#888', fontSize: 11 }}>Mood: {decision.mood}</div>
              )}
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

        {/* Scrollable pipeline stages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {stages.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 20, fontSize: 12 }}>
              No pipeline stage data available
            </div>
          )}
          {stages.map((stage, i) => (
            <PipelineStageSection
              key={i}
              stage={stage}
              index={i}
              total={stages.length}
              expanded={!!expandedStages[i]}
              onToggle={() => toggleStage(i)}
              pipelineColor={pipelineConfig.color}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <span style={{ color: '#555', fontSize: 10 }}>
            {timeStr} • #{thought.id} • {thought.character} • {pipelineConfig.label} • {stages.length} stage{stages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
  } catch (err) {
    // If rendering fails, save the error so the fallback UI shows next render
    if (!renderError) setRenderError(err?.message || String(err));
    return null;
  }
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

/**
 * A single pipeline stage — shows agent name, icon, and collapsible prompt/response.
 */
function PipelineStageSection({ stage, index, total, expanded, onToggle, pipelineColor }) {
  const [showSysPrompt, setShowSysPrompt] = useState(false);
  const [showUserPrompt, setShowUserPrompt] = useState(false);
  const [showResponse, setShowResponse] = useState(true);

  const hasError = !!stage.error;

  return (
    <div style={{
      marginBottom: 8,
      borderRadius: 6,
      border: `1px solid ${hasError ? 'rgba(244,67,54,0.2)' : expanded ? `${pipelineColor}33` : 'rgba(255,255,255,0.06)'}`,
      overflow: 'hidden',
    }}>
      {/* Stage header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          cursor: 'pointer',
          background: expanded ? `${pipelineColor}08` : 'rgba(0,0,0,0.2)',
          border: 'none',
          color: expanded ? pipelineColor : '#999',
          fontFamily: '"Courier New", monospace',
          fontSize: 12,
          fontWeight: 'bold',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{
          width: 20, height: 20,
          borderRadius: '50%',
          background: expanded ? `${pipelineColor}25` : 'rgba(255,255,255,0.05)',
          border: `1px solid ${expanded ? pipelineColor : 'rgba(255,255,255,0.1)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 'bold',
          color: expanded ? pipelineColor : '#666',
        }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 14 }}>{stage.icon || '⚙️'}</span>
        <span>{stage.name}</span>
        <span style={{ color: '#555', fontWeight: 'normal', fontSize: 10 }}>({stage.agent})</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 10, fontWeight: 'normal' }}>
          {hasError ? (
            <span style={{ color: '#E57373' }}>ERROR</span>
          ) : (
            <>
              <span style={{ color: '#4FC3F7' }}>{stage.elapsed}ms</span>
              <span style={{ color: '#FFD700' }}>~{stage.tokens}tok</span>
            </>
          )}
          <span>{expanded ? '▼' : '▶'}</span>
        </span>
      </button>

      {/* Expanded stage content */}
      {expanded && (
        <div style={{ padding: '4px 10px 8px' }}>
          {hasError && (
            <div style={{
              padding: '6px 10px',
              background: 'rgba(244,67,54,0.1)',
              border: '1px solid rgba(244,67,54,0.2)',
              borderRadius: 4,
              color: '#E57373',
              fontSize: 11,
              marginBottom: 6,
            }}>
              ❌ {stage.error}
            </div>
          )}

          {/* System Prompt (nested collapsible) */}
          {stage.systemPrompt && (
            <NestedCollapsible
              title="System Prompt"
              icon="📐"
              expanded={showSysPrompt}
              onToggle={() => setShowSysPrompt(p => !p)}
              charCount={stage.systemPrompt.length}
            >
              <pre style={preStyle}>{stage.systemPrompt}</pre>
            </NestedCollapsible>
          )}

          {/* User Prompt (nested collapsible) */}
          {stage.userPrompt && (
            <NestedCollapsible
              title="User Prompt"
              icon="📝"
              expanded={showUserPrompt}
              onToggle={() => setShowUserPrompt(p => !p)}
              charCount={stage.userPrompt.length}
            >
              <pre style={preStyle}>{stage.userPrompt}</pre>
            </NestedCollapsible>
          )}

          {/* Response (always shown by default) */}
          {stage.response && (
            <NestedCollapsible
              title="Agent Response"
              icon="🤖"
              expanded={showResponse}
              onToggle={() => setShowResponse(p => !p)}
              charCount={stage.response.length}
            >
              <pre style={{ ...preStyle, color: '#A5D6A7' }}>{stage.response}</pre>
            </NestedCollapsible>
          )}
        </div>
      )}
    </div>
  );
}

function NestedCollapsible({ title, icon, expanded, onToggle, charCount, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          borderRadius: 3,
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
          border: `1px solid ${expanded ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
          color: expanded ? '#bbb' : '#666',
          fontFamily: '"Courier New", monospace',
          fontSize: 10,
          transition: 'all 0.15s ease',
        }}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>{icon}</span>
        <span>{title}</span>
        {charCount > 0 && (
          <span style={{ marginLeft: 'auto', color: '#444', fontSize: 9 }}>
            {charCount.toLocaleString()} chars
          </span>
        )}
      </button>
      {expanded && (
        <div style={{
          marginTop: 2,
          maxHeight: 200,
          overflowY: 'auto',
          borderRadius: 3,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.04)',
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
  zIndex: 99999,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'all',
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
