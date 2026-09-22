import React from 'react';

export function TopNav({logo='Zelleo',items=['Platform','Solutions','Docs','Pricing'],children}){
  return (<div style={{height:64,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 32px',background:'var(--color-canvas)',fontFamily:'var(--font-sans)',boxShadow:'inset 0 -1px 0 var(--color-hairline)'}}>
    <div style={{display:'flex',alignItems:'center',gap:40}}>
      <div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:18,color:'var(--color-ink)'}}>{logo}</div>
      <div style={{display:'flex',gap:28}}>{items.map(i=>(<span key={i} style={{fontSize:14,color:'var(--color-body)',cursor:'pointer'}}>{i}</span>))}</div>
    </div>
    <div style={{display:'flex',alignItems:'center',gap:16}}>{children}</div>
  </div>);
}

export function Footer({columns}){
  return (<div style={{background:'var(--color-canvas)',padding:'var(--space-section) 32px var(--space-xl)',fontFamily:'var(--font-sans)',color:'var(--color-body)'}}>
    <div style={{display:'grid',gridTemplateColumns:`repeat(${columns.length},1fr)`,gap:32,maxWidth:1280,margin:'0 auto'}}>
      {columns.map(c=>(<div key={c.title}><div style={{fontWeight:600,color:'var(--color-ink)',marginBottom:12,fontSize:14}}>{c.title}</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>{c.links.map(l=>(<span key={l} style={{fontSize:14,cursor:'pointer'}}>{l}</span>))}</div></div>))}
    </div>
  </div>);
}
