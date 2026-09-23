import React from 'react';

const tones={
  neutral:{bg:'var(--color-surface-strong)',fg:'var(--color-body)'},
  primary:{bg:'var(--color-primary-subtle)',fg:'var(--color-primary)'},
  success:{bg:'#E9F5EA',fg:'var(--color-success)'},
  danger:{bg:'#FBEAE4',fg:'var(--color-danger)'},
};

export function Badge({children,tone='neutral',bold=false}){
  const t=tones[tone]||tones.neutral;
  return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:'var(--radius-pill)',fontSize:12,fontWeight:bold?700:500,background:t.bg,color:t.fg,fontFamily:'var(--font-sans)'}}>{children}</span>;
}

export function StatusBadge({status='running'}){
  const map={running:{tone:'success',label:'Running'},paused:{tone:'neutral',label:'Paused'},error:{tone:'danger',label:'Error'},scaling:{tone:'primary',label:'Scaling'}};
  const m=map[status]||map.running;
  return (<span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600,fontFamily:'var(--font-sans)',color:tones[m.tone].fg}}>
    <span style={{width:6,height:6,borderRadius:'50%',background:tones[m.tone].fg}}/>{m.label}
  </span>);
}
