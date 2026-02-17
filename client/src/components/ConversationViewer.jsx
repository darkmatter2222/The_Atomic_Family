import React, { useState, useMemo, useEffect, useRef } from 'react';

/**
 * ConversationViewer — A floating panel that shows real-time conversations
 * between family members, with filtering, search, and character-specific views.
 *
 * Data shape from server (via agenticState.social):
 *  activeSpeech: [{ speaker, target, text, emotion, type, expiresAt }]
 *  recentConversations: [{ speaker, target, text, emotion, type, timestamp }]
 *  activeEvents: [{ id, source, room, description, timestamp }]
 *
 * Data from agenticState.personaStates:
 *  { [name]: { mood, moodIntensity, stressLevel, lastThought, currentGoal, pendingSpeech, recentConversations } }
 */

const ROLE_COLORS = {
  Dad:  '#4FC3F7',
  Mom:  '#CE93D8',
  Emma: '#FF8A80',
  Lily: '#FFF176',
  Jack: '#A5D6A7',
};

const EMOTION_ICONS = {
  happy:     '😊',
  content:   '😌',
  calm:      '😐',
  neutral:   '😐',
  annoyed:   '😤',
  angry:     '😡',
  sad:       '😢',
  tired:     '😴',
  excited:   '🤩',
  worried:   '😟',
  amused:    '😄',
  firm:      '😠',
  loving:    '🥰',
  playful:   '😜',
  scared:    '😨',
  proud:     '🥲',
  confused:  '😕',
  frustrated:'😣',
  bored:     '😑',
};

const SPEECH_TYPE_STYLES = {
  command:   { bg: '#B71C1C22', border: '#EF535044', icon: '📢' },
  question:  { bg: '#1565C022', border: '#42A5F544', icon: '❓' },
  yell:      { bg: '#E6511122', border: '#FF572244', icon: '📣' },
  affection: { bg: '#880E4F22', border: '#EC407A44', icon: '💕' },
  apology:   { bg: '#4A148C22', border: '#AB47BC44', icon: '🙏' },
  complaint: { bg: '#4E342E22', border: '#8D6E6344', icon: '💢' },
  statement: { bg: '#1B5E2022', border: '#66BB6A44', icon: '💬' },
};

export default function ConversationViewer({ agenticState, selectedCharacter, onClose }) {
  const [filter, setFilter] = useState('all'); // 'all' | specific character name
  const [showThoughts, setShowThoughts] = useState(true);
  const scrollRef = useRef(null);
  const prevConvCount = useRef(0);

  const social = agenticState?.social || { activeSpeech: [], recentConversations: [], activeEvents: [] };
  const personas = agenticState?.personaStates || {};
  const enabled = agenticState?.enabled || false;

  // Combine conversations and thoughts into a unified timeline
  const timeline = useMemo(() => {
    const items = [];

    // Add conversations
    for (const conv of social.recentConversations) {
      items.push({
        type: 'speech',
        timestamp: conv.timestamp,
        speaker: conv.speaker,
        target: conv.target,
        text: conv.text,
        emotion: conv.emotion,
        speechType: conv.type || 'statement',
      });
    }

    // Add thoughts from persona states if enabled
    if (showThoughts) {
      for (const [name, state] of Object.entries(personas)) {
        if (state.lastThought) {
          items.push({
            type: 'thought',
            timestamp: Date.now() - 1000, // approximate — thoughts are current
            speaker: name,
            text: state.lastThought,
            mood: state.mood,
          });
        }
      }
    }

    // Add active events
    for (const evt of social.activeEvents) {
      items.push({
        type: 'event',
        timestamp: evt.timestamp,
        source: evt.source,
        text: evt.description,
        room: evt.room,
      });
    }

    // Sort by time, newest at bottom
    items.sort((a, b) => a.timestamp - b.timestamp);

    // Apply filter
    if (filter !== 'all') {
      return items.filter(item =>
        item.speaker === filter || item.target === filter || item.source === filter
      );
    }

    return items;
  }, [social, personas, showThoughts, filter]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (timeline.length > prevConvCount.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevConvCount.current = timeline.length;
  }, [timeline.length]);

  if (!enabled) {
    return (
      <div style={panelStyle}>
        <PanelHeader onClose={onClose} />
        <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
          <div>Agentic AI is not active</div>
          <div style={{ fontSize: 10, marginTop: 6, color: '#555' }}>
            Enable it from the controls panel or wait for the LLM service to connect
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <PanelHeader onClose={onClose} />

      {/* Status bar */}
      <div style={{
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: agenticState?.llmAvailable ? '#4CAF50' : '#F44336',
          display: 'inline-block',
        }} />
        <span style={{ color: '#888' }}>
          LLM {agenticState?.llmAvailable ? 'Connected' : 'Offline'}
        </span>
        {agenticState?.stats && (
          <span style={{ color: '#555', marginLeft: 'auto' }}>
            {agenticState.stats.totalDecisions || 0} decisions | {agenticState.stats.fallbackCount || 0} fallbacks
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{
        padding: '6px 10px',
        display: 'flex',
        gap: 4,
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        {Object.keys(ROLE_COLORS).map(name => (
          <FilterChip
            key={name}
            label={name}
            color={ROLE_COLORS[name]}
            active={filter === name}
            onClick={() => setFilter(name)}
          />
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <FilterChip
            label={showThoughts ? '💭 On' : '💭 Off'}
            active={showThoughts}
            onClick={() => setShowThoughts(p => !p)}
          />
        </div>
      </div>

      {/* Persona mood bar */}
      <div style={{
        padding: '4px 10px',
        display: 'flex',
        gap: 10,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 10,
      }}>
        {Object.entries(personas).map(([name, state]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ color: ROLE_COLORS[name] || '#aaa', fontWeight: 'bold' }}>
              {name}
            </span>
            <span>{EMOTION_ICONS[state.mood] || '😐'}</span>
            {state.stressLevel > 60 && <span style={{ color: '#F44336' }}>⚡</span>}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 10px',
      }}>
        {timeline.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#555', marginTop: 30 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
            <div>No conversations yet</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>
              Characters will start talking as they make decisions
            </div>
          </div>
        ) : (
          timeline.map((item, i) => {
            if (item.type === 'speech') return <SpeechEntry key={i} item={item} />;
            if (item.type === 'thought') return <ThoughtEntry key={i} item={item} />;
            if (item.type === 'event') return <EventEntry key={i} item={item} />;
            return null;
          })
        )}
      </div>
    </div>
  );
}

/* ─── Panel Header ──────────────────────────────── */

function PanelHeader({ onClose }) {
  return (
    <div style={{
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🗣️</span>
        <span style={{
          fontSize: 14,
          fontWeight: 'bold',
          color: '#FFD700',
          letterSpacing: 1,
        }}>
          CONVERSATIONS
        </span>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4,
          color: '#aaa',
          fontSize: 14,
          width: 24,
          height: 24,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >✕</button>
    </div>
  );
}

/* ─── Filter Chip ───────────────────────────────── */

function FilterChip({ label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 10,
        fontFamily: '"Courier New", monospace',
        fontWeight: active ? 'bold' : 'normal',
        cursor: 'pointer',
        background: active ? (color || '#FFD700') + '22' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? (color || '#FFD700') + '66' : 'rgba(255,255,255,0.08)'}`,
        color: active ? (color || '#FFD700') : '#777',
        transition: 'all 0.12s ease',
      }}
    >{label}</button>
  );
}

/* ─── Speech Entry ──────────────────────────────── */

function SpeechEntry({ item }) {
  const nameColor = ROLE_COLORS[item.speaker] || '#aaa';
  const typeStyle = SPEECH_TYPE_STYLES[item.speechType] || SPEECH_TYPE_STYLES.statement;
  const emotionIcon = EMOTION_ICONS[item.emotion] || '';
  const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      marginBottom: 6,
      padding: '6px 10px',
      borderRadius: 6,
      background: typeStyle.bg,
      border: `1px solid ${typeStyle.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ fontSize: 11 }}>{typeStyle.icon}</span>
        <span style={{ color: nameColor, fontWeight: 'bold', fontSize: 11 }}>
          {item.speaker}
        </span>
        <span style={{ color: '#555', fontSize: 10 }}>→</span>
        <span style={{ color: ROLE_COLORS[item.target] || '#888', fontSize: 11 }}>
          {item.target}
        </span>
        {emotionIcon && <span style={{ marginLeft: 'auto', fontSize: 12 }}>{emotionIcon}</span>}
        <span style={{ color: '#444', fontSize: 9, marginLeft: emotionIcon ? 4 : 'auto' }}>{timeStr}</span>
      </div>
      <div style={{ color: '#ddd', fontSize: 12, lineHeight: 1.4, paddingLeft: 2 }}>
        "{item.text}"
      </div>
    </div>
  );
}

/* ─── Thought Entry ─────────────────────────────── */

function ThoughtEntry({ item }) {
  const nameColor = ROLE_COLORS[item.speaker] || '#aaa';
  const moodIcon = EMOTION_ICONS[item.mood] || '💭';

  return (
    <div style={{
      marginBottom: 4,
      padding: '4px 10px',
      borderRadius: 6,
      background: 'rgba(100, 100, 150, 0.08)',
      border: '1px solid rgba(100, 100, 150, 0.15)',
      fontStyle: 'italic',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11 }}>💭</span>
        <span style={{ color: nameColor, fontWeight: 'bold', fontSize: 10 }}>{item.speaker}</span>
        <span style={{ color: '#666', fontSize: 11, flex: 1 }}>{item.text}</span>
        <span style={{ fontSize: 12 }}>{moodIcon}</span>
      </div>
    </div>
  );
}

/* ─── Event Entry ───────────────────────────────── */

function EventEntry({ item }) {
  return (
    <div style={{
      marginBottom: 4,
      padding: '4px 10px',
      borderRadius: 6,
      background: 'rgba(255, 150, 0, 0.08)',
      border: '1px solid rgba(255, 150, 0, 0.15)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 10, color: '#FFA726' }}>
        ⚡ {item.text}
        {item.room && <span style={{ color: '#777' }}> ({item.room})</span>}
      </span>
    </div>
  );
}

/* ─── Panel styles ──────────────────────────────── */

const panelStyle = {
  position: 'absolute',
  bottom: 20,
  left: 20,
  width: 360,
  maxHeight: 420,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(10, 10, 25, 0.92)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 215, 0, 0.15)',
  borderRadius: 10,
  fontFamily: '"Courier New", monospace',
  color: '#e0e0e0',
  fontSize: 12,
  overflow: 'hidden',
};
