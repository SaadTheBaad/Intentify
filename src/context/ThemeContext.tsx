import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: {
    bgGradient: [string, string, string];
    text: string;
    textSecondary: string;
    cardBg: string;
    cardBorder: string;
    iconBg: string;
    iconBorder: string;
    chipBg: string;
    chipBorder: string;
    buttonPrimary: string;
    buttonSecondary: string;
    actionBtnBg: string;
    actionBtnBorder: string;
    infoBg: string;
    infoBorder: string;
    infoText: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const THEME_COLORS = {
  dark: {
    bgGradient: ["#0B1020", "#0E1731", "#0A0F1F"] as [string, string, string],
    text: "#EAF0FF",
    textSecondary: "rgba(234,240,255,0.65)",
    cardBg: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.10)",
    iconBg: "rgba(215,227,255,0.12)",
    iconBorder: "rgba(215,227,255,0.16)",
    chipBg: "rgba(215,227,255,0.10)",
    chipBorder: "rgba(215,227,255,0.14)",
    buttonPrimary: "#D7E3FF",
    buttonSecondary: "rgba(215,227,255,0.08)",
    actionBtnBg: "rgba(215,227,255,0.08)",
    actionBtnBorder: "rgba(215,227,255,0.14)",
    infoBg: "rgba(191,210,255,0.06)",
    infoBorder: "rgba(191,210,255,0.10)",
    infoText: "rgba(234,240,255,0.75)",
  },
  light: {
    bgGradient: ["#F0F4FF", "#FFFFFF", "#F5F8FF"] as [string, string, string],
    text: "#0B1020",
    textSecondary: "rgba(11,16,32,0.65)",
    cardBg: "rgba(0,0,0,0.03)",
    cardBorder: "rgba(0,0,0,0.06)",
    iconBg: "rgba(11,16,32,0.05)",
    iconBorder: "rgba(11,16,32,0.08)",
    chipBg: "rgba(11,16,32,0.04)",
    chipBorder: "rgba(11,16,32,0.08)",
    buttonPrimary: "#2D5BD8",
    buttonSecondary: "rgba(11,16,32,0.05)",
    actionBtnBg: "rgba(11,16,32,0.05)",
    actionBtnBorder: "rgba(11,16,32,0.10)",
    infoBg: "rgba(45, 91, 216, 0.04)",
    infoBorder: "rgba(45, 91, 216, 0.08)",
    infoText: "rgba(11,16,32,0.70)",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    AsyncStorage.getItem("user-theme").then((saved) => {
      if (saved === "light" || saved === "dark") {
        setTheme(saved as Theme);
      }
    });
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    AsyncStorage.setItem("user-theme", next);
  };

  const colors = THEME_COLORS[theme];

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === "dark", toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
