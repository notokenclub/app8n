import React from 'react';
export function TextBadge({children,tone='neutral'}){
  const tones={neutral:{bg:'var(--color-surface-strong)',fg:'var(--color-body)'},primary:{bg:'var(--color-primary-subtle)',fg:'var(--color-primary)'}};
  const t=tones[tone]||tones.neutral;
  return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:'var(--radius-sm)',background:t.bg,color:t.fg,fontSize:11,fontWeight:600,fontFamily:'var(--font-sans)'}}>{children}</span>;
}
