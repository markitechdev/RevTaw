"use client";

import { ChevronDown, ChevronRight, HelpCircle, Link2, Plus, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addChild, childrenOf, connectNodes, layoutMindMap, removeNode, renameNode, rootOf, toggleNode, type MindMapData, type MindNode } from "@/lib/study/maps";
import { saveMapAction } from "@/lib/study/method-actions";
import { cn } from "@/lib/utils";

type SaveState = "saved" | "saving" | "error";

/** Saves the latest version shortly after the last edit. */
export function useMapSaver(mapId: string, kind: "mind" | "concept") {
  const [state, setState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const schedule = (data: unknown) => {
    latest.current = data;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const result = await saveMapAction({ mapId, kind, data: latest.current });
      setState(result.ok ? "saved" : "error");
    }, 500);
  };
  return { state, schedule };
}

/**
 * The last removal from a map, so one tap brings it back: a removed idea takes its branch with it, and a
 * removed concept its relationships. Any other change to the map makes the removal final.
 */
export function useUndoableRemoval<T>(apply: (map: T) => void) {
  const [removal, setRemoval] = useState<{ before: T; message: string } | null>(null);
  return {
    removal,
    /** Records the map as it was before a removal (call before committing the removal). */
    remember: (before: T, message: string) => setRemoval({ before, message }),
    forget: () => setRemoval(null),
    undo: () => {
      if (!removal) return;
      apply(removal.before);
      setRemoval(null);
    },
  };
}

/** Says what was removed, with Undo; a polite live region, so the removal is announced too. */
export function UndoBar({ removal, onUndo, onDismiss }: { removal: { message: string } | null; onUndo: () => void; onDismiss: () => void }) {
  const undoButton = useRef<HTMLButtonElement>(null);
  // The removed item's button is gone, so focus goes to Undo instead of the page.
  useEffect(() => {
    if (removal) undoButton.current?.focus();
  }, [removal]);
  return (
    <div role="status" aria-live="polite" className={cn(removal && "flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm")}>
      {removal && (
        <>
          <span className="min-w-0 flex-1">{removal.message}</span>
          <Button ref={undoButton} type="button" size="sm" variant="secondary" onClick={onUndo}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Undo
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Dismiss" onClick={onDismiss}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className={cn("text-xs", state === "error" ? "text-danger" : "text-muted-foreground")} role="status">
      {state === "saving" ? "Saving…" : state === "error" ? "Not saved — check the last change" : "All changes saved"}
    </span>
  );
}

/** Map view: a left-to-right tree drawn in SVG; click a branch to fold it. */
function MapCanvas({ map, onToggle }: { map: MindMapData; onToggle: (id: string) => void }) {
  const layout = layoutMindMap(map);
  const position = new Map(layout.nodes.map((entry) => [entry.node.id, entry]));
  const boxWidth = 168;
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-background p-2">
      <svg width={layout.width} height={layout.height + 10} role="img" aria-label={`Mind map with ${map.nodes.length} ideas`}>
        {layout.nodes
          .filter((entry) => entry.node.parentId && position.has(entry.node.parentId))
          .map((entry) => {
            const parent = position.get(entry.node.parentId!)!;
            const startX = parent.x + boxWidth;
            const middle = (startX + entry.x) / 2;
            return <path key={`edge-${entry.node.id}`} d={`M ${startX} ${parent.y} C ${middle} ${parent.y}, ${middle} ${entry.y}, ${entry.x} ${entry.y}`} className="fill-none stroke-border" strokeWidth={1.5} />;
          })}
        {map.links.map((link) => {
          const from = position.get(link.from);
          const to = position.get(link.to);
          if (!from || !to) return null;
          const x1 = from.x + boxWidth / 2;
          const x2 = to.x + boxWidth / 2;
          return (
            <g key={link.id}>
              <path d={`M ${x1} ${from.y} Q ${(x1 + x2) / 2 + 60} ${(from.y + to.y) / 2}, ${x2} ${to.y}`} className="fill-none stroke-primary" strokeWidth={1.2} strokeDasharray="5 4" />
              {link.label && (
                <text x={(x1 + x2) / 2 + 34} y={(from.y + to.y) / 2} className="fill-primary text-[11px]">
                  {link.label}
                </text>
              )}
            </g>
          );
        })}
        {layout.nodes.map((entry) => {
          const hasChildren = childrenOf(map, entry.node.id).length > 0;
          const text = entry.node.label.length > 24 ? `${entry.node.label.slice(0, 23)}…` : entry.node.label;
          return (
            <g
              key={entry.node.id}
              role={hasChildren ? "button" : undefined}
              tabIndex={hasChildren ? 0 : undefined}
              aria-label={hasChildren ? `${entry.node.collapsed ? "Expand" : "Collapse"} ${entry.node.label}` : undefined}
              onClick={hasChildren ? () => onToggle(entry.node.id) : undefined}
              onKeyDown={hasChildren ? (event) => (event.key === "Enter" || event.key === " ") && onToggle(entry.node.id) : undefined}
              className={hasChildren ? "cursor-pointer" : undefined}
            >
              <rect x={entry.x} y={entry.y - 16} width={boxWidth} height={32} rx={10} className={cn(entry.depth === 0 ? "fill-primary" : entry.depth === 1 ? "fill-primary-soft stroke-primary" : "fill-card stroke-border")} strokeWidth={1.2} />
              <text x={entry.x + 10} y={entry.y + 4} className={cn("text-[12px]", entry.depth === 0 ? "fill-primary-foreground font-medium" : "fill-foreground")}>
                {text}
              </text>
              {entry.hiddenChildren > 0 && (
                <text x={entry.x + boxWidth - 8} y={entry.y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                  +{entry.hiddenChildren}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Interactive mind map (§16): expand, collapse, add, edit, remove, connect
 * and quiz any branch. Outline view for editing (keyboard and screen-reader
 * friendly) and a drawn map view. Every change is saved.
 */
export function MindMapEditor({ mapId, initial, onQuiz, quizBusy = null }: { mapId: string; initial: MindMapData; onQuiz?: (node: MindNode) => void; quizBusy?: string | null }) {
  const [map, setMap] = useState<MindMapData>(initial);
  const [view, setView] = useState<"outline" | "map">("outline");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const saver = useMapSaver(mapId, "mind");
  const apply = (next: MindMapData) => {
    setMap(next);
    saver.schedule(next);
  };
  const removals = useUndoableRemoval<MindMapData>(apply);

  const commit = (next: MindMapData) => {
    apply(next);
    removals.forget();
  };
  const remove = (node: MindNode) => {
    const next = removeNode(map, node.id);
    const under = map.nodes.length - next.nodes.length - 1;
    apply(next);
    removals.remember(map, under > 0 ? `Removed “${node.label}” and ${under} idea${under === 1 ? "" : "s"} under it.` : `Removed “${node.label}”.`);
  };
  const startEdit = (node: MindNode) => {
    setEditing(node.id);
    setDraft(node.label);
  };
  const finishEdit = () => {
    if (editing && draft.trim()) commit(renameNode(map, editing, draft.trim().slice(0, 120)));
    setEditing(null);
  };
  const addUnder = (node: MindNode) => {
    const result = addChild(map, node.id, "New idea");
    commit(result.map);
    setEditing(result.id);
    setDraft("New idea");
  };
  const connect = () => {
    if (connecting && target) commit(connectNodes(map, connecting, target, linkLabel.trim().slice(0, 60) || null));
    setConnecting(null);
    setTarget("");
    setLinkLabel("");
  };

  const renderNode = (node: MindNode, depth: number) => {
    const children = childrenOf(map, node.id);
    const isRoot = node.parentId === null;
    return (
      <li key={node.id} role="treeitem" aria-level={depth + 1} aria-expanded={children.length ? !node.collapsed : undefined} aria-selected={false} className="flex flex-col gap-1">
        <div className={cn("group flex flex-wrap items-center gap-1 rounded-lg px-1 py-0.5", isRoot && "bg-primary-soft/40")}>
          {children.length > 0 ? (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`${node.collapsed ? "Expand" : "Collapse"} ${node.label}`} onClick={() => commit(toggleNode(map, node.id))}>
              {node.collapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            </Button>
          ) : (
            <span className="inline-block h-7 w-7" aria-hidden="true" />
          )}
          {editing === node.id ? (
            <Input
              aria-label={`Rename ${node.label}`}
              autoFocus
              value={draft}
              maxLength={120}
              className="h-8 w-56"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={finishEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishEdit();
                if (event.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button type="button" className={cn("rounded px-1 text-left text-sm hover:bg-muted", isRoot && "font-semibold")} aria-label={`Edit ${node.label}`} onClick={() => startEdit(node)}>
              {node.label}
            </button>
          )}
          {node.collapsed && children.length > 0 && <span className="text-xs text-muted-foreground">({children.length} hidden)</span>}
          <span className="flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Add a branch under ${node.label}`} onClick={() => addUnder(node)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Connect ${node.label} to another idea`} onClick={() => setConnecting(connecting === node.id ? null : node.id)}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            {onQuiz && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Quiz me on ${node.label}`} loading={quizBusy === node.id} disabled={Boolean(quizBusy)} onClick={() => onQuiz(node)}>
                {quizBusy !== node.id && <HelpCircle className="h-4 w-4" aria-hidden="true" />}
              </Button>
            )}
            {!isRoot && (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={`Remove ${node.label}`} onClick={() => remove(node)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </span>
        </div>
        {node.note && <p className="ml-9 text-xs text-muted-foreground">{node.note}</p>}
        {connecting === node.id && (
          <div className="ml-9 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2 text-sm">
            <Select aria-label={`Connect ${node.label} to`} value={target} onChange={(event) => setTarget(event.target.value)} className="w-48">
              <option value="">Choose an idea…</option>
              {map.nodes
                .filter((other) => other.id !== node.id)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.label}
                  </option>
                ))}
            </Select>
            <Input aria-label="Connection label (optional)" placeholder="label (optional)" value={linkLabel} maxLength={60} className="h-9 w-40" onChange={(event) => setLinkLabel(event.target.value)} />
            <Button type="button" size="sm" disabled={!target} onClick={connect}>
              Connect
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConnecting(null)}>
              Cancel
            </Button>
          </div>
        )}
        {children.length > 0 && !node.collapsed && (
          <ul role="group" className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Map view" className="inline-flex rounded-lg border border-border p-0.5 text-sm">
          {(["outline", "map"] as const).map((option) => (
            <button key={option} type="button" role="radio" aria-checked={view === option} onClick={() => setView(option)} className={cn("rounded-md px-3 py-1 capitalize", view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {option}
            </button>
          ))}
        </div>
        <SaveIndicator state={saver.state} />
      </div>
      <UndoBar removal={removals.removal} onUndo={removals.undo} onDismiss={removals.forget} />
      {view === "outline" ? (
        <ul role="tree" aria-label="Mind map" className="flex flex-col gap-1">
          {renderNode(rootOf(map), 0)}
        </ul>
      ) : (
        <MapCanvas map={map} onToggle={(id) => commit(toggleNode(map, id))} />
      )}
      {map.links.length > 0 && (
        <div className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</p>
          <ul className="mt-1 flex flex-col gap-1">
            {map.links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {map.nodes.find((node) => node.id === link.from)?.label} ↔ {map.nodes.find((node) => node.id === link.to)?.label}
                  {link.label ? <span className="text-muted-foreground"> ({link.label})</span> : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Remove connection"
                  onClick={() => {
                    apply({ ...map, links: map.links.filter((entry) => entry.id !== link.id) });
                    removals.remember(map, "Removed the connection.");
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
