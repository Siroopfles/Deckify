export interface ListJumpResult {
  targetIndex: number;
  badge: string;
  shouldLoadMore: boolean;
}

function getAnchor(label: string): string {
  const ch = (label || "").trim().charAt(0).toUpperCase();
  if (ch && /^[A-Z0-9]$/.test(ch)) {
    return ch;
  }
  return "#";
}

/**
 * Computes the next list row index, floating pill badge, and pagination trigger
 * for L2 (-1) / R2 (+1) fast-paging across Deckify list views.
 */
export function computeListJump(
  labels: string[],
  currentIndex: number,
  direction: -1 | 1,
  pageSize: number,
  sortedAz: boolean
): ListJumpResult | null {
  const length = labels.length;
  if (length === 0) return null;

  const safeIndex = Math.min(length - 1, Math.max(0, currentIndex < 0 ? 0 : currentIndex));
  const shouldLoadMore = direction === 1 && safeIndex === length - 1;

  if (length === 1) {
    return {
      targetIndex: 0,
      badge: sortedAz ? getAnchor(labels[0]) : "1 / 1",
      shouldLoadMore,
    };
  }

  if (sortedAz) {
    const currentAnchor = getAnchor(labels[safeIndex]);
    let targetIndex: number;

    if (direction === 1) {
      let found = -1;
      for (let i = safeIndex + 1; i < length; i++) {
        if (getAnchor(labels[i]) !== currentAnchor) {
          found = i;
          break;
        }
      }
      targetIndex = found !== -1 ? found : length - 1;
    } else {
      let prevGroupEnd = -1;
      for (let i = safeIndex - 1; i >= 0; i--) {
        if (getAnchor(labels[i]) !== currentAnchor) {
          prevGroupEnd = i;
          break;
        }
      }
      if (prevGroupEnd === -1) {
        targetIndex = 0;
      } else {
        const prevAnchor = getAnchor(labels[prevGroupEnd]);
        let groupStart = prevGroupEnd;
        while (groupStart > 0 && getAnchor(labels[groupStart - 1]) === prevAnchor) {
          groupStart--;
        }
        targetIndex = groupStart;
      }
    }

    return {
      targetIndex,
      badge: getAnchor(labels[targetIndex]),
      shouldLoadMore,
    };
  }

  const effectivePageSize = Math.max(1, pageSize);
  let targetIndex: number;
  if (length <= effectivePageSize) {
    targetIndex = direction === 1 ? length - 1 : 0;
  } else {
    targetIndex = Math.min(length - 1, Math.max(0, safeIndex + direction * effectivePageSize));
  }

  return {
    targetIndex,
    badge: `${targetIndex + 1} / ${length}`,
    shouldLoadMore,
  };
}
