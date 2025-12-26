"use client";
import React, { useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  NodeProps,
  ProOptions,
  MarkerType,
  Node,
  Edge,
  BaseEdge,
  getBezierPath,
  EdgeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  FileCode,
  Braces,
  ArrowRightFromLine,
  ArrowRightToLine,
} from "lucide-react";
import dagre from "dagre";

// --- SETTINGS ---
const FUNC_WIDTH = 280;
const FUNC_HEIGHT = 90; // Increased slightly to comfortably fit labels
const FILE_PADDING_X = 24;
const FILE_PADDING_TOP = 50;
const FILE_PADDING_BOTTOM = 24;
const GAP = 25; // Increased gap between functions

// --- 1. FILE NODE (CONTAINER) ---
const FileNode = ({ data, style }: NodeProps) => {
  const label = data.label || "File";

  return (
    <div
      className="relative h-full w-full bg-[#09090b] border-[1.5px] border-zinc-800/80 rounded-2xl transition-all group hover:border-amber-600/40 hover:shadow-2xl z-0"
      style={{
        minWidth: style?.width,
        minHeight: style?.height,
      }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 w-full h-10 border-b border-zinc-800/80 bg-zinc-900/40 rounded-t-2xl flex items-center px-4 gap-3">
        <div className="p-1 bg-zinc-800 rounded text-amber-600 border border-zinc-700/30">
          <FileCode size={14} />
        </div>
        <span className="text-xs font-bold text-zinc-300 font-mono tracking-wide opacity-90">
          {label}
        </span>
      </div>
    </div>
  );
};

// --- 2. FUNCTION NODE (DETAILED CARD) ---
const FunctionNode = ({ data }: NodeProps) => {
  // Ensure we always have a string to display, handling empty lists or nulls
  const argsDisplay =
    data.args && data.args.length > 0 ? data.args.join(", ") : "void";

  // Check for 'None' string specifically or null/undefined
  const returnDisplay =
    data.returns && data.returns !== "None" && data.returns !== ""
      ? data.returns
      : "void";

  return (
    <div className="flex flex-col w-full h-full bg-[#131315] border border-zinc-800 rounded-lg overflow-hidden shadow-sm hover:border-amber-500/60 hover:shadow-md transition-all duration-200 group relative z-10">
      {/* Left Handle (Input) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-4 !rounded-sm !bg-zinc-700 group-hover:!bg-amber-500 transition-colors -ml-[5px]"
      />

      <div className="flex-1 flex flex-col justify-center px-4 py-2">
        {/* Title */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-zinc-200 font-mono truncate group-hover:text-white">
            {data.label}
          </span>
          <Braces
            size={12}
            className="text-zinc-600 group-hover:text-amber-500 transition-colors"
          />
        </div>

        {/* Inputs */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 border-t border-zinc-800/50 pt-1.5">
          <ArrowRightToLine size={10} className="text-blue-500/70 shrink-0" />
          <span
            className="truncate opacity-70 font-mono text-zinc-400"
            title={argsDisplay}
          >
            in: <span className="text-blue-400/80">{argsDisplay}</span>
          </span>
        </div>

        {/* Outputs */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 pt-0.5">
          <ArrowRightFromLine
            size={10}
            className="text-emerald-500/70 shrink-0"
          />
          <span
            className="truncate opacity-70 font-mono text-zinc-400"
            title={returnDisplay}
          >
            out: <span className="text-emerald-400/80">{returnDisplay}</span>
          </span>
        </div>
      </div>

      {/* Right Handle (Output) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-4 !rounded-sm !bg-zinc-700 group-hover:!bg-amber-500 transition-colors -mr-[5px]"
      />
    </div>
  );
};

// --- 3. SMART EDGE (CLEANER ROUTING) ---
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) => {
  // Use Bezier for smoother, less "robotic" lines that are easier to track visually
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

const proOptions: ProOptions = { hideAttribution: true };

// --- LAYOUT CALCULATION ---
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Significantly increased separation to reduce overlapping lines
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: 100, // Vertical space between nodes in the same rank
    ranksep: 250, // Horizontal space between ranks (files)
  });

  // 1. Calculate File (Container) Sizes
  const fileNodes = nodes.filter((n) => !n.parentNode);

  fileNodes.forEach((fileNode) => {
    const children = nodes.filter((n) => n.parentNode === fileNode.id);

    const calculatedHeight =
      FILE_PADDING_TOP +
      children.length * (FUNC_HEIGHT + GAP) +
      FILE_PADDING_BOTTOM;
    const finalHeight = Math.max(calculatedHeight, 140); // Minimum height
    const calculatedWidth = FUNC_WIDTH + FILE_PADDING_X * 2;

    dagreGraph.setNode(fileNode.id, {
      width: calculatedWidth,
      height: finalHeight,
    });
    fileNode.style = { width: calculatedWidth, height: finalHeight };
  });

  // 2. Define Relationships (File to File)
  edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    // Only route through dagre if nodes are in different files
    if (
      sourceNode?.parentNode &&
      targetNode?.parentNode &&
      sourceNode.parentNode !== targetNode.parentNode
    ) {
      dagreGraph.setEdge(sourceNode.parentNode, targetNode.parentNode);
    }
  });

  dagre.layout(dagreGraph);

  // 3. Apply Positions
  const layoutedNodes = nodes.map((node) => {
    // Parent File Node
    if (!node.parentNode) {
      const nodePos = dagreGraph.node(node.id);
      if (nodePos) {
        return {
          ...node,
          position: {
            x: nodePos.x - (node.style!.width as number) / 2,
            y: nodePos.y - (node.style!.height as number) / 2,
          },
          zIndex: 0,
        };
      }
      return node;
    }

    // Child Function Node (Manual Vertical Stack)
    const siblings = nodes.filter((n) => n.parentNode === node.parentNode);
    const index = siblings.findIndex((n) => n.id === node.id);

    return {
      ...node,
      position: {
        x: FILE_PADDING_X,
        y: FILE_PADDING_TOP + index * (FUNC_HEIGHT + GAP),
      },
      style: { width: FUNC_WIDTH, height: FUNC_HEIGHT },
      zIndex: 10,
      extent: "parent",
    };
  });

  return { nodes: layoutedNodes, edges };
};

export default function GraphView({
  initialNodes,
  initialEdges,
  onNodeClick,
}: any) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(
    () => ({
      file: FileNode,
      function: FunctionNode,
      class: FunctionNode, // Treat classes visually same as functions for now
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      default: CustomEdge,
    }),
    [],
  );

  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      const rawNodes = initialNodes.map((n: any) => ({
        ...n,
        type: n.parentNode
          ? n.id.includes("::class")
            ? "class"
            : "function"
          : "file",
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(rawNodes, initialEdges);
      setNodes(layoutedNodes);

      // Edge Styles: Thinner, transparent by default to reduce clutter
      const styledEdges = layoutedEdges.map((edge: any) => ({
        ...edge,
        type: "default",
        animated: true,
        style: {
          stroke: "#71717a", // Zinc-500
          strokeWidth: 1,
          opacity: 0.15, // Very subtle by default
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#71717a",
        },
      }));

      setEdges(styledEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Interactive Highlighting
  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setEdges((eds) =>
        eds.map((edge) => {
          // Highlight connected edges
          if (edge.source === node.id || edge.target === node.id) {
            return {
              ...edge,
              style: {
                ...edge.style,
                stroke: "#f59e0b", // Amber highlight
                strokeWidth: 2,
                opacity: 1,
              },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
              zIndex: 999, // Bring to front
            };
          }
          return edge;
        }),
      );
    },
    [setEdges],
  );

  const onNodeMouseLeave = useCallback(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        style: { stroke: "#71717a", strokeWidth: 1, opacity: 0.15 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a" },
        zIndex: 0,
      })),
    );
  }, [setEdges]);

  return (
    <div className="h-full w-full bg-[#050505]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={proOptions}
        fitView
        minZoom={0.1}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onNodeClick={(_, node) => {
          if (onNodeClick) onNodeClick(node.id);
        }}
      >
        <Background color="#18181b" gap={40} size={1} />

        <Controls
          className="
                !bg-zinc-950/80
                !border-zinc-800
                backdrop-blur-md
                !shadow-xl
                !rounded-xl
                overflow-hidden
                !m-8
                [&>button]:!border-b
                [&>button]:!border-zinc-800
                [&>button:last-child]:!border-none
                [&>button]:!bg-transparent
                [&>button]:!fill-zinc-500
                [&>button]:!p-2.5
                [&>button:hover]:!bg-zinc-900
                [&>button:hover]:!fill-amber-500
                [&>button:hover]:!transition-colors
            "
        />
      </ReactFlow>
    </div>
  );
}
