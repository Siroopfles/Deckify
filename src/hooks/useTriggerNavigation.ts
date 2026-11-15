import { useEffect, useRef } from "react";
import { TriggerController, TriggerSide } from "../utils/triggerController";

export type ModalButtonAction = "L1" | "R1" | "X" | "Y";

export interface UseTriggerNavigationOptions {
  enabled: boolean;
  suppressed: boolean;
  onTrigger: (side: TriggerSide) => void;
  onAction: (action: ModalButtonAction, e?: any) => void;
}

export const ACTION_DEDUP_MS = 80;

function isTextInputFocused(): boolean {
  if (typeof document === "undefined") return false;
  const activeTag = (document.activeElement as HTMLElement | null)?.tagName?.toUpperCase();
  return activeTag === "INPUT" || activeTag === "TEXTAREA";
}

/**
 * Modal-scoped controller navigation hook.
 * Subscribes to FocusNavController.m_rgGamepadInputSources[0], a guarded
 * navigator.getGamepads() rAF polling loop, and window vgp_onbuttondown/keydown
 * fallbacks with 80ms per-action deduplication.
 * All listeners and rAF loops are strictly cleaned up on unmount.
 */
export function useTriggerNavigation({
  enabled,
  suppressed,
  onTrigger,
  onAction,
}: UseTriggerNavigationOptions): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const suppressedRef = useRef(suppressed);
  suppressedRef.current = suppressed;

  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const lastActionTimeRef = useRef<Record<ModalButtonAction, number>>({
    L1: -Infinity,
    R1: -Infinity,
    X: -Infinity,
    Y: -Infinity,
  });

  useEffect(() => {
    let active = true;
    const controller = new TriggerController();
    const unregisters: Array<(() => void) | { Unregister?: () => void } | undefined> = [];
    let rafId: number | null = null;

    const isTriggerActive = (): boolean =>
      active && enabledRef.current && !suppressedRef.current && !isTextInputFocused();

    const dispatchAction = (action: ModalButtonAction, e?: any) => {
      if (!active || !enabledRef.current || suppressedRef.current || isTextInputFocused()) return;
      const now = Date.now();
      if (now - lastActionTimeRef.current[action] < ACTION_DEDUP_MS) {
        return;
      }
      lastActionTimeRef.current[action] = now;
      onActionRef.current(action, e);
    };

    const handleTriggerValue = (side: TriggerSide, value: number) => {
      if (!isTriggerActive()) {
        controller.reset();
        return;
      }
      if (controller.processTrigger(side, value, Date.now())) {
        onTriggerRef.current(side);
      }
    };

    // 1. FocusNavController primary gamepad input source
    const win = typeof window !== "undefined" ? (window as any) : undefined;
    const src = win?.FocusNavController?.m_rgGamepadInputSources?.[0];
    if (src?.RegisterForGamepadButtonDown) {
      const unsubDown = src.RegisterForGamepadButtonDown((btn: number) => {
        if (btn === 3) dispatchAction("X");
        else if (btn === 4) dispatchAction("Y");
        else if (btn === 5) dispatchAction("L1");
        else if (btn === 6) dispatchAction("R1");
        else if (btn === 7) handleTriggerValue("L2", 1.0);
        else if (btn === 8) handleTriggerValue("R2", 1.0);
      });
      unregisters.push(unsubDown);
    }
    if (src?.RegisterForGamepadButtonUp) {
      const unsubUp = src.RegisterForGamepadButtonUp((btn: number) => {
        if (btn === 7) controller.processTrigger("L2", 0.0, Date.now());
        else if (btn === 8) controller.processTrigger("R2", 0.0, Date.now());
      });
      unregisters.push(unsubUp);
    }

    // 2. Guarded navigator.getGamepads() analog trigger rAF polling loop
    const hasGamepadsApi =
      typeof navigator !== "undefined" && typeof navigator.getGamepads === "function";

    const pollGamepads = () => {
      if (!active) return;
      if (isTriggerActive() && hasGamepadsApi) {
        try {
          const gamepads = navigator.getGamepads();
          if (gamepads) {
            const now = Date.now();
            for (let i = 0; i < gamepads.length; i++) {
              const gp = gamepads[i];
              if (!gp || !gp.connected) continue;
              const l2Val = gp.buttons?.[6]?.value ?? 0;
              const r2Val = gp.buttons?.[7]?.value ?? 0;
              if (controller.processTrigger("L2", l2Val, now)) {
                onTriggerRef.current("L2");
              }
              if (controller.processTrigger("R2", r2Val, now)) {
                onTriggerRef.current("R2");
              }
            }
          }
        } catch {
          // Ignore transient gamepad API errors in restricted CEF contexts
        }
      } else if (!isTriggerActive()) {
        controller.reset();
      }

      if (active && typeof requestAnimationFrame === "function") {
        rafId = requestAnimationFrame(pollGamepads);
      }
    };

    if (hasGamepadsApi && typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(pollGamepads);
    }

    // 3. Window vgp_onbuttondown & keydown fallbacks (deduped via dispatchAction)
    const handleVgpButton = (e: any) => {
      const btn = e?.detail?.button ?? e?.detail ?? e?.button;
      if (btn === "L1" || btn === "LB" || btn === 5 || btn === "BUMPER_LEFT" || btn === "BUTTON_LEFT_BUMPER") {
        dispatchAction("L1", e);
      } else if (btn === "R1" || btn === "RB" || btn === 6 || btn === "BUMPER_RIGHT" || btn === "BUTTON_RIGHT_BUMPER") {
        dispatchAction("R1", e);
      } else if (btn === "Y" || btn === "y" || btn === 4 || btn === "OPTIONS" || btn === "BUTTON_Y") {
        dispatchAction("Y", e);
      } else if (btn === "X" || btn === "x" || btn === 3 || btn === "SECONDARY" || btn === "BUTTON_X") {
        dispatchAction("X", e);
      } else if (btn === 7 || btn === "L2" || btn === "TRIGGER_LEFT") {
        handleTriggerValue("L2", 1.0);
      } else if (btn === 8 || btn === "R2" || btn === "TRIGGER_RIGHT") {
        handleTriggerValue("R2", 1.0);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!active || !enabledRef.current || isTextInputFocused()) return;
      if (e.key === "PageUp" || e.key === "[" || (e as any).code === "GamepadBumperLeft") {
        dispatchAction("L1", e);
      } else if (e.key === "PageDown" || e.key === "]" || (e as any).code === "GamepadBumperRight") {
        dispatchAction("R1", e);
      } else if (e.key === "y" || e.key === "Y") {
        dispatchAction("Y", e);
      } else if (e.key === "x" || e.key === "X") {
        dispatchAction("X", e);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("vgp_onbuttondown", handleVgpButton);
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      active = false;
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      for (const unsub of unregisters) {
        if (typeof unsub === "function") {
          unsub();
        } else if (unsub && typeof unsub.Unregister === "function") {
          unsub.Unregister();
        }
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("vgp_onbuttondown", handleVgpButton);
        window.removeEventListener("keydown", handleKeyDown);
      }
      controller.reset();
    };
  }, []);
}
