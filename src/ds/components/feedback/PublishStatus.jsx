import React from 'react';
const statuses={draft:{bg:'var(--color-surface-strong)',fg:'var(--color-muted)',label:'Draft'},review:{bg:'#FFF6E0',fg:'#8A5A00',label:'In review'},published:{bg:'#E9F5EA',fg:'var(--color-success)',label:'Published'},deprecated:{bg:'#FBEAE4',fg:'var(--color-danger)',label:'Deprecated'}};
export function PublishStatus({status='draft'}){
  const s=statuses[status]||statuses.draft;
  return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:'var(--radius-pill)',fontSize:12,fontWeight:600,background:s.bg,color:s.fg,fontFamily:'var(--font-sans)'}}>{s.label}</span>;
}
