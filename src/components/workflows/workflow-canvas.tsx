"use client";

import * as React from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Icon } from "@/ds";
import { toolDisplay } from "@/lib/tool-display";
import type { WorkflowSummary } from "@/hooks/use-workflows";

/**
 * Lays out steps in a column when a blueprint has no stored coordinates.
 *
 * Blueprints authored as JSON in Phase 5 describe order, not geometry, so
 * without this every node would stack at (0,0) and the canvas would look
 * broken for exactly the templates we ship.
 */
function positionOf(
  node: WorkflowSummary["nodes"][number],
  index: number,
): { x: number; y: number } {
  return node.position ?? { x: 0, y: index * 110 };
}

function toFlowNodes(workflow: WorkflowSummary): Node[] {
  return workflow.nodes.map((node, index) => {
    const display = node.tool ? toolDisplay(node.tool) : null;
    return {
      id: node.id ?? String(index),
      position: positionOf(node, index),
      data: {
        label: (
          <span className="flex items-center gap-space-xs">
            <Icon name={display ? display.icon : "Automation"} size={16} />
            <span className="truncate">
              {node.label ?? display?.done ?? `Step ${index + 1}`}
            </span>
          </span>
        ),
      },
      // Styling via `style` rather than Tailwind classes: React Flow writes its
      // own inline styles onto the node wrapper, and a class-based override
      // loses to them without `!important` on every property.
      style: {
        background: "var(--color-canvas)",
        color: "var(--color-ink)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "var(--color-hairline)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption-size)",
        padding: "var(--space-xs) var(--space-sm)",
        width: 220,
      },
      type:
        index === 0
          ? "input"
          : index === workflow.nodes.length - 1
            ? "output"
            : "default",
    } satisfies Node;
  });
}

function toFlowEdges(workflow: WorkflowSummary): Edge[] {
  if (workflow.edges.length > 0) {
    return workflow.edges.map((edge, index) => ({
      id: edge.id ?? `e${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: workflow.status === "active",
      style: { stroke: "var(--color-border-strong)" },
    }));
  }

  // A linear chain is the honest default: a blueprint with steps but no edges
  // runs them in order, and drawing nothing would imply they are unrelated.
  return workflow.nodes.slice(0, -1).map((node, index) => ({
    id: `e${index}`,
    source: node.id ?? String(index),
    target: workflow.nodes[index + 1]?.id ?? String(index + 1),
    animated: workflow.status === "active",
    style: { stroke: "var(--color-border-strong)" },
  }));
}

/**
 * Read-only visualisation of a blueprint.
 *
 * Deliberately not an editor: the way you change an automation in app8n is to
 * say so in chat. The canvas exists to make what the agent will do legible,
 * which is a different job from letting someone wire nodes by hand.
 */
export default function WorkflowCanvas({
  workflow,
}: {
  workflow: WorkflowSummary;
}) {
  const nodes = React.useMemo(() => toFlowNodes(workflow), [workflow]);
  const edges = React.useMemo(() => toFlowEdges(workflow), [workflow]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-space-lg text-center text-body-md text-muted">
        This blueprint has no steps recorded yet. It runs as a single agentic
        instruction.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      proOptions={{ hideAttribution: false }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode="light"
      className="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
