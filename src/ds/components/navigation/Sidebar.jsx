import React from 'react';

export function Sidebar({items,active,onSelect,logo='Zelleo'}){
  return (<div style={{width:220,height:'100%',background:'var(--color-surface-dark)',color:'var(--color-on-dark)',display:'flex',flexDirection:'column',fontFamily:'var(--font-sans)',padding:'20px 12px'}}>
    <div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:16,padding:'0 12px 20px',color:'#fff'}}>{logo}</div>
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {items.map((it,i)=>(<div key={it.label} onClick={()=>onSelect&&onSelect(i)} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:'var(--radius-sm)',fontSize:14,cursor:'pointer',background:i===active?'var(--color-primary)':'transparent',color:i===active?'#fff':'rgba(255,255,255,0.75)'}}>{it.icon}{it.label}</div>))}
    </div>
  </div>);
}
