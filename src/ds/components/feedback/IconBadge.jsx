import React from 'react';
const intents={neutral:{bg:'var(--color-surface-strong)',fg:'var(--color-ink)'},primary:{bg:'var(--color-primary-subtle)',fg:'var(--color-primary)'},success:{bg:'#E9F5EA',fg:'var(--color-success)'},danger:{bg:'#FBEAE4',fg:'var(--color-danger)'}};
export function IconBadge({icon,intent='neutral',size=24}){
  const t=intents[intent]||intents.neutral;
  return <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:size,height:size,borderRadius:'50%',background:t.bg,color:t.fg}}>{icon}</span>;
}
