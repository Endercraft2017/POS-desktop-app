import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/use-theme";
import { useSettingsStore } from "../../stores/settings-store";

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({
  text,
  children,
  position = "top",
  delay = 400,
}: TooltipProps) {
  const { colors, spacing, borderRadius, fontSize } = useTheme();
  const tooltipsEnabled = useSettingsStore((s) => s.tooltipsEnabled);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (!tooltipsEnabled) return;
    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  };

  useEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tw = tooltipEl?.offsetWidth ?? 100;
    const th = tooltipEl?.offsetHeight ?? 30;

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top - th - 8;
        left = rect.left + rect.width / 2 - tw / 2;
        break;
      case "bottom":
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - tw / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - th / 2;
        left = rect.left - tw - 8;
        break;
      case "right":
        top = rect.top + rect.height / 2 - th / 2;
        left = rect.right + 8;
        break;
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - th - 8));

    setCoords({ top, left });
  }, [visible, position]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: "inline-flex" }}
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
            backgroundColor: colors.textPrimary,
            color: colors.background,
            padding: `${spacing.xs}px ${spacing.sm}px`,
            borderRadius: borderRadius.sm,
            fontSize: fontSize.xs,
            fontWeight: 500,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            opacity: 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}
