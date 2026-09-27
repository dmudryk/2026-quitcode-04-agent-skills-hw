"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_MS = 5_000;

// While n8n prepares the quote, re-render the status page every few seconds.
// The page stops rendering this component once the status is final.
export function QuoteStatusRefresher() {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
