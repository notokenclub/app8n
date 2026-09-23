import React from 'react';
export function MetricCard({label,value,delta,unit=''}){
  const up=delta&&delta.startsWith('+');
  return (<div style={{background:'var(--color-canvas)',borderRadius:'var(--radius-md)',padding:'var(--space-md)',boxShadow:'inset 0 0 0 1px var(--color-hairline)',fontFamily:'var(--font-sans)',display:'flex',flexDirection:'column',gap:6}}>
    <div style={{fontSize:12,color:'var(--color-muted)',fontWeight:500}}>{label}</div>
    <div style={{display:'flex',alignItems:'baseline',gap:6}}>
      <span style={{fontFamily:'var(--font-display)',fontSize:28,fontWeight:600,color:'var(--color-ink)'}}>{value}</span>
      {unit&&<span style={{fontSize:13,color:'var(--color-muted)'}}>{unit}</span>}
    </div>
    {delta&&<div style={{fontSize:12,fontWeight:600,color:up?'var(--color-success)':'var(--color-danger)'}}>{delta}</div>}
  </div>);
}
