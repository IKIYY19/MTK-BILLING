import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Router, Monitor, Server, Network, Wifi, Globe, Shield,
  Plus, Trash2, Download, Code, Settings, X, ArrowRight,
  Save, FolderOpen, MousePointer2
} from 'lucide-react';
import { TopologyConfigGenerator } from '../utils/topologyGenerator';
import { useToast } from '../hooks/useToast';

// Node types available in the palette
const NODE_TYPES = [
  { id: 'router', label: 'Router', icon: Router, color: '#3b82f6', ports: 8 },
  { id: 'switch', label: 'Switch', icon: Network, color: '#8b5cf6', ports: 24 },
  { id: 'wan', label: 'WAN', icon: Globe, color: '#ef4444', ports: 1 },
  { id: 'vlan', label: 'VLAN', icon: Shield, color: '#f59e0b', ports: 0 },
  { id: 'wireless', label: 'Wireless AP', icon: Wifi, color: '#10b981', ports: 0 },
  { id: 'server', label: 'Server', icon: Server, color: '#6366f1', ports: 1 },
  { id: 'client', label: 'Client', icon: Monitor, color: '#64748b', ports: 1 },
  { id: 'firewall', label: 'Firewall', icon: Shield, color: '#dc2626', ports: 4 },
];

// Default properties per node type
const DEFAULT_PROPS = {
  router: { name: 'MainRouter', model: 'CCR2004', interfaces: [{ name: 'ether1', type: 'wan' }, { name: 'ether2', type: 'lan' }, { name: 'ether3', type: 'lan' }] },
  switch: { name: 'Switch1', model: 'CRS326', managed: true, ports: 24 },
  wan: { name: 'WAN1', type: 'dhcp', ip: '', gateway: '', dns: '8.8.8.8' },
  vlan: { name: 'VLAN10', vlanId: '10', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
  wireless: { name: 'WiFi-AP', ssid: 'MyNetwork', security: 'wpa2', password: '', channel: 36, band: '5ghz-a/n/ac' },
  server: { name: 'Server1', ip: '', role: 'dhcp' },
  client: { name: 'Client1', ip: '', type: 'dhcp' },
  firewall: { name: 'Firewall1', rules: [] },
};

export function TopologyBuilder() {
  const navigate = useNavigate();
  const { success, warning, info, error } = useToast();
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showProps, setShowProps] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [generatedScript, setGeneratedScript] = useState('');
  const [showScript, setShowScript] = useState(false);

  const svgRef = useRef(null);
  const canvasRef = useRef(null);

  // Add node to canvas
  const addNode = (type) => {
    const id = `${type}-${Date.now()}`;
    const typeLabel = NODE_TYPES.find((t) => t.id === type)?.label || type;
    const newNode = {
      id,
      type,
      x: 400 + Math.random() * 200 - pan.x,
      y: 300 + Math.random() * 200 - pan.y,
      props: { ...DEFAULT_PROPS[type] },
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(id);
    setShowProps(true);
    success('Node Added', `${typeLabel} node added to canvas.`);
  };

  // Remove node and its connections
  const removeNode = (id) => {
    const node = nodes.find((n) => n.id === id);
    const typeLabel = node ? NODE_TYPES.find((t) => t.id === node.type)?.label : 'Node';
    setNodes(nodes.filter(n => n.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    if (selectedNode === id) {
      setSelectedNode(null);
      setShowProps(false);
    }
    warning('Node Removed', `${typeLabel} (${node?.props?.name || id}) and its connections removed.`);
  };

  // Update node properties
  const updateNodeProps = (id, props) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, props } : n));
  };

  // Handle mouse down on node
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) {return;}

    // Check if connecting mode (shift+click)
    if (e.shiftKey) {
      setConnectingFrom(nodeId);
      return;
    }

    setSelectedNode(nodeId);
    setDraggingNode({
      id: nodeId,
      offsetX: e.clientX - node.x * zoom - pan.x,
      offsetY: e.clientY - node.y * zoom - pan.y,
    });
  };

  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (connectingFrom) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom,
        });
      }
    }

    if (draggingNode) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const newX = (e.clientX - rect.left - draggingNode.offsetX - pan.x) / zoom;
        const newY = (e.clientY - rect.top - draggingNode.offsetY - pan.y) / zoom;
        setNodes(nodes.map(n => 
          n.id === draggingNode.id ? { ...n, x: Math.max(0, newX), y: Math.max(0, newY) } : n
        ));
      }
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [draggingNode, connectingFrom, isPanning, panStart, pan, zoom, nodes]);

  // Handle mouse up
  const handleMouseUp = useCallback((e) => {
    if (connectingFrom) {
      // Check if dropped on a node
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const nodeId = target?.closest('[data-node-id]')?.dataset.nodeId;
      if (nodeId && nodeId !== connectingFrom) {
        const exists = connections.find(c => 
          (c.from === connectingFrom && c.to === nodeId) || 
          (c.from === nodeId && c.to === connectingFrom)
        );
        if (!exists) {
          setConnections([...connections, { from: connectingFrom, to: nodeId, fromPort: 0, toPort: 0 }]);
        }
      }
      setConnectingFrom(null);
    }
    setDraggingNode(null);
    setIsPanning(false);
  }, [connectingFrom, connections]);

  // Canvas pan
  const handleCanvasMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(Math.max(0.3, Math.min(2, zoom + delta)));
  };

  // Generate config from topology
  const generateConfig = () => {
    const generator = new TopologyConfigGenerator(nodes, connections);
    const script = generator.generate();
    setGeneratedScript(script);
    setShowScript(true);
    const lineCount = script.split('\n').length;
    success('Script Generated', `Generated ${lineCount} lines from topology.`);
  };

  // Clear canvas
  const clearCanvas = () => {
    if (window.confirm('Clear all nodes and connections?')) {
      const nodeCount = nodes.length;
      setNodes([]);
      setConnections([]);
      setSelectedNode(null);
      setShowProps(false);
      if (nodeCount > 0) {
        warning('Canvas Cleared', `Removed ${nodeCount} node(s) and all connections.`);
      }
    }
  };

  // Save topology
  const saveTopology = () => {
    const data = JSON.stringify({ nodes, connections }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load topology
  const loadTopology = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            setNodes(data.nodes || []);
            setConnections(data.connections || []);
            const nodeCount = (data.nodes || []).length;
            success('Topology Loaded', `Loaded ${nodeCount} node(s) from file.`);
          } catch (err) {
            error('Invalid File', 'The selected file is not a valid topology JSON.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedNode) {
        removeNode(selectedNode);
      }
      if (e.key === 'Escape') {
        setConnectingFrom(null);
        setShowProps(false);
        setShowScript(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode]);

  // Get connection point for a node
  const getConnectionPoint = (node, side = 'auto') => {
    const width = 140;
    const height = 80;
    
    // Default: find best connection side
    if (side === 'auto') {
      const nodeConns = connections.filter(c => c.from === node.id || c.to === node.id);
      if (nodeConns.length > 0) {
        const otherId = nodeConns[0].from === node.id ? nodeConns[0].to : nodeConns[0].from;
        const other = nodes.find(n => n.id === otherId);
        if (other) {
          return other.x > node.x ? 'right' : other.x < node.x ? 'left' : other.y > node.y ? 'bottom' : 'top';
        }
      }
    }
    
    switch (side) {
      case 'left': return { x: node.x, y: node.y + height / 2 };
      case 'right': return { x: node.x + width, y: node.y + height / 2 };
      case 'top': return { x: node.x + width / 2, y: node.y };
      case 'bottom': return { x: node.x + width / 2, y: node.y + height };
      default: return { x: node.x + width / 2, y: node.y + height / 2 };
    }
  };

  // Draw connection path
  const getConnectionPath = (conn) => {
    const fromNode = nodes.find(n => n.id === conn.from);
    const toNode = nodes.find(n => n.id === conn.to);
    if (!fromNode || !toNode) {return '';}

    const fromSide = toNode.x > fromNode.x ? 'right' : toNode.x < fromNode.x ? 'left' : toNode.y > fromNode.y ? 'bottom' : 'top';
    const toSide = fromNode.x > toNode.x ? 'right' : fromNode.x < toNode.x ? 'left' : fromNode.y > toNode.y ? 'bottom' : 'top';

    const start = getConnectionPoint(fromNode, fromSide);
    const end = getConnectionPoint(toNode, toSide);

    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const curvature = Math.min(dx, dy) * 0.4;

    let cp1, cp2;
    switch (fromSide) {
      case 'right': cp1 = { x: start.x + curvature, y: start.y }; break;
      case 'left': cp1 = { x: start.x - curvature, y: start.y }; break;
      case 'bottom': cp1 = { x: start.x, y: start.y + curvature }; break;
      default: cp1 = { x: start.x, y: start.y - curvature };
    }
    switch (toSide) {
      case 'right': cp2 = { x: end.x + curvature, y: end.y }; break;
      case 'left': cp2 = { x: end.x - curvature, y: end.y }; break;
      case 'bottom': cp2 = { x: end.x, y: end.y + curvature }; break;
      default: cp2 = { x: end.x, y: end.y - curvature };
    }

    return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
  };

  const selectedNodeData = nodes.find(n => n.id === selectedNode);
  const nodeTypeData = selectedNodeData ? NODE_TYPES.find(t => t.id === selectedNodeData.type) : null;

  return (
    <div className="flex h-full">
      {/* Node Palette */}
      <div className="w-56 bg-slate-800 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-white font-semibold">Network Nodes</h3>
          <p className="text-xs text-slate-400 mt-1">Drag or click to add</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {NODE_TYPES.map((type) => (
            <div
              key={type.id}
              onClick={() => addNode(type.id)}
              className="flex items-center gap-3 p-3 mb-2 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-500"
            >
              <type.icon className="w-5 h-5" style={{ color: type.color }} />
              <div>
                <div className="text-white text-sm">{type.label}</div>
                {type.ports > 0 && <div className="text-xs text-slate-400">{type.ports} ports</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
          <p className="mb-1"><MousePointer2 className="w-3 h-3 inline mr-1" />Click to add</p>
          <p className="mb-1"><ArrowRight className="w-3 h-3 inline mr-1" />Shift+Click node to connect</p>
          <p className="mb-1"><Trash2 className="w-3 h-3 inline mr-1" />Delete to remove</p>
          <p><MousePointer2 className="w-3 h-3 inline mr-1" />Drag to move</p>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="bg-slate-800 border-b border-slate-700 p-3 flex items-center gap-2">
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white px-2">
            <FolderOpen className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-slate-700" />
          <button onClick={loadTopology} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1">
            <Plus className="w-4 h-4" /> Load
          </button>
          <button onClick={saveTopology} className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1">
            <Save className="w-4 h-4" /> Save
          </button>
          <button onClick={clearCanvas} className="bg-slate-700 hover:bg-red-600 text-white px-3 py-1.5 rounded text-sm flex items-center gap-1">
            <Trash2 className="w-4 h-4" /> Clear
          </button>
          <div className="w-px h-6 bg-slate-700" />
          <span className="text-slate-400 text-sm">{nodes.length} nodes, {connections.length} connections</span>
          <div className="flex-1" />
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded text-sm">-</button>
          <span className="text-slate-300 text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 rounded text-sm">+</button>
          <div className="w-px h-6 bg-slate-700" />
          <button 
            onClick={generateConfig}
            disabled={nodes.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Code className="w-4 h-4" /> Generate Script
          </button>
        </div>

        {/* SVG Canvas */}
        <div 
          className="flex-1 bg-slate-900 overflow-hidden relative"
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
        >
          {/* Grid pattern */}
          <div 
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${pan.x}px ${pan.y}px`,
            }}
          />

          <svg 
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {/* Connections */}
            {connections.map((conn, idx) => (
              <g key={idx}>
                <path
                  d={getConnectionPath(conn)}
                  fill="none"
                  stroke={connectingFrom === conn.from ? '#60a5fa' : '#475569'}
                  strokeWidth={connectingFrom === conn.from ? 3 : 2}
                  strokeDasharray={connectingFrom === conn.from ? '8,4' : 'none'}
                />
                {/* Connection point indicators */}
                {(() => {
                  const fromNode = nodes.find(n => n.id === conn.from);
                  const toNode = nodes.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) {return null;}
                  const midX = (fromNode.x + toNode.x + 140) / 2;
                  const midY = (fromNode.y + toNode.y + 80) / 2;
                  return (
                    <circle
                      cx={midX}
                      cy={midY}
                      r="12"
                      fill="#1e293b"
                      stroke="#475569"
                      strokeWidth="1"
                      onClick={() => {
                        setConnections(connections.filter((_, i) => i !== idx));
                      }}
                      className="cursor-pointer hover:stroke-red-500"
                    />
                  );
                })()}
              </g>
            ))}

            {/* Temp connection line while connecting */}
            {connectingFrom && (() => {
              const fromNode = nodes.find(n => n.id === connectingFrom);
              if (!fromNode) {return null;}
              return (
                <line
                  x1={fromNode.x + 70}
                  y1={fromNode.y + 40}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeDasharray="6,3"
                />
              );
            })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const typeData = NODE_TYPES.find(t => t.id === node.type);
              if (!typeData) {return null;}
              const isSelected = selectedNode === node.id;
              const isConnecting = connectingFrom === node.id;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectingFrom && connectingFrom !== node.id) {
                      const exists = connections.find(c => 
                        (c.from === connectingFrom && c.to === node.id) || 
                        (c.from === node.id && c.to === connectingFrom)
                      );
                      if (!exists) {
                        setConnections([...connections, { from: connectingFrom, to: node.id }]);
                      }
                      setConnectingFrom(null);
                    } else {
                      setSelectedNode(node.id);
                      setShowProps(true);
                    }
                  }}
                  className="cursor-move"
                >
                  {/* Node background */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width="140"
                    height="80"
                    rx="8"
                    fill={isSelected ? '#1e3a5f' : '#1e293b'}
                    stroke={isConnecting ? '#60a5fa' : isSelected ? '#3b82f6' : typeData.color}
                    strokeWidth={isSelected || isConnecting ? 2 : 1}
                    className="transition-colors"
                  />
                  
                  {/* Node icon */}
                  <foreignObject x={node.x + 10} y={node.y + 15} width="24" height="24">
                    <typeData.icon className="w-6 h-6" style={{ color: typeData.color }} />
                  </foreignObject>

                  {/* Node label */}
                  <text
                    x={node.x + 40}
                    y={node.y + 28}
                    fill="white"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {node.props.name || typeData.label}
                  </text>

                  {/* Node subtitle */}
                  <text
                    x={node.x + 10}
                    y={node.y + 55}
                    fill="#94a3b8"
                    fontSize="10"
                  >
                    {node.type === 'vlan' ? `ID: ${node.props.vlanId || '-'}` : 
                     node.type === 'wireless' ? `SSID: ${node.props.ssid || '-'}` :
                     node.type === 'wan' ? (node.props.type || 'dhcp') :
                     node.type === 'client' ? (node.props.ip || 'DHCP') :
                     node.props.model || node.props.ip || typeData.label}
                  </text>

                  {/* Connection dots */}
                  <circle cx={node.x} cy={node.y + 40} r="4" fill="#475569" />
                  <circle cx={node.x + 140} cy={node.y + 40} r="4" fill="#475569" />
                </g>
              );
            })}
          </svg>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Network className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">Click a node type on the left to start building</p>
                <p className="text-slate-600 text-sm mt-2">Drag to move • Shift+Click to connect • Delete to remove</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Properties Panel */}
      {showProps && selectedNodeData && (
        <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              {nodeTypeData && <nodeTypeData.icon className="w-5 h-5" style={{ color: nodeTypeData.color }} />}
              Properties
            </h3>
            <button onClick={() => setShowProps(false)} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Common */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={selectedNodeData.props.name || ''}
                onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
              />
            </div>

            {/* Router specific */}
            {selectedNodeData.type === 'router' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Model</label>
                  <select
                    value={selectedNodeData.props.model || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="CCR2004">CCR2004</option>
                    <option value="CCR2116">CCR2116</option>
                    <option value="RB5009">RB5009</option>
                    <option value="RB4011">RB4011</option>
                    <option value="hEX">hEX (RB750Gr3)</option>
                    <option value="hAP">hAP ax²</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Identity</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.identity || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, identity: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="Router Identity"
                  />
                </div>
              </>
            )}

            {/* WAN specific */}
            {selectedNodeData.type === 'wan' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Connection Type</label>
                  <select
                    value={selectedNodeData.props.type || 'dhcp'}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="dhcp">DHCP Client</option>
                    <option value="static">Static IP</option>
                    <option value="pppoe">PPPoE</option>
                  </select>
                </div>
                {(selectedNodeData.props.type === 'static' || selectedNodeData.props.type === 'pppoe') && (
                  <>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">IP Address</label>
                      <input
                        type="text"
                        value={selectedNodeData.props.ip || ''}
                        onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, ip: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                        placeholder="192.168.1.100/24"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Gateway</label>
                      <input
                        type="text"
                        value={selectedNodeData.props.gateway || ''}
                        onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, gateway: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                        placeholder="192.168.1.1"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm text-slate-400 mb-1">DNS Server</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.dns || '8.8.8.8'}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, dns: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
              </>
            )}

            {/* VLAN specific */}
            {selectedNodeData.type === 'vlan' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">VLAN ID</label>
                    <input
                      type="number"
                      value={selectedNodeData.props.vlanId || ''}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, vlanId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Subnet</label>
                    <input
                      type="text"
                      value={selectedNodeData.props.subnet || ''}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, subnet: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                      placeholder="192.168.10.0/24"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Gateway IP</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.gateway || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, gateway: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="192.168.10.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">DHCP Range</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.dhcpRange || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, dhcpRange: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="192.168.10.100-192.168.10.200"
                  />
                </div>
              </>
            )}

            {/* Wireless specific */}
            {selectedNodeData.type === 'wireless' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">SSID</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.ssid || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, ssid: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Security</label>
                  <select
                    value={selectedNodeData.props.security || 'wpa2'}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, security: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="none">Open</option>
                    <option value="wpa2">WPA2-PSK</option>
                    <option value="wpa3">WPA3-PSK</option>
                  </select>
                </div>
                {selectedNodeData.props.security !== 'none' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={selectedNodeData.props.password || ''}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, password: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Channel</label>
                    <input
                      type="number"
                      value={selectedNodeData.props.channel || 36}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, channel: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Band</label>
                    <select
                      value={selectedNodeData.props.band || '5ghz-a/n/ac'}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, band: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    >
                      <option value="2ghz-b/g/n">2.4 GHz</option>
                      <option value="5ghz-a/n/ac">5 GHz</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Server specific */}
            {selectedNodeData.type === 'server' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">IP Address</label>
                  <input
                    type="text"
                    value={selectedNodeData.props.ip || ''}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, ip: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    placeholder="192.168.1.10"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Role</label>
                  <select
                    value={selectedNodeData.props.role || 'dhcp'}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, role: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="dhcp">DHCP Server</option>
                    <option value="dns">DNS Server</option>
                    <option value="radius">RADIUS Server</option>
                    <option value="hotspot">Hotspot Server</option>
                    <option value="web">Web Server</option>
                  </select>
                </div>
              </>
            )}

            {/* Client specific */}
            {selectedNodeData.type === 'client' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">IP Assignment</label>
                  <select
                    value={selectedNodeData.props.type || 'dhcp'}
                    onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                  >
                    <option value="dhcp">DHCP</option>
                    <option value="static">Static</option>
                  </select>
                </div>
                {selectedNodeData.props.type === 'static' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">IP Address</label>
                    <input
                      type="text"
                      value={selectedNodeData.props.ip || ''}
                      onChange={(e) => updateNodeProps(selectedNode, { ...selectedNodeData.props, ip: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                    />
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => removeNode(selectedNode)}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete Node
            </button>
          </div>
        </div>
      )}

      {/* Script Output Modal */}
      {showScript && generatedScript && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg w-3/4 max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Code className="w-5 h-5 text-green-500" />
                Generated MikroTik Script
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript);
                  }}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-sm"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([generatedScript], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `topology-config-${Date.now()}.rsc`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button onClick={() => setShowScript(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <pre className="flex-1 p-6 text-sm text-green-400 font-mono overflow-auto">
              {generatedScript}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
