import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SwarmRequest, SwarmResponse } from "./types";
import { streamSwarmExperiment } from "./client";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  newsExcerpt: string;
  request: SwarmRequest;
  response: SwarmResponse;
}

export interface RunProgress {
  current: number;
  total: number;
}

interface SwarmState {
  result: SwarmResponse | null;
  loading: boolean;
  streaming: boolean;
  progress: RunProgress | null;
  error: string | null;
  selectedAgentId: string | null;
  replayRound: number;
  history: HistoryEntry[];

  run: (req: SwarmRequest) => Promise<void>;
  selectAgent: (id: string | null) => void;
  setReplayRound: (n: number) => void;
  loadFromHistory: (id: string) => void;
  clearResult: () => void;
}

export const useSwarmStore = create<SwarmState>()(
  persist(
    (set, get) => ({
      result: null,
      loading: false,
      streaming: false,
      progress: null,
      error: null,
      selectedAgentId: null,
      replayRound: 1,
      history: [],

      async run(req) {
        set({
          loading: true,
          streaming: true,
          error: null,
          result: null,
          selectedAgentId: null,
          progress: { current: 0, total: req.rounds ?? 0 },
          replayRound: 1,
        });
        try {
          const final = await streamSwarmExperiment(req, ({ current, total, partial }) => {
            set({
              result: partial,
              progress: { current, total },
              replayRound: current,
            });
          });
          const entry: HistoryEntry = {
            id: String(Date.now()),
            timestamp: Date.now(),
            newsExcerpt: req.news.slice(0, 60),
            request: req,
            response: final,
          };
          const history = [entry, ...get().history].slice(0, 50);
          set({
            result: final,
            loading: false,
            streaming: false,
            progress: null,
            history,
            replayRound: final.data.rounds.length,
          });
        } catch (e) {
          set({
            loading: false,
            streaming: false,
            progress: null,
            error: (e as Error).message,
          });
        }
      },

      selectAgent(id) {
        set({ selectedAgentId: id });
      },
      setReplayRound(n) {
        set({ replayRound: n });
      },
      loadFromHistory(id) {
        const e = get().history.find((h) => h.id === id);
        if (e) {
          set({
            result: e.response,
            replayRound: e.response.data.rounds.length,
            selectedAgentId: null,
            streaming: false,
            progress: null,
          });
        }
      },
      clearResult() {
        set({ result: null, selectedAgentId: null });
      },
    }),
    {
      name: "swarm.store",
      partialize: (s) => ({ history: s.history }),
    },
  ),
);

