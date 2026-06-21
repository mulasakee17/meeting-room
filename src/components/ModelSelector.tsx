"use client";

import { useState, useEffect, useRef } from "react";
import { LLMProvider } from "@/types";
import { availableModels } from "@/lib/llm/providers";

interface ModelSelectorProps {
  onModelChange: (provider: LLMProvider, model: string) => void;
}

const DEFAULT_PROVIDER: LLMProvider = "deepseek";

const providerLabels: Record<LLMProvider, { label: string; emoji: string }> = {
  deepseek: { label: "DeepSeek", emoji: "🐋" },
  openai: { label: "OpenAI", emoji: "🤖" },
  anthropic: { label: "Claude", emoji: "🧠" },
  local: { label: "本地模型", emoji: "💻" },
};

export default function ModelSelector({ onModelChange }: ModelSelectorProps) {
  const [provider, setProvider] = useState<LLMProvider>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(availableModels[DEFAULT_PROVIDER][0]);
  const [isOpen, setIsOpen] = useState(false);
  const initialized = useRef(false);

  // Sync initial defaults to parent on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      onModelChange(DEFAULT_PROVIDER, availableModels[DEFAULT_PROVIDER][0]);
    }
  }, [onModelChange]);

  const handleProviderChange = (newProvider: LLMProvider) => {
    const defaultModel = availableModels[newProvider][0];
    setProvider(newProvider);
    setModel(defaultModel);
    onModelChange(newProvider, defaultModel);
    setIsOpen(false);
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    onModelChange(provider, newModel);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
      >
        <span>{providerLabels[provider].emoji}</span>
        <span className="text-sm">{providerLabels[provider].label}</span>
        <span className="text-xs text-zinc-500">/</span>
        <span className="text-xs text-cyan-400">{model}</span>
        <span className="text-zinc-500 text-xs ml-1">▾</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop for click-outside dismissal */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-12 right-0 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 animate-slide-up">
            <div className="p-3 border-b border-zinc-700">
              <h3 className="text-sm font-semibold text-zinc-200">选择模型</h3>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {Object.entries(availableModels).map(([p, models]) => (
                <div key={p}>
                  <button
                    onClick={() => handleProviderChange(p as LLMProvider)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      provider === p
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "hover:bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    <span>{providerLabels[p as LLMProvider].emoji}</span>
                    <span>{providerLabels[p as LLMProvider].label}</span>
                    {provider === p && <span className="ml-auto">✓</span>}
                  </button>

                  {provider === p && (
                    <div className="mt-1 ml-6 space-y-1">
                      {models.map((m) => (
                        <button
                          key={m}
                          onClick={() => handleModelChange(m)}
                          className={`w-full text-left px-3 py-1 rounded text-xs transition-colors ${
                            model === m
                              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                              : "hover:bg-zinc-800 text-zinc-500"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-zinc-700 text-xs text-zinc-500">
              <p>💡 本地模型需要运行 Ollama</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}