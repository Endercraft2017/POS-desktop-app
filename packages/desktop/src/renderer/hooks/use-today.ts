import { useEffect, useState } from "react";

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function msUntilNextLocalMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 100);
  return next.getTime() - now.getTime();
}

// Returns the current local YYYY-MM-DD and re-renders the caller when the
// local day rolls over, so time-sensitive query keys like
// ["today-stats", today] auto-invalidate at midnight.
export function useToday(): string {
  const [today, setToday] = useState(todayStr);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setToday(todayStr());
        schedule();
      }, msUntilNextLocalMidnight());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return today;
}
