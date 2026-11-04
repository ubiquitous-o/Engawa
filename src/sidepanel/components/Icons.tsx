import type { JSX } from 'preact';

type P = JSX.SVGAttributes<SVGSVGElement>;
const base = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const Chevron = (p: P) => (
  <svg {...base} {...p} class={`chev ${p.class ?? ''}`}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);
export const Search = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...base} {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 3v10M3 8h10" />
  </svg>
);
export const Refresh = (p: P) => (
  <svg {...base} {...p}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6" />
    <path d="M13 2.5v3h-3" />
  </svg>
);
export const Folder = (p: P) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
    <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h3.2c.4 0 .8.16 1.06.44L8.5 4.2H13A1.5 1.5 0 0 1 14.5 5.7v6.8A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5V4Z" opacity=".9" />
  </svg>
);
export const Pin = (p: P) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
    <path d="M9.5 1.5 14.5 6.5l-1.3.5-.9-.2-3 3 .3 2.4-1 .9L5.7 10.2 2.5 13.4l-.9-.9L4.8 9.3 1.9 6.4l.9-1 2.4.3 3-3-.2-.9z" />
  </svg>
);
export const Audio = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5z" />
    <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" />
  </svg>
);
export const Muted = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5z" />
    <path d="m10.5 6 3 4M13.5 6l-3 4" />
  </svg>
);
export const Gear = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2" />
  </svg>
);
export const Star = (p: P) => (
  <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
    <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
  </svg>
);
export const PullRequest = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="4" cy="3.5" r="1.6" />
    <circle cx="4" cy="12.5" r="1.6" />
    <circle cx="12" cy="12.5" r="1.6" />
    <path d="M4 5.1v5.8M12 10.9V7a2 2 0 0 0-2-2H8.5M10 3 8.5 5 10 7" />
  </svg>
);
