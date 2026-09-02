"use client";

import { ExternalLink, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, InlineInfo, cx } from "@/components/ui/primitives";
import { RESOURCE_TYPE_LABELS } from "@/domain/labels";
import type { Resource, ResourceQuery } from "@/domain/types";
import { useOnline } from "@/hooks/useData";
import { ResourceDialog } from "@/features/resources/ResourceDialog";
import { addResource, deleteResource, hostnameOf, searchResources, searchUrl, type SearchResponse, type SearchResultItem } from "@/services/resources";

interface Props {
  chapterId: string;
  resources: Resource[];
  /** Search hints coming from the task templates (YouTube / web search links). */
  queries?: ResourceQuery[];
  taskId?: string;
  compact?: boolean;
}

export function ResourceList({ chapterId, resources, queries = [], taskId, compact }: Props) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState<{ query: string; response: SearchResponse } | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const online = useOnline();

  const runSearch = async (query: string) => {
    setSearching(query);
    try {
      const response = await searchResources(query);
      setSearch({ query, response });
    } finally {
      setSearching(null);
    }
  };

  const keep = async (item: SearchResultItem) => {
    await addResource({ chapterId, title: item.title, url: item.url, type: item.type, description: item.description.slice(0, 200), source: item.source, origin: "AUTO" });
  };

  return (
    <div className="space-y-3">
      {resources.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted">
                  <Badge className="mr-1.5">{RESOURCE_TYPE_LABELS[r.type]}</Badge>
                  {r.source || hostnameOf(r.url)}
                  {r.description && ` — ${r.description}`}
                </p>
              </div>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-surface-2" aria-label={`Ouvrir ${r.title}`}>
                Ouvrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              <button type="button" onClick={() => deleteResource(r.id)} className="rounded-md p-2 text-muted hover:text-danger" aria-label={`Supprimer ${r.title}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !compact && <p className="text-sm text-muted">Aucune ressource enregistrée pour ce chapitre.</p>
      )}

      {queries.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Recherches suggérées</p>
          <ul className="space-y-1.5">
            {queries.map((q) => (
              <li key={q.query} className="flex flex-wrap items-center gap-2 text-sm">
                <a href={searchUrl(q)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {q.label} <span className="text-muted">({q.provider === "youtube" ? "YouTube" : "Web"})</span>
                </a>
                {q.provider === "youtube" && (
                  <Button size="sm" variant="ghost" onClick={() => runSearch(q.query)} loading={searching === q.query} disabled={!online} icon={<Search className="h-3.5 w-3.5" aria-hidden />}>
                    Chercher automatiquement
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!online && <p className="mt-1 text-xs text-muted">Connexion Internet nécessaire pour cette fonctionnalité.</p>}
        </div>
      )}

      {search && (
        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Résultats : {search.query}</p>
            <Button size="sm" variant="ghost" onClick={() => runSearch(search.query)} loading={searching === search.query} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
              Actualiser
            </Button>
          </div>
          {search.response.status === "ok" ? (
            search.response.items.length === 0 ? (
              <p className="text-sm text-muted">Aucune ressource pertinente trouvée automatiquement.</p>
            ) : (
              <ul className="space-y-2">
                {search.response.items.map((item) => {
                  const already = resources.some((r) => r.url === item.url);
                  return (
                    <li key={item.url} className={cx("flex items-center gap-2 rounded-lg bg-surface px-3 py-2", already && "opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted">
                          <Badge className="mr-1.5">{RESOURCE_TYPE_LABELS[item.type]}</Badge>
                          {item.source} · {item.kind === "playlist" ? "Playlist" : "Vidéo"}
                        </p>
                      </div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded-md p-2 text-muted hover:text-fg" aria-label="Ouvrir">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Button size="sm" onClick={() => keep(item)} disabled={already} icon={<Plus className="h-3.5 w-3.5" aria-hidden />}>
                        {already ? "Ajoutée" : "Garder"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <InlineInfo>{search.response.message}</InlineInfo>
          )}
        </div>
      )}

      <Button size="sm" onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
        Ajouter une ressource manuellement
      </Button>
      <ResourceDialog open={adding} onClose={() => setAdding(false)} chapterId={chapterId} taskId={taskId} />
    </div>
  );
}
