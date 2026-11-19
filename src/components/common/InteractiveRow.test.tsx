import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
}));

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

let stateValues: any[] = [];
let stateIdx = 0;

vi.mock("react", () => ({
  useState: (init: any) => {
    const idx = stateIdx++;
    if (!(idx in stateValues)) {
      stateValues[idx] = typeof init === "function" ? init() : init;
    }
    const setState = (val: any) => {
      stateValues[idx] = typeof val === "function" ? val(stateValues[idx]) : val;
    };
    return [stateValues[idx], setState];
  },
}));

import { InteractiveRow } from "./InteractiveRow";

function renderRow(props: Partial<Parameters<typeof InteractiveRow>[0]> = {}) {
  stateIdx = 0;
  return InteractiveRow({
    children: "Row Content",
    onClick: vi.fn(),
    ...props,
  }) as any;
}

describe("InteractiveRow", () => {
  beforeEach(() => {
    stateValues = [];
    stateIdx = 0;
  });

  it("renders Focusable with tabIndex={0} by default and preserves explicit tabIndex", () => {
    const defaultTree = renderRow();
    expect(defaultTree.props.tabIndex).toBe(0);

    const explicitTree = renderRow({ tabIndex: -1 });
    expect(explicitTree.props.tabIndex).toBe(-1);
  });

  it("sets data-deckify-focused='true' on focus/gamepadFocus and clears it on blur/gamepadBlur", () => {
    let tree = renderRow();
    expect(tree.props["data-deckify-focused"]).toBeUndefined();

    // Standard DOM focus -> data-deckify-focused="true"
    tree.props.onFocus();
    tree = renderRow();
    expect(tree.props["data-deckify-focused"]).toBe("true");

    // Standard DOM blur -> undefined
    tree.props.onBlur();
    tree = renderRow();
    expect(tree.props["data-deckify-focused"]).toBeUndefined();

    // GamepadUI virtual focus -> data-deckify-focused="true"
    tree.props.onGamepadFocus();
    tree = renderRow();
    expect(tree.props["data-deckify-focused"]).toBe("true");

    // GamepadUI virtual blur -> undefined
    tree.props.onGamepadBlur();
    tree = renderRow();
    expect(tree.props["data-deckify-focused"]).toBeUndefined();
  });

  it("forwards aria-label to Focusable when set and omits it when not provided", () => {
    const omittedTree = renderRow();
    expect(omittedTree.props["aria-label"]).toBeUndefined();

    const labeledTree = renderRow({ "aria-label": "Increase 31 Hz" });
    expect(labeledTree.props["aria-label"]).toBe("Increase 31 Hz");
  });
});
