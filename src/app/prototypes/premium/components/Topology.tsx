import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, ArrowRightLeft, ZoomIn, ZoomOut } from 'lucide-react';
import {
  mockUsers,
  mockCertifications,
  currentUser,
  getUserById,
  type Certification
} from '../data/mock-data';
import { BottomNav } from './BottomNav';
import { routes } from '../config';

interface Node {
  id: string;
  name: string;
  avatar: string;
  x: number;
  y: number;
}

interface Edge {
  source: string;
  target: string;
  isCrossDisagreement: boolean;
  cert: Certification;
}

// Canvas dimensions - calculate center dynamically
const CANVAS_WIDTH = 375;
const CANVAS_HEIGHT = 400;
const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;
const RADIUS = 120;

export function Topology() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // Memoize users array to prevent unnecessary recalculations
  const allUsers = useMemo(() => [currentUser, ...mockUsers], []);

  // Memoize nodes to prevent recreating on every render
  const nodes: Node[] = useMemo(() =>
    allUsers.map((user, index) => {
      const angle = (index / allUsers.length) * 2 * Math.PI;
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        x: CENTER_X + RADIUS * Math.cos(angle),
        y: CENTER_Y + RADIUS * Math.sin(angle),
      };
    }), [allUsers]);

  // Memoize edges from certifications
  const edges: Edge[] = useMemo(() =>
    mockCertifications.map(cert => ({
      source: cert.listenerId,
      target: cert.speakerId,
      isCrossDisagreement: cert.speakerPosition !== cert.listenerPosition,
      cert,
    })), []);

  // Memoize cross-disagreement stats
  const crossDisagreementCount = useMemo(() => edges.filter(e => e.isCrossDisagreement).length, [edges]);
  const totalVerifications = edges.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Apply zoom
      ctx.save();
      ctx.scale(zoom, zoom);

      // Draw edges
      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.strokeStyle = edge.isCrossDisagreement ? '#3B82F6' : '#E5E5EA';
        ctx.lineWidth = edge.isCrossDisagreement ? 3 : 2;
        ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(targetNode.y - sourceNode.y, targetNode.x - sourceNode.x);
        const arrowLength = 10;
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;

        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(
          midX - arrowLength * Math.cos(angle - Math.PI / 6),
          midY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(midX, midY);
        ctx.lineTo(
          midX - arrowLength * Math.cos(angle + Math.PI / 6),
          midY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.strokeStyle = edge.isCrossDisagreement ? '#007AFF' : '#8E8E93';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(node => {
        const isSelected = selectedNode === node.id;
        const isCurrentUser = node.id === currentUser.id;

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, isSelected ? 28 : 24, 0, 2 * Math.PI);
        ctx.fillStyle = isCurrentUser ? '#007AFF' : '#F2F2F7';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#007AFF' : '#E5E5EA';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Avatar emoji
        ctx.font = isSelected ? '20px sans-serif' : '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isCurrentUser ? '#FFFFFF' : '#000000';
        ctx.fillText(node.avatar, node.x, node.y);

        // Name label (below node)
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = '#8E8E93';
        ctx.fillText(node.name.split(' ')[0], node.x, node.y + 38);
      });

      ctx.restore();
    } catch (error) {
      // Canvas drawing failed - restore context and log error
      ctx.restore();
      console.error('Topology canvas rendering error:', error);
    }
  }, [nodes, edges, zoom, selectedNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    // Check if clicked on a node
    const clickedNode = nodes.find(node => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      return dist < 28;
    });

    if (clickedNode) {
      setSelectedNode(clickedNode.id === selectedNode ? null : clickedNode.id);
    } else {
      setSelectedNode(null);
    }
  };

  const selectedUser = selectedNode ? getUserById(selectedNode) : null;
  const selectedUserConnections = edges.filter(
    e => e.source === selectedNode || e.target === selectedNode
  );

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          <h1 className="text-[17px] font-semibold text-gray-900">Understanding Network</h1>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <Info size={20} className="text-gray-500" />
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 max-w-[500px] mx-auto">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-[20px] font-semibold text-gray-900 tabular-nums">{allUsers.length}</p>
            <p className="text-[11px] text-gray-400">People</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-center">
            <p className="text-[20px] font-semibold text-gray-900 tabular-nums">{totalVerifications}</p>
            <p className="text-[11px] text-gray-400">Verifications</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="text-center">
            <p className="text-[20px] font-semibold text-[#007AFF] tabular-nums">{crossDisagreementCount}</p>
            <p className="text-[11px] text-gray-400">Across Disagreement</p>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative max-w-[500px] mx-auto">
        <canvas
          ref={canvasRef}
          width={375}
          height={400}
          onClick={handleCanvasClick}
          className="w-full bg-white cursor-pointer"
          style={{ touchAction: 'none' }}
        />

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            onClick={() => setZoom(Math.min(zoom + 0.2, 2))}
            className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={() => setZoom(Math.max(zoom - 0.2, 0.6))}
            className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ZoomOut size={20} />
          </button>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="absolute top-4 left-4 bg-white rounded-xl p-4 shadow-lg">
            <p className="text-[13px] font-medium text-gray-900 mb-3">Legend</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-[#007AFF]" />
                <span className="text-[12px] text-gray-600">Across Disagreement</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-gray-300" />
                <span className="text-[12px] text-gray-600">Same Position</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#007AFF]" />
                <span className="text-[12px] text-gray-600">You</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Node Info */}
      {selectedUser && (
        <div className="px-4 pb-28 max-w-[500px] mx-auto">
          <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl">
                {selectedUser.avatar}
              </div>
              <div>
                <p className="text-[17px] font-semibold text-gray-900">{selectedUser.name}</p>
                <p className="text-[13px] text-gray-400">{selectedUser.bio}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 py-3 border-t border-gray-100">
              <div className="text-center flex-1">
                <p className="text-[20px] font-semibold text-gray-900 tabular-nums">
                  {selectedUser.verifiedListenerScore}
                </p>
                <p className="text-[11px] text-gray-400">Verified Score</p>
              </div>
              <div className="w-px h-8 bg-gray-100" />
              <div className="text-center flex-1">
                <p className="text-[20px] font-semibold text-gray-900 tabular-nums">
                  {selectedUserConnections.length}
                </p>
                <p className="text-[11px] text-gray-400">Connections</p>
              </div>
              <div className="w-px h-8 bg-gray-100" />
              <div className="text-center flex-1">
                <p className="text-[20px] font-semibold text-[#007AFF] tabular-nums">
                  {selectedUserConnections.filter(e => e.isCrossDisagreement).length}
                </p>
                <p className="text-[11px] text-gray-400">Cross</p>
              </div>
            </div>

            {selectedUserConnections.length > 0 && (
              <div className="pt-3 border-t border-gray-100 mt-3">
                <p className="text-[13px] font-medium text-gray-500 mb-2">Verifications</p>
                <div className="space-y-2">
                  {selectedUserConnections.slice(0, 3).map((edge, i) => {
                    const otherUser = getUserById(
                      edge.source === selectedNode ? edge.target : edge.source
                    );
                    const direction = edge.source === selectedNode ? 'Verified' : 'Verified by';

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 p-2 rounded-lg ${edge.isCrossDisagreement ? 'bg-blue-50' : 'bg-gray-50'}`}
                      >
                        {edge.isCrossDisagreement && <ArrowRightLeft size={12} className="text-[#007AFF]" />}
                        <span className="text-[13px] text-gray-700">
                          {direction} <span className="font-medium">{otherUser?.name}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => navigate(routes.profileById(selectedUser.id))}
              className="w-full mt-4 py-3 min-h-[44px] bg-gray-100 text-gray-900 rounded-xl font-medium text-[15px] transition-all hover:bg-gray-200 active:scale-[0.98]"
            >
              View Profile
            </button>
          </div>
        </div>
      )}

      {/* Empty State when no node selected */}
      {!selectedUser && (
        <div className="px-4 pb-28 max-w-[500px] mx-auto">
          <div className="bg-white rounded-[20px] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-center">
            <p className="text-[15px] text-gray-500">Tap a node to see their connections</p>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
