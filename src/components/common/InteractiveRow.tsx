import { ReactNode, useState } from "react";
import { Focusable } from "@decky/ui";

export function focusHalo(focused: boolean) {
  return {
    boxShadow: focused
      ? "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"
      : "none",
    transform: focused ? "scale(1.02)" : "scale(1)",
    transition: "box-shadow 0.1s ease, transform 0.1s ease",
    position: "relative" as const,
    zIndex: focused ? 2 : 0,
    outline: "none",
  };
}

export interface InteractiveRowProps {
  children: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  active?: boolean;
  style?: any;
  tabIndex?: number;
  onKeyDown?: (e: any) => void;
  "data-deckify-list-item"?: string;
  "data-deckify-label"?: string;
  "aria-label"?: string;
}

export function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export interface RoundBtnProps {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  size?: number;
  accent?: boolean;
  "aria-label"?: string;
}

export function RoundBtn({
  children,
  onClick,
  active,
  size = 46,
  accent,
  "aria-label": ariaLabel,
}: RoundBtnProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      aria-label={ariaLabel}
      onClick={onClick}
      onActivate={onClick}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: accent
          ? "#1db954"
          : active
          ? "rgba(29, 185, 84, 0.25)"
          : focused
          ? "rgba(255,255,255,0.22)"
          : "rgba(255,255,255,0.08)",
        color: accent ? "#000" : active ? "#1db954" : "#fff",
        boxShadow: focused
          ? "0 0 0 2px #fff, 0 0 14px rgba(29, 185, 84, 0.8)"
          : accent
          ? "0 4px 16px rgba(29, 185, 84, 0.4)"
          : "none",
        transform: focused ? "scale(1.1)" : "scale(1)",
        transition: "box-shadow 0.1s ease, transform 0.1s ease",
        cursor: "pointer",
        position: "relative",
      }}
    >
      {children}
    </Focusable>
  );
}

export function InteractiveRow({
  children,
  onClick,
  onFocus,
  onBlur,
  active,
  style,
  tabIndex,
  onKeyDown,
  "data-deckify-list-item": dataDeckifyListItem,
  "data-deckify-label": dataDeckifyLabel,
  "aria-label": ariaLabel,
}: InteractiveRowProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      noFocusRing
      aria-label={ariaLabel}
      data-deckify-list-item={dataDeckifyListItem}
      data-deckify-label={dataDeckifyLabel}
      data-deckify-focused={focused ? "true" : undefined}
      onClick={onClick}
      onActivate={onClick}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      onGamepadFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onGamepadBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex ?? 0}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 8,
        background: active
          ? "rgba(29, 185, 84, 0.25)"
          : focused
          ? "rgba(255,255,255,0.18)"
          : "rgba(255,255,255,0.03)",
        cursor: "pointer",
        ...focusHalo(focused),
        ...style,
      }}
    >
      {children}
    </Focusable>
  );
}
