import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, Info, ChevronDown } from 'lucide-react';
import { BottomNav } from './BottomNav';
import {
  mockUsers,
  mockIdeas,
  mockCertifications,
  currentUser,
  getUserById,
  getIdeaById,
} from '../data/mock-data';

interface Node {
  id: string;
  x: number;
  y: number;
  size: number;
  user: ReturnType<typeof getUserById>;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  ideaId: string;
  isCrossDisagreement: boolean;
}

export function Topology() {
  const navigate = useNavigate();
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // Calculate node positions (simple circular layout)
  const allUsers = [currentUser, ...mockUsers];

  const nodes: Node[] = useMemo(() => {
    const centerX = 175;
    const centerY = 200;
    const radius = 120;

    return allUsers.map((user, index) => {
      const angle = (index / allUsers.length) * 2 * Math.PI - Math.PI / 2;
      return {
        id: user.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        size: 24 + user.verifiedListenerScore * 2,
        user,
      };
    });
  }, []);

  // Calculate edges from certifications
  const edges: Edge[] = useMemo(() => {
    const filteredCerts = selectedIdea
      ? mockCertifications.filter(c => c.ideaId === selectedIdea)
      : mockCertifications;

    return filteredCerts.map(cert => ({
      id: cert.id,
      source: cert.speakerId,
      target: cert.listenerId,
      ideaId: cert.ideaId,
      isCrossDisagreement: cert.speakerPosition !== cert.listenerPosition,
    }));
  }, [selectedIdea]);

  const getNodeById = (id: string) => nodes.find(n => n.id === id);

  const selectedNodeData = selectedNode ? getNodeById(selectedNode) : null;
  const selectedNodeEdges = selectedNode
    ? edges.filter(e => e.source === selectedNode || e.target === selectedNode)
    : [];

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 z-40">
        <div className="flex items-center gap-3 px-4 py-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-1 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="font-semibold text-gray-900 flex-1">Understanding Network</h1>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="p-2 text-gray-600 hover:text-blue-600"
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      {/* Legend */}
      {showLegend && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 max-w-lg mx-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Legend</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500" />
              <span className="text-gray-600">Person (larger = higher listener score)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-gray-400" />
              <span className="text-gray-600">Verification (same position)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-blue-500" />
              <span className="text-gray-600">Cross-disagreement verification</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter by idea */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 max-w-lg mx-auto">
        <div className="relative">
          <select
            value={selectedIdea || ''}
            onChange={(e) => setSelectedIdea(e.target.value || null)}
            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All ideas</option>
            {mockIdeas.map(idea => (
              <option key={idea.id} value={idea.id}>
                {idea.text.slice(0, 50)}...
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
        </div>
      </div>

      {/* Network visualization */}
      <div className="max-w-lg mx-auto p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <svg
            viewBox="0 0 350 400"
            className="w-full h-auto"
          >
            {/* Edges */}
            <g>
              {edges.map(edge => {
                const source = getNodeById(edge.source);
                const target = getNodeById(edge.target);
                if (!source || !target) return null;

                const isHighlighted = selectedNode && (edge.source === selectedNode || edge.target === selectedNode);

                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={edge.isCrossDisagreement ? '#3B82F6' : '#9CA3AF'}
                    strokeWidth={isHighlighted ? 3 : 1.5}
                    strokeOpacity={selectedNode ? (isHighlighted ? 1 : 0.2) : 0.6}
                    className="transition-all"
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {nodes.map(node => {
                const isSelected = node.id === selectedNode;
                const isConnected = selectedNode
                  ? edges.some(e =>
                      (e.source === selectedNode && e.target === node.id) ||
                      (e.target === selectedNode && e.source === node.id)
                    )
                  : true;

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedNode(isSelected ? null : node.id)}
                    opacity={selectedNode && !isConnected && !isSelected ? 0.3 : 1}
                  >
                    {/* Highlight ring */}
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={node.size / 2 + 6}
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth={3}
                        className="animate-pulse"
                      />
                    )}
                    {/* Node circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.size / 2}
                      fill={node.id === 'current' ? '#3B82F6' : '#1F2937'}
                      className="transition-all hover:scale-110"
                      style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                    />
                    {/* Avatar */}
                    <text
                      x={node.x}
                      y={node.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={node.size * 0.5}
                      className="pointer-events-none select-none"
                    >
                      {node.user?.avatar}
                    </text>
                    {/* Name label */}
                    <text
                      x={node.x}
                      y={node.y + node.size / 2 + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#374151"
                      className="pointer-events-none select-none"
                    >
                      {node.id === 'current' ? 'You' : node.user?.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <StatCard
            value={nodes.length}
            label="People"
          />
          <StatCard
            value={edges.length}
            label="Verifications"
          />
          <StatCard
            value={edges.filter(e => e.isCrossDisagreement).length}
            label="Cross-Disagreement"
            highlight
          />
        </div>

        {/* Selected node details */}
        {selectedNodeData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-4 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">
                {selectedNodeData.user?.avatar}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">
                  {selectedNodeData.id === 'current' ? 'You' : selectedNodeData.user?.name}
                </p>
                <p className="text-sm text-gray-500">{selectedNodeData.user?.role}</p>
              </div>
              <button
                onClick={() => navigate(`/prototype/linkedin-like/profile/${selectedNodeData.id}`)}
                className="text-sm text-blue-600 font-medium hover:text-blue-700"
              >
                View Profile
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xl font-bold text-gray-900">
                  {selectedNodeData.user?.verifiedListenerScore}
                </p>
                <p className="text-xs text-gray-500">Listener Score</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xl font-bold text-gray-900">
                  {selectedNodeEdges.length}
                </p>
                <p className="text-xs text-gray-500">Verifications</p>
              </div>
            </div>

            {/* Connected verifications */}
            {selectedNodeEdges.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Verifications</p>
                <div className="space-y-2">
                  {selectedNodeEdges.slice(0, 3).map(edge => {
                    const other = edge.source === selectedNode ? edge.target : edge.source;
                    const otherUser = getUserById(other);
                    const idea = getIdeaById(edge.ideaId);
                    const direction = edge.source === selectedNode ? 'certified' : 'was certified by';

                    return (
                      <button
                        key={edge.id}
                        onClick={() => navigate(`/prototype/linkedin-like/idea/${edge.ideaId}`)}
                        className={`w-full text-left p-2 rounded-lg ${
                          edge.isCrossDisagreement ? 'bg-blue-50' : 'bg-gray-50'
                        } hover:bg-gray-100`}
                      >
                        <p className="text-sm">
                          <span className="font-medium">{otherUser?.name}</span>
                          <span className="text-gray-500"> {direction}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {idea?.text}
                        </p>
                        {edge.isCrossDisagreement && (
                          <span className="inline-block text-xs text-blue-600 font-medium mt-1">
                            Cross-disagreement
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function StatCard({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-blue-50' : 'bg-white'} border border-gray-200`}>
      <p className={`text-xl font-bold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
