'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  addEdge, useEdgesState, useNodesState, useReactFlow, MarkerType,
  type Connection, type Edge, type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Flag, GitBranch, HelpCircle,
  MessageSquare, Play, Settings2, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import {
  flowGraphSchema, validateGraph,
  type FlowGraph, type FlowNodeType, type GraphIssue,
} from '@/lib/whatsapp/flows/schema';
import type { WhatsappFlow } from '@/lib/whatsapp/types';
import { publishFlow, saveFlowDraft } from '@/app/(dashboard)/whatsapp/flows/actions';
import { AiModeContext, IssuesContext, NODE_TYPES } from './nodes';
import { NodePanel } from './NodePanel';
import { FlowSettingsPanel } from './FlowSettingsPanel';
import { SimulatorDrawer } from './SimulatorDrawer';

/**
 * The Intercom-style canvas. React Flow owns dragging and wiring; everything
 * domain-shaped — what a node holds, which exits it may have, when a graph is
 * publishable — comes from lib/whatsapp/flows/schema.ts, the same contract the
 * engine executes. Drafts autosave; publishing snapshots a version.
 */

type RFNode = Node<Record<string, unknown>>;

function toRF(graph: FlowGraph): { nodes: RFNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown>,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? undefined, target: e.target,
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  };
}

function toGraph(nodes: RFNode[], edges: Edge[]): FlowGraph | null {
  const candidate = {
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: { x: n.position.x, y: n.position.y }, data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id, source: e.source,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      target: e.target,
    })),
  };
  const parsed = flowGraphSchema.safeParse(candidate);
  return parsed.success ? (parsed.data as FlowGraph) : null;
}

const FRESH_DATA: Record<FlowNodeType, () => Record<string, unknown>> = {
  start: () => ({}),
  message: () => ({ body: '' }),
  question: () => ({
    slot: { key: `dato_${Date.now().toString(36).slice(-4)}`, label: '', type: 'text' },
    prompt: '',
  }),
  branch: () => ({ conditions: [] }),
  confirm: () => ({ body: '' }),
  action: () => ({ kind: 'handoff' }),
  end: () => ({ outcome: 'completed' }),
};

const PALETTE: { type: FlowNodeType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'message', icon: MessageSquare },
  { type: 'question', icon: HelpCircle },
  { type: 'branch', icon: GitBranch },
  { type: 'confirm', icon: CheckCircle2 },
  { type: 'action', icon: Zap },
  { type: 'end', icon: Flag },
];

export default function FlowCanvas({ flow }: { flow: WhatsappFlow }) {
  return (
    <ReactFlowProvider>
      <CanvasInner flow={flow} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ flow }: { flow: WhatsappFlow }) {
  const t = useTranslations('whatsapp.flows');
  const router = useRouter();
  const initial = useMemo(() => toRF(flow.draft_graph as unknown as FlowGraph), [flow.draft_graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'node' | 'settings' | 'test' | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const [publishing, startPublish] = useTransition();
  const [aiMode, setAiMode] = useState(flow.mode === 'ai');
  const { screenToFlowPosition } = useReactFlow();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ nodes: RFNode[]; edges: Edge[] }>({ nodes: initial.nodes, edges: initial.edges });
  useEffect(() => { latest.current = { nodes, edges }; }, [nodes, edges]);

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const issues = useMemo<GraphIssue[]>(() => (graph ? validateGraph(graph) : []), [graph]);
  const issuesByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      map.set(issue.nodeId, [...(map.get(issue.nodeId) ?? []), issue.code]);
    }
    return map;
  }, [issues]);

  /* -------------------------------------------------------------- autosave */

  const scheduleSave = useCallback(() => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const snapshot = toGraph(latest.current.nodes, latest.current.edges);
      if (!snapshot) return;
      setSaveState('saving');
      const res = await saveFlowDraft({ id: flow.id, graph: snapshot });
      setSaveState(res.ok ? 'saved' : 'dirty');
    }, 1500);
  }, [flow.id]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  /* --------------------------------------------------------------- editing */

  const onConnect = useCallback((conn: Connection) => {
    setEdges((eds) => addEdge(
      { ...conn, id: `e_${Date.now().toString(36)}`, markerEnd: { type: MarkerType.ArrowClosed } },
      // One edge per exit: wiring an exit again rewires it.
      eds.filter((e) => !(e.source === conn.source && (e.sourceHandle ?? null) === (conn.sourceHandle ?? null))),
    ));
    scheduleSave();
  }, [setEdges, scheduleSave]);

  const addNode = useCallback((type: FlowNodeType) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 80,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * 80,
    });
    const id = `n_${Date.now().toString(36)}`;
    setNodes((ns) => [...ns, { id, type, position, data: FRESH_DATA[type]() }]);
    setSelectedId(id);
    setPanel('node');
    scheduleSave();
  }, [screenToFlowPosition, setNodes, scheduleSave]);

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data } : n)));
    scheduleSave();
  }, [setNodes, scheduleSave]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  /* ------------------------------------------------------------ publishing */

  const publish = () => startPublish(async () => {
    const snapshot = toGraph(latest.current.nodes, latest.current.edges);
    if (!snapshot) return;
    const res = await publishFlow({ id: flow.id, graph: snapshot });
    if (res.ok) router.refresh();
  });

  return (
    <IssuesContext.Provider value={issuesByNode}>
      <AiModeContext.Provider value={aiMode}>
        <div className="flex h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white max-md:h-[calc(100dvh-4.5rem)]">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <Link href="/whatsapp/flows" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{flow.name}</span>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  flow.published_version > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500',
                )}>
                  {flow.published_version > 0 ? t('publishedV', { version: flow.published_version }) : t('draftOnly')}
                </span>
              </div>
              <div className="text-[11px] text-neutral-400">
                {saveState === 'saved' ? t('saved') : saveState === 'saving' ? t('saving') : t('unsaved')}
              </div>
            </div>
            <div className="flex-1" />
            {issues.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {t('issues', { count: issues.length })}
              </span>
            )}
            <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
              <Settings2 className="h-3.5 w-3.5" /> {t('settings')}
            </Button>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setPanel(panel === 'test' ? null : 'test')}>
              <Play className="h-3.5 w-3.5" /> {t('test')}
            </Button>
            <Button className="px-3 py-1.5 text-xs" onClick={publish} disabled={publishing || issues.length > 0 || !graph}>
              {t('publish')}
            </Button>
          </div>

          {/* Canvas + panels */}
          <div className="relative flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type !== 'select' && x.type !== 'dimensions')) scheduleSave(); }}
              onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === 'remove')) scheduleSave(); }}
              onConnect={onConnect}
              onNodeClick={(_, node) => { setSelectedId(node.id); setPanel('node'); }}
              onPaneClick={() => { setSelectedId(null); setPanel((p) => (p === 'node' ? null : p)); }}
              fitView
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Backspace', 'Delete']}
              className="bg-neutral-50"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#d4d4d4" />
              <Controls showInteractive={false} className="!rounded-xl !border !border-neutral-200 !shadow-sm" />
              <MiniMap pannable zoomable className="!hidden !rounded-xl !border !border-neutral-200 lg:!block" />
            </ReactFlow>

            {/* Palette */}
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm">
              {PALETTE.map(({ type, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  title={t(`node_${type}`)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t(`node_${type}`)}</span>
                </button>
              ))}
            </div>

            {panel === 'node' && selected && (
              <NodePanel
                key={selected.id}
                node={selected}
                graph={graph}
                onChange={(data) => updateNodeData(selected.id, data)}
                onClose={() => setPanel(null)}
                onDelete={selected.type !== 'start' ? () => {
                  setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                  setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
                  setPanel(null);
                  scheduleSave();
                } : undefined}
              />
            )}
            {panel === 'settings' && (
              <FlowSettingsPanel
                flow={flow}
                aiMode={aiMode}
                onModeChange={setAiMode}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'test' && graph && (
              <SimulatorDrawer graph={graph} onClose={() => setPanel(null)} />
            )}
          </div>
        </div>
      </AiModeContext.Provider>
    </IssuesContext.Provider>
  );
}
