"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DecisionPill } from "@/components/decision-pill";
import type { RecentTransaction } from "@/services/commerce/analytics";

const FEED_POLL_MS = 5_000;
const FEED_MAX_ROWS = 50;
const HIGHLIGHT_MS = 2_000;

function formatFeedTs(ts: string | Date) {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LiveActivityFeed({
  initial,
}: {
  initial: RecentTransaction[];
}) {
  const [rows, setRows] = useState(initial);
  const [highlightIds, setHighlightIds] = useState<Set<number>>(() => new Set());
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncLabel, setSyncLabel] = useState("just now");
  const maxIdRef = useRef(
    initial.length > 0 ? Math.max(...initial.map((r) => r.id)) : 0,
  );

  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch(`/api/feed?after=${maxIdRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: RecentTransaction[];
        latestId: number;
      };
      if (data.items.length === 0) {
        setLastSync(new Date());
        return;
      }

      const incomingIds = new Set(data.items.map((i) => i.id));
      setRows((prev) => {
        const merged = [...data.items, ...prev.filter((r) => !incomingIds.has(r.id))];
        return merged.slice(0, FEED_MAX_ROWS);
      });
      maxIdRef.current = Math.max(maxIdRef.current, data.latestId);
      setHighlightIds(incomingIds);
      setLastSync(new Date());
      window.setTimeout(() => setHighlightIds(new Set()), HIGHLIGHT_MS);
    } catch {
      /* keep last good snapshot */
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), FEED_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const tick = () => {
      if (!lastSync) return;
      const secs = Math.floor((Date.now() - lastSync.getTime()) / 1000);
      setSyncLabel(secs <= 1 ? "just now" : `${secs}s ago`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lastSync]);

  return (
    <section>
      <div className="zone-label">
        <span className="tick" /> LIVE A2A ACTIVITY FEED
        <span className="feed-sync">Updated {syncLabel}</span>
      </div>
      <div className="panel panel-scroll">
        {rows.length === 0 ? (
          <p style={{ padding: 20, color: "var(--dim)", fontSize: "0.85rem" }}>
            No agent traffic yet. Once buyer agents hit the A2A endpoint, scored
            requests stream here in real time.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--dim)", fontSize: "0.66rem" }}>
                <Th>Time</Th>
                <Th>Agent DID</Th>
                <Th>Intent</Th>
                <Th>Rank</Th>
                <Th>Decision</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr
                  key={tx.id}
                  className={highlightIds.has(tx.id) ? "feed-row-new" : undefined}
                  style={{ borderTop: "1px solid var(--stroke)" }}
                >
                  <Td dim>{formatFeedTs(tx.ts)}</Td>
                  <Td mono>{tx.did}</Td>
                  <Td dim>{tx.intent}</Td>
                  <Td>{tx.rank}</Td>
                  <Td>
                    <DecisionPill decision={tx.decision} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  dim,
  mono,
}: {
  children: React.ReactNode;
  dim?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 14px",
        fontSize: "0.8rem",
        color: dim ? "var(--dim)" : "var(--text)",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </td>
  );
}
