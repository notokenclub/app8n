import React from 'react';
export function NumberBadge({count,tone='neutral',max=99}){
  const tones={neutral:'var(--color-surface-strong)',primary:'var(--color-primary)'};
  const fg={neutral:'var(--color-ink)',primary:'#fff'};
  const display=count>max?`${max}+`:count;
  return <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:18,height:18,padding:'0 5px',borderRadius:'var(--radius-pill)',background:tones[tone],color:fg[tone],fontSize:11,fontWeight:700,fontFamily:'var(--font-sans)'}}>{display}</span>;
}
