"use client";

import { useEffect, useMemo } from "react";
import dagre from "@dagrejs/dagre";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow";
import { KeyRound, Table2 } from "lucide-react";
import type { SchemaTable } from "@synehq-oos/explorer-contracts";
import { schemaTableId } from "./schema-tree";

type TableNodeData = { table: SchemaTable; external?: boolean };
const WIDTH = 280;
const rowHeight = 30;
function DiagramTable({ data }: NodeProps<TableNodeData>) {
  return (
    <div className={`erd-table ${data.external ? "erd-external" : ""}`}>
      <div className="erd-table-title">
        <Table2 size={14} />
        <div>
          <strong>{data.table.name}</strong>
          <span>{[data.table.database, data.table.schema].filter(Boolean).join(" / ")}</span>
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="table" />
      <Handle type="source" position={Position.Right} id="table" />
      {data.external ? (
        <p className="erd-external-label">Outside this diagram</p>
      ) : (
        data.table.columns.map((column) => (
          <div key={column.name} className="erd-column">
            {column.primaryKey ? (
              <KeyRound size={12} aria-label="Primary key" />
            ) : (
              <span className="erd-key-space" />
            )}
            <span title={column.name}>{column.name}</span>
            <small title={column.dataType}>{column.dataType}</small>
          </div>
        ))
      )}
    </div>
  );
}
const nodeTypes = { table: DiagramTable };

/** Adapted from SyneHQ's Dagre layout, with complete namespace identities. */
export function createSchemaGraph(tables: SchemaTable[]): {
  nodes: Node<TableNodeData>[];
  edges: Edge[];
  omitted: number;
} {
  const visible = tables.slice(0, 200);
  const byId = new Map(visible.map((table) => [schemaTableId(table), table]));
  const nodes: Node<TableNodeData>[] = visible.map((table) => ({
    id: schemaTableId(table),
    type: "table",
    position: { x: 0, y: 0 },
    data: { table },
  }));
  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  for (const table of visible) {
    for (const relationship of table.relationships) {
      const source = schemaTableId({
        database: relationship.source.database,
        schema: relationship.source.schema,
        name: relationship.source.table,
      });
      const target = schemaTableId({
        database: relationship.target.database,
        schema: relationship.target.schema,
        name: relationship.target.table,
      });
      if (!byId.has(source)) continue;
      if (!byId.has(target)) {
        const foreign: SchemaTable = {
          database: relationship.target.database,
          schema: relationship.target.schema,
          name: relationship.target.table,
          type: "external",
          columns: [],
          relationships: [],
        };
        byId.set(target, foreign);
        nodes.push({
          id: target,
          type: "table",
          position: { x: 0, y: 0 },
          data: { table: foreign, external: true },
        });
      }
      const id = JSON.stringify([
        source,
        target,
        relationship.name,
        relationship.source.columns,
        relationship.target.columns,
      ]);
      if (edgeIds.has(id)) continue;
      edgeIds.add(id);
      edges.push({
        id,
        source,
        target,
        sourceHandle: "table",
        targetHandle: "table",
        type: "smoothstep",
        label: relationship.name,
        ariaLabel: `${relationship.source.table} (${relationship.source.columns.join(", ")}) references ${relationship.target.table} (${relationship.target.columns.join(", ")})`,
        style: { stroke: "#8b6daf", strokeWidth: 1.3 },
        labelStyle: { fill: "#6c5684", fontSize: 10 },
        labelBgStyle: { fill: "#faf8fd" },
      });
    }
  }
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 52, ranksep: 110, marginx: 32, marginy: 32 });
  for (const node of nodes)
    graph.setNode(node.id, {
      width: WIDTH,
      height: 65 + node.data.table.columns.length * rowHeight,
    });
  for (const edge of edges) graph.setEdge(edge.source, edge.target, {}, edge.id);
  dagre.layout(graph);
  for (const node of nodes) {
    const position = graph.node(node.id);
    node.position = {
      x: position.x - WIDTH / 2,
      y: position.y - (65 + node.data.table.columns.length * rowHeight) / 2,
    };
  }
  return { nodes, edges, omitted: Math.max(0, tables.length - visible.length) };
}
function Diagram({ tables }: { tables: SchemaTable[] }) {
  const graph = useMemo(() => createSchemaGraph(tables), [tables]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph, setNodes, setEdges]);
  return (
    <div className="schema-diagram">
      <div className="diagram-caption">
        {tables.length} {tables.length === 1 ? "table" : "tables"} · {graph.edges.length} declared{" "}
        {graph.edges.length === 1 ? "relationship" : "relationships"}
        {graph.omitted > 0 && ` · Showing the first 200 tables; ${graph.omitted} omitted`}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesConnectable={false}
        edgesUpdatable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#ddd7e8" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
export function SchemaDiagram({ tables }: { tables: SchemaTable[] }) {
  if (!tables.length)
    return <div className="diagram-empty">Load a database schema to view its relationships.</div>;
  return (
    <ReactFlowProvider>
      <Diagram tables={tables} />
    </ReactFlowProvider>
  );
}
