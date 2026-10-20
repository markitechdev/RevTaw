import { ArrowDown } from "lucide-react";

import type { Visual } from "@/lib/study/visuals";
import { cn } from "@/lib/utils";

/**
 * Renders a dual-coding visual (§16): table, flowchart, timeline, hierarchy
 * or a concept graph. Pure markup and SVG so it works in both colour themes
 * and in print; every picture also carries its content as text.
 */

function wrap(label: string, width = 16): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width && current) {
      lines.push(current);
      current = word;
    } else current = (current + " " + word).trim();
  }
  if (current) lines.push(current);
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2].slice(0, width - 1)}…`];
  return lines;
}

/** Concept graph: nodes on a circle, labelled arrows between them. */
export function GraphView({ nodes, links, title }: { nodes: string[]; links: Array<{ from: string; to: string; relation: string }>; title: string }) {
  const width = 640;
  const height = 440;
  const radius = nodes.length <= 3 ? 120 : 170;
  const centre = { x: width / 2, y: height / 2 };
  const position = new Map(nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2;
    return [node, { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) }] as const;
  }));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}: ${links.map((link) => `${link.from} ${link.relation} ${link.to}`).join("; ")}`}>
      <defs>
        <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {links.map((link, index) => {
        const from = position.get(link.from);
        const to = position.get(link.to);
        if (!from || !to) return null;
        // Stop the arrow at the edge of the target box.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const end = { x: to.x - (dx / length) * 46, y: to.y - (dy / length) * 26 };
        const start = { x: from.x + (dx / length) * 46, y: from.y + (dy / length) * 26 };
        const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        return (
          <g key={`${link.from}-${link.to}-${index}`}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="stroke-muted-foreground" strokeWidth={1.5} markerEnd="url(#graph-arrow)" />
            <rect x={middle.x - link.relation.length * 3.4 - 6} y={middle.y - 10} width={link.relation.length * 6.8 + 12} height={20} rx={10} className="fill-background stroke-border" />
            <text x={middle.x} y={middle.y + 4} textAnchor="middle" className="fill-primary text-[11px] font-medium">
              {link.relation}
            </text>
          </g>
        );
      })}
      {nodes.map((node) => {
        const point = position.get(node)!;
        const lines = wrap(node);
        return (
          <g key={node}>
            <rect x={point.x - 58} y={point.y - 12 - lines.length * 7} width={116} height={24 + lines.length * 14 - 10} rx={10} className="fill-card stroke-primary" strokeWidth={1.5} />
            <text x={point.x} y={point.y - (lines.length - 1) * 7 + 4} textAnchor="middle" className="fill-foreground text-[12px]">
              {lines.map((line, index) => (
                <tspan key={index} x={point.x} dy={index === 0 ? 0 : 14}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function VisualView({ visual, title, className }: { visual: Visual; title: string; className?: string }) {
  switch (visual.type) {
    case "table":
      return (
        <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-muted/60">
              <tr>
                {visual.columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visual.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-border align-top">
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th key={cellIndex} scope="row" className="px-3 py-2 font-medium">
                        {cell}
                      </th>
                    ) : (
                      <td key={cellIndex} className="px-3 py-2">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "flowchart":
      return (
        <ol className={cn("flex flex-col items-stretch gap-1", className)} aria-label={`${title} (flowchart)`}>
          {visual.steps.map((step, index) => (
            <li key={`${index}-${step.label}`} className="flex flex-col items-center gap-1">
              <div className="w-full rounded-lg border border-primary/40 bg-primary-soft/30 px-3 py-2 text-sm">
                <p className="font-medium">
                  <span className="text-primary">{index + 1}.</span> {step.label}
                </p>
                {step.detail && <p className="mt-0.5 text-muted-foreground">{step.detail}</p>}
              </div>
              {index < visual.steps.length - 1 && <ArrowDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      );
    case "timeline":
      return (
        <ol className={cn("relative ml-2 flex flex-col gap-4 border-l-2 border-primary/40 pl-5", className)} aria-label={`${title} (timeline)`}>
          {visual.events.map((event, index) => (
            <li key={`${index}-${event.label}`} className="relative text-sm">
              <span className="absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full border-2 border-primary bg-card" aria-hidden="true" />
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{event.when}</p>
              <p className="font-medium">{event.label}</p>
              {event.detail && <p className="text-muted-foreground">{event.detail}</p>}
            </li>
          ))}
        </ol>
      );
    case "hierarchy":
      return (
        <div className={cn("flex flex-col items-start gap-2 text-sm", className)} aria-label={`${title} (diagram)`}>
          <p className="rounded-lg border border-primary bg-primary-soft/40 px-3 py-1.5 font-medium">{visual.root}</p>
          <ul className="ml-4 flex flex-col gap-2 border-l-2 border-border pl-4">
            {visual.children.map((child) => (
              <li key={child.label} className="relative">
                <span className="absolute -left-4 top-3 h-0.5 w-3 bg-border" aria-hidden="true" />
                <p className="inline-block rounded-lg border border-border bg-card px-3 py-1.5">{child.label}</p>
                {child.children && child.children.length > 0 && (
                  <ul className="ml-4 mt-2 flex flex-col gap-1.5 border-l-2 border-border pl-4">
                    {child.children.map((grandchild) => (
                      <li key={grandchild.label} className="relative">
                        <span className="absolute -left-4 top-3 h-0.5 w-3 bg-border" aria-hidden="true" />
                        <p className="inline-block rounded-lg bg-muted/60 px-2.5 py-1 text-[13px]">{grandchild.label}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    case "relationships":
      return (
        <div className={cn("flex flex-col gap-3", className)}>
          <div className="rounded-lg border border-border bg-background p-2">
            <GraphView nodes={visual.nodes} links={visual.links} title={title} />
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {visual.links.map((link, index) => (
              <li key={`${index}-${link.from}`}>
                <span className="font-medium">{link.from}</span> <span className="text-primary">— {link.relation} →</span> <span className="font-medium">{link.to}</span>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}
