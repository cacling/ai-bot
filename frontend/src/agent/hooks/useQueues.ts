/**
 * useQueues.ts — Shared hook to fetch and cache routing queues.
 *
 * Used by ConversationHeader, TransferQueueDialog, and InboxFilters.
 */
import { useEffect, useState } from 'react';

export interface Queue {
  queue_code: string;
  display_name_zh: string;
  display_name_en: string;
  domain_scope: string;
  priority: number;
}

const INTERACTION_PLATFORM_URL = '/ix-api';

let cachedQueues: Queue[] | null = null;
let fetchPromise: Promise<Queue[]> | null = null;

async function doFetch(): Promise<Queue[]> {
  const res = await fetch(`${INTERACTION_PLATFORM_URL}/api/queues`);
  const data = await res.json();
  return data.items ?? data ?? [];
}

export function useQueues(): Queue[] {
  const [queues, setQueues] = useState<Queue[]>(cachedQueues ?? []);

  useEffect(() => {
    if (cachedQueues) {
      setQueues(cachedQueues);
      return;
    }
    if (!fetchPromise) {
      fetchPromise = doFetch();
    }
    fetchPromise.then((result) => {
      cachedQueues = result;
      setQueues(result);
    }).catch(() => setQueues([]));
  }, []);

  return queues;
}

/** Resolve a queue_code to its display name. */
export function getQueueName(queues: Queue[], code: string | null, lang: 'zh' | 'en'): string {
  if (!code) return '';
  const q = queues.find((q) => q.queue_code === code);
  return q ? (lang === 'zh' ? q.display_name_zh : q.display_name_en) : code;
}
