const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconHome = () => (
  <svg viewBox="0 0 24 24" {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IconBody = () => (
  <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="4.5" r="2.5" /><path d="M5 9h14M12 9v5m0 0-3 7m3-7 3 7" /></svg>
);
export const IconChart = () => (
  <svg viewBox="0 0 24 24" {...p}><path d="M3 20h18M5 16l4-5 4 3 6-8" /></svg>
);
export const IconHistory = () => (
  <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IconSettings = () => (
  <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IconCheck = () => (
  <svg viewBox="0 0 24 24" {...p} strokeWidth={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const IconMore = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" {...p}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 24 24" {...p}><path d="M15 5l-7 7 7 7" /></svg>
);
