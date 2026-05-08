"use client";

import * as React from "react";

export function useCountdown(endAt: number | null) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!endAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [endAt]);

  if (!endAt) return { secondsLeft: 0, progress: 0, urgent: false };

  const total = Math.max(1, Math.round((endAt - now) / 1000) + 1);
  const secondsLeft = Math.max(0, Math.ceil((endAt - now) / 1000));
  const progress = Math.max(0, Math.min(100, (secondsLeft / total) * 100));
  return { secondsLeft, progress, urgent: secondsLeft <= 10 };
}
