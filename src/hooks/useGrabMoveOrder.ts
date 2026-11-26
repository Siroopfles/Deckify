import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { GamepadButton } from "@decky/ui";
import { TrackItem } from "../types";

let rowKeySeq = 0;

/**
 * Assigns stable `_rowKey` identifiers to tracks so duplicate URIs remain
 * uniquely identifiable across controller Grab/Move swaps.
 */
export function assignStableRowKeys(items: TrackItem[], prefix: "q" | "pl"): TrackItem[] {
  return items.map((item) => {
    if (item._rowKey) return item;
    if (item.uid) return { ...item, _rowKey: `uid:${item.uid}` };
    rowKeySeq += 1;
    return { ...item, _rowKey: `${prefix}:${rowKeySeq}:${item.uri || item.id || "item"}` };
  });
}

function queryRowElement(rowKey: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(rowKey)
    : rowKey.replace(/"/g, '\\"');
  return document.querySelector(`[data-row-key="${escaped}"]`) as HTMLElement | null;
}

function scheduleRowFocus(rowKey: string): void {
  if (typeof requestAnimationFrame === "undefined") return;
  requestAnimationFrame(() => {
    queryRowElement(rowKey)?.focus?.();
  });
}

function scheduleRowScroll(rowKey: string): void {
  if (typeof requestAnimationFrame === "undefined") return;
  requestAnimationFrame(() => {
    queryRowElement(rowKey)?.scrollIntoView?.({ block: "nearest" });
  });
}

export interface DirectionEventLike {
  detail?: { button?: number };
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface UseGrabMoveOrderOptions {
  items: TrackItem[];
  setItems?: Dispatch<SetStateAction<TrackItem[]>>;
  onCommit?: (
    fromIndex: number,
    toIndex: number,
    nextItems: TrackItem[],
  ) => Promise<boolean> | boolean | void;
  onCancelToast?: () => void;
}

export interface UseGrabMoveOrderResult {
  grabbedKey: string | null;
  enterGrabMode: (rowKey: string) => void;
  moveGrabbed: (delta: -1 | 1) => void;
  commitGrab: () => Promise<void>;
  cancelGrab: () => boolean;
  handleGamepadDirection: (e: DirectionEventLike) => boolean;
}

function swapItems(items: TrackItem[], fromIdx: number, toIdx: number): TrackItem[] {
  const next = [...items];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

function isUpOrDown(btn: number | undefined): btn is number {
  return btn === GamepadButton.DIR_UP || btn === GamepadButton.DIR_DOWN;
}

export function useGrabMoveOrder({
  items,
  setItems,
  onCommit,
  onCancelToast,
}: UseGrabMoveOrderOptions): UseGrabMoveOrderResult {
  const [grabbedKey, setGrabbedKey] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const grabbedKeyRef = useRef<string | null>(grabbedKey);
  grabbedKeyRef.current = grabbedKey;
  const preGrabSnapshotRef = useRef<TrackItem[]>([]);
  const startGrabIndexRef = useRef<number>(-1);
  const busyRef = useRef<boolean>(false);
  const callbacksRef = useRef({ setItems, onCommit, onCancelToast });
  callbacksRef.current = { setItems, onCommit, onCancelToast };

  useEffect(() => {
    if (grabbedKeyRef.current && !items.some((item) => item._rowKey === grabbedKeyRef.current)) {
      grabbedKeyRef.current = null;
      startGrabIndexRef.current = -1;
      setGrabbedKey(null);
    }
  }, [items]);

  const enterGrabMode = useCallback((rowKey: string) => {
    if (busyRef.current || !rowKey) return;
    const current = itemsRef.current;
    const idx = current.findIndex((item) => item._rowKey === rowKey);
    if (idx < 0) return;

    preGrabSnapshotRef.current = [...current];
    startGrabIndexRef.current = idx;
    grabbedKeyRef.current = rowKey;
    setGrabbedKey(rowKey);
    scheduleRowFocus(rowKey);
  }, []);

  const moveGrabbed = useCallback((delta: -1 | 1) => {
    const key = grabbedKeyRef.current;
    if (!key || busyRef.current) return;
    const current = itemsRef.current;
    const curIdx = current.findIndex((item) => item._rowKey === key);
    if (curIdx < 0) return;
    const nextIdx = Math.max(0, Math.min(current.length - 1, curIdx + delta));
    if (nextIdx === curIdx) return;

    const next = swapItems(current, curIdx, nextIdx);
    itemsRef.current = next;
    callbacksRef.current.setItems?.(next);
    scheduleRowScroll(key);
    scheduleRowFocus(key);
  }, []);

  const commitGrab = useCallback(async () => {
    const key = grabbedKeyRef.current;
    if (!key || busyRef.current) return;
    const startIdx = startGrabIndexRef.current;
    const current = itemsRef.current;
    const endIdx = current.findIndex((item) => item._rowKey === key);
    grabbedKeyRef.current = null;
    startGrabIndexRef.current = -1;
    setGrabbedKey(null);
    const { onCommit: commitFn, setItems: setItemsFn } = callbacksRef.current;
    if (startIdx < 0 || endIdx < 0 || startIdx === endIdx || !commitFn) return;
    busyRef.current = true;
    try {
      if ((await commitFn(startIdx, endIdx, current)) === false) setItemsFn?.(preGrabSnapshotRef.current);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const cancelGrab = useCallback((): boolean => {
    if (!grabbedKeyRef.current) return false;
    callbacksRef.current.setItems?.(preGrabSnapshotRef.current);
    grabbedKeyRef.current = null;
    startGrabIndexRef.current = -1;
    setGrabbedKey(null);
    callbacksRef.current.onCancelToast?.();
    return true;
  }, []);

  const handleGamepadDirection = useCallback((e: DirectionEventLike): boolean => {
    if (!grabbedKeyRef.current || !isUpOrDown(e?.detail?.button)) return false;
    e.preventDefault?.();
    e.stopPropagation?.();
    moveGrabbed(e.detail?.button === GamepadButton.DIR_UP ? -1 : 1);
    return true;
  }, [moveGrabbed]);

  return { grabbedKey, enterGrabMode, moveGrabbed, commitGrab, cancelGrab, handleGamepadDirection };
}
