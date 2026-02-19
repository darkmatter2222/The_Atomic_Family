import React, { useState, useMemo, useEffect, useRef } from 'react';

/**
 * ConversationViewer — Full-height left AI Dashboard pane.
 *
 * Shows:
 *  - Token stats (TPM, per-character, total)
 *  - Character agenda/plan with completion tracking
 *  - Unified thought/speech/event timeline with clickable entries
 *  - Character filter and mood bar
 *
 * agenticState shape:
 *  {
 *    enabled, llmAvailable,
 *    personaStates: { [name]: { mood, moodIntensity, stressLevel, lastThought, currentGoal, ... } },
 *    social: { activeSpeech, recentConversations, activeEvents },
 *    stats: { totalDecisions, llmDecisions, fallbackDecisions, llmErrors, avgReasoningTimeMs, tokensPerMinute, tokensByCharacter, totalTokens },
 *    agendas: { [name]: { plan: [{time, activity, duration, done, completedAt}], completed, total, generatedForDay } },
 *    thoughtSummaries: { [name]: [{ id, timestamp, thought, action, speech, emotion, elapsed, tokens, valid }] },
 *  }
 */

const ROLE_COLORS = {
  Dad:  '#4FC3F7',
  Mom:  '#CE93D8',
  Emma: '#FF8A80',
  Lily: '#FFF176',
  Jack: '#A5D6A7',
};

const EMOTION_ICONS = {
  happy:     '😊', content:   '😌', calm:     '😐', neutral:   '😐',
  annoyed:   '😤', angry:     '😡', sad:      '😢', tired:     '😴',
  excited:   '🤩', worried:   '😟', amused:   '😄', firm:      '😠',
  loving:    '🥰', playful:   '😜', scared:   '😨', proud:     '🥲',
  confused:  '😕', frustrated:'😣', bored:    '😑',
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

// ── Tab definitions ──
const TABS = [
  { id: 'timeline', label: '⏱ Timeline' },
  { id: 'agendas',  label: '📋 Agendas' },
  { id: 'stats',    label: '📊 Stats' },
];

export default function ConversationViewer({ agenticState, selectedCharacter, onClose, onThoughtClick, onConversationClick }) {
  const [activeTab, setActiveTab] = useState('timeline');
  const [filter, setFilter] = useState('all');
  const [showThoughts, setShowThoughts] = useState(true);

  const social = agenticState?.social || { activeSpeech: [], recentConversations: [], activeEvents: [] };
  const personas = agenticState?.personaStates || {};
  const stats = agenticState?.stats || {};
  const agendas = agenticState?.agendas || {};
  const thoughtSummaries = agenticState?.thoughtSummaries || {};
  const enabled = agenticState?.enabled || false;

  if (!enabled) {
    return (
      <div style={panelStyle}>
        <PanelHeader onClose={onClose} stats={null} />
        <div style={{ padding: 30, textAlign: 'center', color: '#666' }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>🤖</div>
          <div style={{ fontSize: 14 }}>Agentic AI is not active</div>
          <div style={{ fontSize: 10, marginTop: 8, color: '#555' }}>
            Enable it from the controls or wait for the LLM service
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <PanelHeader onClose={onClose} stats={stats} llmAvailable={agenticState?.llmAvailable} />

      {/* Token stats bar */}
      <TokenStatsBar stats={stats} />

      {/* Character filter + mood bar */}
      <MoodBar personas={personas} filter={filter} setFilter={setFilter} />

      {/* Tab bar */}
      <div style={{
        padding: '4px 8px',
        display: 'flex',
        gap: 2,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {TABS.map(tab => (
          <TabButton
            key={tab.id}
            label={tab.label}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'timeline' && (
          <TimelineTab
            social={social}
            personas={personas}
            thoughtSummaries={thoughtSummaries}
            filter={filter}
            showThoughts={showThoughts}
            setShowThoughts={setShowThoughts}
            onThoughtClick={onThoughtClick}
            onConversationClick={onConversationClick}
          />
        )}
        {activeTab === 'agendas' && (
          <AgendaTab agendas={agendas} filter={filter} />
        )}
        {activeTab === 'stats' && (
          <StatsTab stats={stats} personas={personas} />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Panel Header
 * ════════════════════════════════════════════════════════════════ */

function PanelHeader({ onClose, stats, llmAvailable }) {
  return (
    <div style={{
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
      background: 'rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🧠</span>
        <span style={{
          fontSize: 13,
          fontWeight: 'bold',
          color: '#FFD700',
          letterSpacing: 1,
        }}>
          AI DASHBOARD
        </span>
        {llmAvailable !== undefined && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: llmAvailable ? '#4CAF50' : '#F44336',
            display: 'inline-block',
            boxShadow: llmAvailable ? '0 0 4px #4CAF50' : '0 0 4px #F44336',
          }} />
        )}
      </div>
      <button onClick={onClose} style={closeBtnStyle}>✕</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Token Stats Bar
 * ════════════════════════════════════════════════════════════════ */

function TokenStatsBar({ stats }) {
  const tpm = stats.tokensPerMinute || 0;
  const total = stats.totalTokens || 0;
  const decisions = stats.totalDecisions || 0;
  const avgTime = Math.round(stats.avgReasoningTimeMs || 0);

  return (
    <div style={{
      padding: '6px 12px',
      display: 'flex',
      gap: 8,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(0,0,0,0.15)',
      flexWrap: 'wrap',
    }}>
      <MiniStat label="TPM" value={tpm.toLocaleString()} color="#FFD700" />
      <MiniStat label="Total" value={formatTokens(total)} color="#4FC3F7" />
      <MiniStat label="Avg" value={`${avgTime}ms`} color="#A5D6A7" />
      <MiniStat label="Decisions" value={decisions} color="#CE93D8" />
      {stats.llmErrors > 0 && (
        <MiniStat label="Errors" value={stats.llmErrors} color="#F44336" />
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#666' }}>{label}:</span>
      <span style={{ color, fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

/* ════════════════════════════════════════════════════════════════
 *  Mood Bar (combined filter + mood display)
 * ════════════════════════════════════════════════════════════════ */

function MoodBar({ personas, filter, setFilter }) {
  return (
    <div style={{
      padding: '5px 10px',
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
      {Object.keys(ROLE_COLORS).map(name => {
        const persona = personas[name];
        const moodIcon = persona ? (EMOTION_ICONS[persona.mood] || '😐') : '❓';
        const stress = persona?.stressLevel || 0;
        return (
          <FilterChip
            key={name}
            label={`${name} ${moodIcon}${stress > 60 ? '⚡' : ''}`}
            color={ROLE_COLORS[name]}
            active={filter === name}
            onClick={() => setFilter(name)}
          />
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Timeline Tab
 * ════════════════════════════════════════════════════════════════ */

function TimelineTab({ social, personas, thoughtSummaries, filter, showThoughts, setShowThoughts, onThoughtClick, onConversationClick }) {
  const scrollRef = useRef(null);
  const prevLen = useRef(0);

  // Build unified timeline
  const timeline = useMemo(() => {
    const items = [];

    // Conversations
    for (const conv of social.recentConversations) {
      items.push({
        type: 'speech',
        timestamp: conv.timestamp,
        speaker: conv.speaker,
        target: conv.target,
        text: conv.text,
        emotion: conv.emotion,
        speechType: conv.type || 'statement',
        threadId: conv.threadId || null,
      });
    }

    // Thought summaries (from server — has IDs for click-to-inspect)
    if (showThoughts) {
      for (const [name, thoughts] of Object.entries(thoughtSummaries)) {
        for (const t of thoughts) {
          items.push({
            type: 'thought',
            timestamp: t.timestamp,
            speaker: name,
            text: t.thought,
            action: t.action,
            speech: t.speech,
            emotion: t.emotion,
            elapsed: t.elapsed,
            tokens: t.tokens,
            valid: t.valid,
            thoughtId: t.id,
            pipelineType: t.pipelineType || null,
            stageCount: t.stageCount || 0,
            stageNames: t.stageNames || [],
          });
        }
      }
    }

    // Active events
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

    // Filter
    if (filter !== 'all') {
      return items.filter(item =>
        item.speaker === filter || item.target === filter || item.source === filter
      );
    }

    return items;
  }, [social, thoughtSummaries, showThoughts, filter]);

  // Auto-scroll
  useEffect(() => {
    if (timeline.length > prevLen.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLen.current = timeline.length;
  }, [timeline.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thoughts toggle */}
      <div style={{
        padding: '4px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 10, color: '#666' }}>
          {timeline.length} entries
        </span>
        <FilterChip
          label={showThoughts ? '💭 Thoughts On' : '💭 Thoughts Off'}
          active={showThoughts}
          onClick={() => setShowThoughts(p => !p)}
        />
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {timeline.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#555', marginTop: 40 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 12 }}>No activity yet</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>
              Characters will appear here as they think and talk
            </div>
          </div>
        ) : (
          timeline.map((item, i) => {
            if (item.type === 'speech') return (
              <SpeechEntry
                key={`s-${i}`}
                item={item}
                onClick={() => onConversationClick && item.threadId && onConversationClick(item.threadId)}
              />
            );
            if (item.type === 'thought') return (
              <ThoughtEntry
                key={`t-${item.thoughtId || i}`}
                item={item}
                onClick={() => onThoughtClick && item.thoughtId && onThoughtClick(item.thoughtId)}
              />
            );
            if (item.type === 'event') return <EventEntry key={`e-${i}`} item={item} />;
            return null;
          })
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Agenda Tab
 * ════════════════════════════════════════════════════════════════ */

function AgendaTab({ agendas, filter }) {
  const names = filter === 'all' ? Object.keys(agendas) : [filter];

  return (
    <div style={{ padding: '8px 10px' }}>
      {names.map(name => {
        const agenda = agendas[name];
        if (!agenda || !agenda.plan || agenda.plan.length === 0) {
          return (
            <div key={name} style={{ marginBottom: 12 }}>
              <CharacterLabel name={name} />
              <div style={{ color: '#555', fontSize: 11, padding: '6px 0', fontStyle: 'italic' }}>
                No agenda planned yet
              </div>
            </div>
          );
        }

        const completedCount = agenda.completed || 0;
        const total = agenda.total || agenda.plan.length;
        const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

        return (
          <div key={name} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <CharacterLabel name={name} />
              <span style={{ fontSize: 10, color: '#888' }}>
                {completedCount}/{total} done ({pct}%)
              </span>
            </div>

            {/* Progress bar */}
            <div style={{
              height: 3, borderRadius: 2, marginBottom: 6,
              background: 'rgba(255,255,255,0.08)',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${pct}%`,
                background: ROLE_COLORS[name] || '#FFD700',
                transition: 'width 0.3s ease',
              }} />
            </div>

            {/* Agenda items */}
            {agenda.plan.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 6px',
                marginBottom: 2,
                borderRadius: 4,
                background: item.done ? 'rgba(76,175,80,0.08)' : 'rgba(255,255,255,0.02)',
                border: item.done
                  ? '1px solid rgba(76,175,80,0.15)'
                  : '1px solid rgba(255,255,255,0.04)',
                fontSize: 11,
              }}>
                <span style={{ fontSize: 12 }}>{item.done ? '✅' : '⬜'}</span>
                <span style={{ color: '#888', minWidth: 40 }}>{item.time}</span>
                <span style={{
                  color: item.done ? '#888' : '#ccc',
                  textDecoration: item.done ? 'line-through' : 'none',
                  flex: 1,
                }}>
                  {item.activity}
                </span>
                {item.duration && (
                  <span style={{ color: '#555', fontSize: 9 }}>{item.duration}</span>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {names.length === 0 && (
        <div style={{ textAlign: 'center', color: '#555', marginTop: 30 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 11 }}>No agendas yet</div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Stats Tab
 * ════════════════════════════════════════════════════════════════ */

function StatsTab({ stats, personas }) {
  const byChar = stats.tokensByCharacter || {};
  const sortedChars = Object.entries(byChar).sort((a, b) => b[1] - a[1]);
  const maxCharTokens = sortedChars.length > 0 ? sortedChars[0][1] : 1;

  return (
    <div style={{ padding: '10px 12px' }}>
      {/* Global stats */}
      <div style={{ marginBottom: 14 }}>
        <SectionLabel text="GLOBAL STATS" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatCard label="Tokens/Min" value={(stats.tokensPerMinute || 0).toLocaleString()} color="#FFD700" />
          <StatCard label="Total Tokens" value={formatTokens(stats.totalTokens || 0)} color="#4FC3F7" />
          <StatCard label="LLM Decisions" value={stats.llmDecisions || 0} color="#A5D6A7" />
          <StatCard label="Fallbacks" value={stats.fallbackDecisions || 0} color="#FF8A80" />
          <StatCard label="Errors" value={stats.llmErrors || 0} color="#F44336" />
          <StatCard label="Avg Time" value={`${Math.round(stats.avgReasoningTimeMs || 0)}ms`} color="#CE93D8" />
        </div>
      </div>

      {/* Per-character tokens */}
      <div style={{ marginBottom: 14 }}>
        <SectionLabel text="TOKENS PER CHARACTER (1-MIN)" />
        {sortedChars.length === 0 ? (
          <div style={{ color: '#555', fontSize: 11, fontStyle: 'italic' }}>No token data yet</div>
        ) : (
          sortedChars.map(([name, tokens]) => (
            <div key={name} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: ROLE_COLORS[name] || '#aaa', fontSize: 11, fontWeight: 'bold' }}>{name}</span>
                <span style={{ color: '#888', fontSize: 10 }}>{tokens.toLocaleString()} tok</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${Math.max(2, (tokens / Math.max(maxCharTokens, 1)) * 100)}%`,
                  background: ROLE_COLORS[name] || '#FFD700',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Character moods & goals */}
      <div>
        <SectionLabel text="CHARACTER STATE" />
        {Object.entries(personas).map(([name, state]) => (
          <div key={name} style={{
            marginBottom: 6, padding: '6px 8px', borderRadius: 5,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ color: ROLE_COLORS[name] || '#aaa', fontWeight: 'bold', fontSize: 11 }}>{name}</span>
              <span style={{ fontSize: 13 }}>{EMOTION_ICONS[state.mood] || '😐'}</span>
              {state.stressLevel > 50 && (
                <span style={{ fontSize: 9, color: '#F44336' }}>stress: {state.stressLevel}%</span>
              )}
            </div>
            {state.currentGoal && (
              <div style={{ fontSize: 10, color: '#888' }}>
                Goal: <span style={{ color: '#A5D6A7' }}>{state.currentGoal}</span>
              </div>
            )}
            {state.lastThought && (
              <div style={{ fontSize: 10, color: '#666', fontStyle: 'italic', marginTop: 2 }}>
                💭 {state.lastThought}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Timeline Entry Components
 * ════════════════════════════════════════════════════════════════ */

function SpeechEntry({ item, onClick }) {
  const nameColor = ROLE_COLORS[item.speaker] || '#aaa';
  const typeStyle = SPEECH_TYPE_STYLES[item.speechType] || SPEECH_TYPE_STYLES.statement;
  const emotionIcon = EMOTION_ICONS[item.emotion] || '';
  const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isClickable = !!onClick && !!item.threadId;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        marginBottom: 5,
        padding: '5px 8px',
        borderRadius: 5,
        background: typeStyle.bg,
        border: `1px solid ${typeStyle.border}`,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={isClickable ? (e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; } : undefined}
      onMouseLeave={isClickable ? (e) => { e.currentTarget.style.background = typeStyle.bg; } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 10 }}>{typeStyle.icon}</span>
        <span style={{ color: nameColor, fontWeight: 'bold', fontSize: 10 }}>{item.speaker}</span>
        <span style={{ color: '#555', fontSize: 9 }}>→</span>
        <span style={{ color: ROLE_COLORS[item.target] || '#888', fontSize: 10 }}>{item.target}</span>
        {item.threadId && <span style={{ fontSize: 8, color: '#4FC3F7', marginLeft: 2 }}>🔗</span>}
        {emotionIcon && <span style={{ marginLeft: 'auto', fontSize: 11 }}>{emotionIcon}</span>}
        <span style={{ color: '#444', fontSize: 8, marginLeft: emotionIcon ? 4 : 'auto' }}>{timeStr}</span>
        {isClickable && <span style={{ fontSize: 8, color: '#FFD700' }}>🔍</span>}
      </div>
      <div style={{ color: '#ddd', fontSize: 11, lineHeight: 1.3, paddingLeft: 2 }}>
        &ldquo;{item.text}&rdquo;
      </div>
    </div>
  );
}

function ThoughtEntry({ item, onClick }) {
  const nameColor = ROLE_COLORS[item.speaker] || '#aaa';
  const moodIcon = EMOTION_ICONS[item.emotion] || '💭';
  const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isClickable = !!onClick && !!item.thoughtId;

  // Pipeline type visual config
  const pipelineStyles = {
    full:         { icon: '🧠', label: 'Full', color: '#7986CB', bg: 'rgba(63,81,181,0.1)' },
    conversation: { icon: '💬', label: 'Conv', color: '#81C784', bg: 'rgba(76,175,80,0.1)' },
    background:   { icon: '💭', label: 'BG',   color: '#BA68C8', bg: 'rgba(156,39,176,0.1)' },
    agenda:       { icon: '📋', label: 'Plan', color: '#FFB74D', bg: 'rgba(255,152,0,0.1)' },
  };
  const pipelineCfg = pipelineStyles[item.pipelineType] || null;

  return (
    <div
      onClick={isClickable ? onClick : undefined}
      style={{
        marginBottom: 4,
        padding: '4px 8px',
        borderRadius: 5,
        background: item.valid === false ? 'rgba(244,67,54,0.06)' : (pipelineCfg?.bg || 'rgba(100, 100, 150, 0.08)'),
        border: item.valid === false
          ? '1px solid rgba(244,67,54,0.15)'
          : `1px solid ${pipelineCfg ? pipelineCfg.color + '22' : 'rgba(100, 100, 150, 0.12)'}`,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={isClickable ? (e) => { e.currentTarget.style.background = 'rgba(100,100,150,0.18)'; } : undefined}
      onMouseLeave={isClickable ? (e) => { e.currentTarget.style.background = item.valid === false ? 'rgba(244,67,54,0.06)' : (pipelineCfg?.bg || 'rgba(100,100,150,0.08)'); } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10 }}>{pipelineCfg?.icon || '💭'}</span>
        <span style={{ color: nameColor, fontWeight: 'bold', fontSize: 10 }}>{item.speaker}</span>
        {/* Pipeline type badge */}
        {pipelineCfg && (
          <span style={{
            fontSize: 8,
            padding: '0px 4px',
            borderRadius: 3,
            background: `${pipelineCfg.color}15`,
            border: `1px solid ${pipelineCfg.color}33`,
            color: pipelineCfg.color,
            fontWeight: 'bold',
          }}>
            {pipelineCfg.label}
            {item.stageCount > 0 && ` ×${item.stageCount}`}
          </span>
        )}
        {item.action && (
          <span style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.2)',
            color: '#FFD700',
          }}>
            {item.action}
          </span>
        )}
        <span style={{ color: '#666', fontSize: 10, flex: 1, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.text}
        </span>
        <span style={{ fontSize: 11 }}>{moodIcon}</span>
      </div>
      {item.speech && (
        <div style={{ fontSize: 10, color: '#B39DDB', marginTop: 2, paddingLeft: 16 }}>
          🗣️ &ldquo;{item.speech}&rdquo;
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 2, paddingLeft: 16 }}>
        {item.elapsed > 0 && (
          <span style={{ fontSize: 8, color: '#555' }}>{item.elapsed}ms</span>
        )}
        {item.tokens > 0 && (
          <span style={{ fontSize: 8, color: '#555' }}>~{item.tokens}tok</span>
        )}
        <span style={{ fontSize: 8, color: '#444', marginLeft: 'auto' }}>{timeStr}</span>
        {isClickable && (
          <span style={{ fontSize: 8, color: '#FFD700' }}>🔍</span>
        )}
      </div>
    </div>
  );
}

function EventEntry({ item }) {
  return (
    <div style={{
      marginBottom: 3,
      padding: '3px 8px',
      borderRadius: 5,
      background: 'rgba(255, 150, 0, 0.06)',
      border: '1px solid rgba(255, 150, 0, 0.12)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 9, color: '#FFA726' }}>
        ⚡ {item.text}
        {item.room && <span style={{ color: '#666' }}> ({item.room})</span>}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Shared sub-components
 * ════════════════════════════════════════════════════════════════ */

function CharacterLabel({ name }) {
  return (
    <span style={{
      color: ROLE_COLORS[name] || '#aaa',
      fontWeight: 'bold',
      fontSize: 12,
      letterSpacing: 0.5,
    }}>
      {name}
    </span>
  );
}

function SectionLabel({ text }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 'bold', color: '#FFD700',
      letterSpacing: 1, marginBottom: 6,
    }}>
      {text}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      padding: '6px 8px', borderRadius: 5,
      background: `${color}08`,
      border: `1px solid ${color}20`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 14, fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FilterChip({ label, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 7px',
        borderRadius: 10,
        fontSize: 9,
        fontFamily: '"Courier New", monospace',
        fontWeight: active ? 'bold' : 'normal',
        cursor: 'pointer',
        background: active ? (color || '#FFD700') + '22' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? (color || '#FFD700') + '55' : 'rgba(255,255,255,0.06)'}`,
        color: active ? (color || '#FFD700') : '#666',
        transition: 'all 0.12s ease',
      }}
    >{label}</button>
  );
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 4px',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: '"Courier New", monospace',
        fontWeight: active ? 'bold' : 'normal',
        cursor: 'pointer',
        background: active ? 'rgba(255,215,0,0.12)' : 'transparent',
        border: active ? '1px solid rgba(255,215,0,0.25)' : '1px solid transparent',
        color: active ? '#FFD700' : '#666',
        transition: 'all 0.12s ease',
        textAlign: 'center',
      }}
    >{label}</button>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Panel styles — Full-height left pane
 * ════════════════════════════════════════════════════════════════ */

const panelStyle = {
  position: 'absolute',
  top: 20,
  bottom: 20,
  left: 20,
  width: 380,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(10, 10, 25, 0.94)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255, 215, 0, 0.15)',
  borderRadius: 10,
  fontFamily: '"Courier New", monospace',
  color: '#e0e0e0',
  fontSize: 12,
  overflow: 'hidden',
};

const closeBtnStyle = {
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
};
