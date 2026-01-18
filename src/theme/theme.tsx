import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getThemeMode,
  setThemeMode,
  ThemeMode,
} from "../services/storageService";

export type ThemeColors = {
  background: readonly [string, string, ...string[]];
  surface: string;
  surfaceAlt: string;
  line: string;
  softLine: string;
  text: string;
  textDim: string;
  textSoft: string;
  accent: string;
  live: string;
  success: string;
  danger: string;
};

type ThemeValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
};

const darkColors: ThemeColors = {
  background: ["#0B0F1F", "#10162C", "#0B0F1F"] as const,
  surface: "rgba(16,22,44,0.8)",
  surfaceAlt: "rgba(255,255,255,0.06)",
  line: "rgba(255,255,255,0.12)",
  softLine: "rgba(255,255,255,0.08)",
  text: "#EAF1FF",
  textDim: "rgba(234,241,255,0.68)",
  textSoft: "rgba(234,241,255,0.52)",
  accent: "#8FD0FF",
  live: "#FF6B6B",
  success: "#A6FFC9",
  danger: "#FFB8B8",
};

const lightColors: ThemeColors = {
  background: ["#F6F8FB", "#EEF2FA", "#E7EEF8"] as const,
  surface: "rgba(255,255,255,0.9)",
  surfaceAlt: "rgba(255,255,255,0.7)",
  line: "rgba(15,23,42,0.12)",
  softLine: "rgba(15,23,42,0.08)",
  text: "#0B1020",
  textDim: "rgba(11,16,32,0.65)",
  textSoft: "rgba(11,16,32,0.5)",
  accent: "#2F6FED",
  live: "#E45A5A",
  success: "#14804A",
  danger: "#B91C1C",
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    let mounted = true;
    getThemeMode().then((stored) => {
      if (mounted && stored) setModeState(stored);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setThemeMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      setThemeMode(next);
      return next;
    });
  }, []);

  const colors = useMemo(
    () => (mode === "dark" ? darkColors : lightColors),
    [mode],
  );

  const value = useMemo(
    () => ({
      mode,
      colors,
      toggleMode,
      setMode,
    }),
    [mode, colors, toggleMode, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
