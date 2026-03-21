import { useEffect, useRef, useState } from 'react';

const AGENT_AVATARS = {
  Susi: '🧑‍💼',
  Peter: '📋',
  Tobias: '🔧',
  Felix: '🎨',
  Bernd: '⚙️',
  David: '🗄️',
  Konstantin: '💰',
};

const CARD_STYLES = {
  'agent:start': 'border-blue-400 bg-blue-50',
  'agent:done': 'border-green-400 bg-green-50',
  'agent:error': 'border-red-400 bg-red-50',
  connected: 'border-gray-300 bg-gray-50',
};

const BADGE_STYLES = {
  'agent:start': 'bg-blue-100 text-blue-700',
  'agent:done': 'bg-green-100 text-green-700',
  'agent:error': 'bg-red-100 text-red-700',
};

const LABEL = {
  'agent:start': 'start',
  'agent:done': 'done',
  'agent:error': 'error',
};

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function EventCard({ ev }) {
  const [open, setOpen] = useState(false);
  const cardCls = CARD_STYLES[ev.type] ?? 'border-gray-300 bg-gray-50';
  const badgeCls = BADGE_STYLES[ev.type] ?? 'bg-gray-100 text-gray-600';

  if (ev.type === 'connected') {
    return (
      <div className="border-l-4 border-gray-300 bg-gray-50 rounded px-3 py-2 text-xs text-gray-400 italic">
        Verbunden mit Agent-Feed
      </div>
    );
  }

  const avatar = AGENT_AVATARS[ev.agent] ?? '🤖';

  return (
    <div className={`border-l-4 ${cardCls} rounded px-3 py-2 text-sm`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{avatar}</span>
        <span className="font-semibold text-gray-800">{ev.agent}</span>
        {ev.agentRole && (
          <span className="text-gray-400 text-xs">({ev.agentRole})</span>
        )}
        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-mono ${badgeCls}`}>
          {LABEL[ev.type]}
        </span>
      </div>
      {ev.featureName && (
        <div className="mt-0.5 text-xs text-gray-500 truncate">
          {ev.projectName && <span>{ev.projectName} › </span>}
          {ev.featureName}
        </div>
      )}
      <div className="mt-1 text-gray-700">{ev.message}</div>
      {ev.details && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-xs text-blue-500 hover:underline focus:outline-none"
        >
          {open ? '▲ Details ausblenden' : '▼ Details anzeigen'}
        </button>
      )}
      {open && ev.details && (
        <div className="mt-1 text-xs text-gray-500 break-words whitespace-pre-wrap bg-white/60 rounded p-1">
          {ev.details}
        </div>
      )}
      <div className="mt-1 text-xs text-gray-400 text-right">{fmt(ev.timestamp)}</div>
    </div>
  );
}

export default function AgentFeed() {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);
  const MAX_EVENTS = 50;

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        setEvents((prev) => {
          const next = [ev, ...prev];
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
        });
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
          Agent-Aktivität
        </h2>
        <span
          className={`ml-auto inline-block w-2 h-2 rounded-full ${
            connected ? 'bg-green-400' : 'bg-gray-300'
          }`}
          title={connected ? 'Verbunden' : 'Getrennt'}
        />
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          Noch keine Aktivität — starte ein Feature um Agents zu beobachten.
        </p>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
          {events.map((ev, i) => (
            <EventCard key={i} ev={ev} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
