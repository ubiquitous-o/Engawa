import type { ComponentChildren } from 'preact';
import { Chevron } from './Icons';

interface Props {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ComponentChildren;
  meta?: ComponentChildren;
  children: ComponentChildren;
}

export function Section({ title, count, collapsed, onToggle, actions, meta, children }: Props) {
  return (
    <section class={`section ${collapsed ? 'collapsed' : ''}`}>
      <div class="section-head">
        <button class="section-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <Chevron />
          <span>{title}</span>
          {count !== undefined && <span class="section-count">{count}</span>}
          {meta && <span class="pr-meta" style="margin-left:auto">{meta}</span>}
        </button>
        {actions && <div class="section-actions">{actions}</div>}
      </div>
      <div class="section-body">
        <div>{children}</div>
      </div>
    </section>
  );
}
