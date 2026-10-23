"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Small, accessible charts for the progress page (§23 "use understandable
 * charts"). Plain SVG and markup: one hue for magnitude, status colours only
 * for status, thin marks, hairline grid, a legend whenever there are two
 * series, a hover/focus readout and a table view for every chart.
 */

export type DayPoint = { date: string; value: number; secondary?: number };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = value / magnitude;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 2.5 ? 2.5 : step <= 5 ? 5 : 10;
  return nice * magnitude;
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Show as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/60 uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="px-2 py-1.5 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-border">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2 py-1 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Daily columns for the last N days. One series (`value`) in the accent hue;
 * an optional `secondary` (a part of the value, e.g. correct answers) is
 * stacked darker with a legend.
 */
export function DailyColumns({
  title,
  points,
  unit,
  seriesLabel,
  secondaryLabel,
  className,
}: {
  title: string;
  points: DayPoint[];
  unit: string;
  seriesLabel: string;
  secondaryLabel?: string;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const width = 640;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 24, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...points.map((point) => point.value), 0));
  const slot = innerWidth / Math.max(1, points.length);
  const barWidth = Math.min(24, Math.max(4, slot - 2));
  const ticks = [0, max / 2, max];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const current = active !== null ? points[active] : null;
  const stacked = secondaryLabel !== undefined;

  return (
    <figure className={cn("flex flex-col gap-2", className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {current ? `${shortDate(current.date)}: ${current.value} ${unit}${stacked && current.secondary !== undefined ? ` · ${current.secondary} ${secondaryLabel.toLowerCase()}` : ""}` : `${total} ${unit} in ${points.length} days`}
        </span>
      </figcaption>
      {/* A group, not an image: every bar is focusable so keyboard users can read a day's value. */}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="group" aria-label={`${title}: ${total} ${unit} over the last ${points.length} days`}>
        {ticks.map((tick) => {
          const y = padding.top + innerHeight - (tick / max) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          );
        })}
        {points.map((point, index) => {
          const x = padding.left + index * slot + (slot - barWidth) / 2;
          const barHeight = (point.value / max) * innerHeight;
          const y = padding.top + innerHeight - barHeight;
          const secondaryHeight = stacked && point.secondary !== undefined ? (Math.min(point.secondary, point.value) / max) * innerHeight : 0;
          const isActive = active === index;
          return (
            <g
              key={point.date}
              tabIndex={0}
              role="img"
              aria-label={`${shortDate(point.date)}: ${point.value} ${unit}${stacked && point.secondary !== undefined ? `, ${point.secondary} ${secondaryLabel.toLowerCase()}` : ""}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="cursor-default outline-none"
            >
              <rect x={padding.left + index * slot} y={padding.top} width={slot} height={innerHeight} fill="transparent" />
              {point.value > 0 ? (
                <>
                  <rect x={x} y={y} width={barWidth} height={barHeight} rx={Math.min(4, barWidth / 2)} className={cn(stacked ? "fill-primary/35" : "fill-primary", isActive && "opacity-80")} />
                  {stacked && secondaryHeight > 0 && <rect x={x} y={padding.top + innerHeight - secondaryHeight} width={barWidth} height={secondaryHeight} rx={Math.min(4, barWidth / 2)} className={cn("fill-primary", isActive && "opacity-80")} />}
                </>
              ) : (
                <rect x={x} y={padding.top + innerHeight - 1} width={barWidth} height={1} className="fill-border" />
              )}
              {isActive && <rect x={x - 1} y={padding.top} width={barWidth + 2} height={innerHeight} rx={4} className="fill-none stroke-primary" strokeWidth={1} />}
            </g>
          );
        })}
        {points.map((point, index) =>
          index % 7 === points.length % 7 || index === points.length - 1 ? (
            <text key={`label-${point.date}`} x={padding.left + index * slot + slot / 2} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {shortDate(point.date)}
            </text>
          ) : null,
        )}
      </svg>
      {stacked && (
        <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" /> {secondaryLabel}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary/35" aria-hidden="true" /> {seriesLabel}
          </li>
        </ul>
      )}
      <ChartTable caption={title} columns={stacked ? ["Day", seriesLabel, secondaryLabel] : ["Day", seriesLabel]} rows={points.map((point) => (stacked ? [point.date, point.value, point.secondary ?? 0] : [point.date, point.value]))} />
    </figure>
  );
}

/** Horizontal bars of percentages (0-100) with a count beside each; one hue. */
export function PercentBars({ title, rows, emptyText, className }: { title: string; rows: Array<{ key: string; label: string; percent: number | null; detail: string; href?: string | null }>; emptyText: string; className?: string }) {
  const id = useId();
  const shown = rows.filter((row) => row.percent !== null);
  return (
    <figure className={cn("flex flex-col gap-2", className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="text-sm font-medium">
        {title}
      </figcaption>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate" title={row.label}>
                {row.href ? (
                  <a href={row.href} className="hover:underline">
                    {row.label}
                  </a>
                ) : (
                  row.label
                )}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${row.label} ${row.percent}%`} aria-valuenow={row.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${row.percent}%` }} />
              </span>
              <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{row.percent}%</span> · {row.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && <ChartTable caption={title} columns={["Group", "Percent", "Detail"]} rows={shown.map((row) => [row.label, `${row.percent}%`, row.detail])} />}
    </figure>
  );
}

/** Quiz scores in order, as columns with the latest emphasised. */
export function ScoreColumns({ title, scores, className }: { title: string; scores: Array<{ date: string; percent: number; title: string }>; className?: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  if (scores.length === 0) return null;
  const width = 640;
  const height = 160;
  const padding = { top: 12, right: 8, bottom: 24, left: 32 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const slot = innerWidth / scores.length;
  const barWidth = Math.min(24, Math.max(6, slot - 8));
  const current = active !== null ? scores[active] : scores[scores.length - 1];
  return (
    <figure className={cn("flex flex-col gap-2", className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {current.title} · {shortDate(current.date)}: {current.percent}%
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="group" aria-label={`${title}: ${scores.map((score) => `${score.percent}%`).join(", ")}`}>
        {[0, 50, 100].map((tick) => {
          const y = padding.top + innerHeight - (tick / 100) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {tick}%
              </text>
            </g>
          );
        })}
        {scores.map((score, index) => {
          const x = padding.left + index * slot + (slot - barWidth) / 2;
          const barHeight = (score.percent / 100) * innerHeight;
          const last = index === scores.length - 1;
          return (
            <g key={`${score.date}-${index}`} tabIndex={0} role="img" aria-label={`${score.title}, ${shortDate(score.date)}: ${score.percent}%`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} className="cursor-default outline-none">
              <rect x={padding.left + index * slot} y={padding.top} width={slot} height={innerHeight} fill="transparent" />
              <rect x={x} y={padding.top + innerHeight - barHeight} width={barWidth} height={Math.max(1, barHeight)} rx={Math.min(4, barWidth / 2)} className={cn(last || active === index ? "fill-primary" : "fill-primary/35")} />
              {last && (
                <text x={x + barWidth / 2} y={padding.top + innerHeight - barHeight - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
                  {score.percent}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTable caption={title} columns={["Date", "Quiz", "Score"]} rows={scores.map((score) => [score.date, score.title, `${score.percent}%`])} />
    </figure>
  );
}

const STATUS_FILL: Record<string, string> = { mastered: "bg-success", strong: "bg-info", developing: "bg-developing", learning: "bg-warning", weak: "bg-danger", new: "bg-muted-foreground/40" };

/** One stacked strip of the mastery statuses (status colours mean status here) with a legend. */
export function StatusStrip({ title, counts, labels, className }: { title: string; counts: Record<string, number>; labels: Record<string, string>; className?: string }) {
  const id = useId();
  const order = ["mastered", "strong", "developing", "learning", "weak", "new"];
  const total = order.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  return (
    <figure className={cn("flex flex-col gap-2", className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="text-sm font-medium">
        {title}
      </figcaption>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No concepts practiced yet.</p>
      ) : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${title}: ${order.map((key) => `${counts[key] ?? 0} ${labels[key]}`).join(", ")}`}>
            {order.map((key) =>
              (counts[key] ?? 0) > 0 ? <span key={key} className={cn("h-full", STATUS_FILL[key])} style={{ width: `${((counts[key] ?? 0) / total) * 100}%` }} /> : null,
            )}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
            {order.map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_FILL[key])} aria-hidden="true" />
                {labels[key]} <span className="font-semibold text-foreground">{counts[key] ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
