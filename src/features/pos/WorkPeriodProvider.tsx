import React from "react";
import { db } from "@/db/appDb";
import type { WorkPeriod } from "@/db/schema";

type WorkPeriodContextValue = {
  currentWorkPeriod: WorkPeriod | null;
  isWorkPeriodActive: boolean;
  startWorkPeriod: (cashier: string) => Promise<WorkPeriod>;
  endWorkPeriod: () => Promise<void>;
  refreshWorkPeriod: (cashier?: string) => Promise<void>;
};

const WorkPeriodContext = React.createContext<WorkPeriodContextValue | null>(null);

function makeId(prefix: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto 
    ? (crypto as any).randomUUID() 
    : Math.random().toString(16).slice(2);
  return `${prefix}_${rand}_${Date.now().toString(16)}`;
}

export function WorkPeriodProvider({ children }: { children: React.ReactNode }) {
  const [currentWorkPeriod, setCurrentWorkPeriod] = React.useState<WorkPeriod | null>(null);

  const refreshWorkPeriod = React.useCallback(async (_cashier?: string) => {
    // Find any open work period (shared across all roles)
    const periods = await db.workPeriods
      .filter((wp) => !wp.isClosed)
      .toArray();
    
    // Get the most recent one
    const active = periods.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    setCurrentWorkPeriod(active);
  }, []);

  const startWorkPeriod = React.useCallback(async (cashier: string): Promise<WorkPeriod> => {
    const now = Date.now();
    const wp: WorkPeriod = {
      id: makeId("wp"),
      cashier,
      startedAt: now,
      isClosed: false,
    };
    await db.workPeriods.put(wp);
    setCurrentWorkPeriod(wp);
    return wp;
  }, []);

  const endWorkPeriod = React.useCallback(async () => {
    if (!currentWorkPeriod) return;
    const updated: WorkPeriod = {
      ...currentWorkPeriod,
      endedAt: Date.now(),
      isClosed: true,
    };
    await db.workPeriods.put(updated);
    setCurrentWorkPeriod(null);
  }, [currentWorkPeriod]);

  // Auto-load active work period on mount
  React.useEffect(() => {
    refreshWorkPeriod();
  }, [refreshWorkPeriod]);

  const isWorkPeriodActive = currentWorkPeriod !== null && !currentWorkPeriod.isClosed;

  const value = React.useMemo<WorkPeriodContextValue>(
    () => ({
      currentWorkPeriod,
      isWorkPeriodActive,
      startWorkPeriod,
      endWorkPeriod,
      refreshWorkPeriod,
    }),
    [currentWorkPeriod, isWorkPeriodActive, startWorkPeriod, endWorkPeriod, refreshWorkPeriod]
  );

  return <WorkPeriodContext.Provider value={value}>{children}</WorkPeriodContext.Provider>;
}

export function useWorkPeriod() {
  const ctx = React.useContext(WorkPeriodContext);
  if (!ctx) throw new Error("useWorkPeriod must be used within <WorkPeriodProvider>");
  return ctx;
}
