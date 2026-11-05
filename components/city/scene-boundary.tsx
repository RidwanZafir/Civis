"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a WebGL failure local. If the 3D scene cannot start on a machine
 * (no WebGL, lost context, driver crash), the rest of the page — headline,
 * statistics, reports, navigation — must keep working instead of the error
 * bubbling up to the route boundary and replacing the whole document.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[civis:scene] 3D scene disabled after an error:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(80%_70%_at_50%_30%,#0d1726,#080d17)] px-6 text-center">
            <div>
              <p className="text-[12.5px] font-semibold text-fg">3D city unavailable on this device</p>
              <p className="mt-1 text-[11.5px] text-muted">
                The incident map and every report still work — open Explore for the 2D view.
              </p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
