"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { SaveIndicator, useMapSaver } from "@/components/study/mind-map-editor";
import { GraphView } from "@/components/study/visual-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addConcept, addRelationship, CONCEPT_RELATIONS, labelOf, RELATION_LABEL, removeConcept, removeRelationship, renameConcept, type ConceptMapData, type ConceptRelation } from "@/lib/study/maps";

/**
 * Editable concept map (§16): concepts and typed relationships — causes,
 * requires, leads to, contains, depends on, is an example of — drawn as a
 * graph with the same content listed as text. Every change is saved.
 */
export function ConceptMapEditor({ mapId, title, initial }: { mapId: string; title: string; initial: ConceptMapData }) {
  const [map, setMap] = useState<ConceptMapData>(initial);
  const [newConcept, setNewConcept] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [relation, setRelation] = useState<ConceptRelation>("leads_to");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const saver = useMapSaver(mapId, "concept");

  const commit = (next: ConceptMapData) => {
    setMap(next);
    saver.schedule(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <SaveIndicator state={saver.state} />
      </div>
      <div className="rounded-lg border border-border bg-background p-2">
        <GraphView nodes={map.nodes.map((node) => node.label)} links={map.edges.map((edge) => ({ from: labelOf(map, edge.from), to: labelOf(map, edge.to), relation: RELATION_LABEL[edge.relation] }))} title={title} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="concepts-heading" className="flex flex-col gap-2">
          <h3 id="concepts-heading" className="text-sm font-semibold">
            Concepts ({map.nodes.length})
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {map.nodes.map((node) => (
              <li key={node.id} className="flex items-center gap-1">
                {renaming === node.id ? (
                  <Input
                    aria-label={`Rename ${node.label}`}
                    autoFocus
                    value={draft}
                    maxLength={120}
                    className="h-8"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => {
                      if (draft.trim()) commit(renameConcept(map, node.id, draft.trim()));
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-1 text-left hover:bg-muted"
                    aria-label={`Rename ${node.label}`}
                    onClick={() => {
                      setRenaming(node.id);
                      setDraft(node.label);
                    }}
                  >
                    {node.label}
                  </button>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={`Remove ${node.label}`} disabled={map.nodes.length <= 1} onClick={() => commit(removeConcept(map, node.id))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newConcept.trim()) commit(addConcept(map, newConcept.slice(0, 120)));
              setNewConcept("");
            }}
          >
            <Input aria-label="New concept" placeholder="Add a concept" value={newConcept} maxLength={120} className="h-9" onChange={(event) => setNewConcept(event.target.value)} />
            <Button type="submit" size="sm" variant="secondary" disabled={!newConcept.trim() || map.nodes.length >= 40}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </form>
        </section>

        <section aria-labelledby="relationships-heading" className="flex flex-col gap-2">
          <h3 id="relationships-heading" className="text-sm font-semibold">
            Relationships ({map.edges.length})
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {map.edges.map((edge) => (
              <li key={edge.id} className="flex items-start gap-1">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{labelOf(map, edge.from)}</span> <span className="text-primary">— {RELATION_LABEL[edge.relation]} →</span> <span className="font-medium">{labelOf(map, edge.to)}</span>
                  {edge.note && <span className="block text-xs text-muted-foreground">{edge.note}</span>}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-danger" aria-label={`Remove ${labelOf(map, edge.from)} ${RELATION_LABEL[edge.relation]} ${labelOf(map, edge.to)}`} onClick={() => commit(removeRelationship(map, edge.id))}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (from && to) commit(addRelationship(map, from, to, relation));
            }}
          >
            <Select aria-label="From concept" value={from} onChange={(event) => setFrom(event.target.value)} className="w-40">
              <option value="">From…</option>
              {map.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Relationship" value={relation} onChange={(event) => setRelation(event.target.value as ConceptRelation)} className="w-40">
              {CONCEPT_RELATIONS.map((option) => (
                <option key={option} value={option}>
                  {RELATION_LABEL[option]}
                </option>
              ))}
            </Select>
            <Select aria-label="To concept" value={to} onChange={(event) => setTo(event.target.value)} className="w-40">
              <option value="">To…</option>
              {map.nodes
                .filter((node) => node.id !== from)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary" disabled={!from || !to || from === to}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Link
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
