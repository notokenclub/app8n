import React from 'react';

export function DemoGridCard({title,tint='canvas',children,height=180}){
  const tints={canvas:'var(--color-canvas)',sand:'var(--color-signature-sand)',soft:'var(--color-surface-soft)'};
  return (<div style={{background:tints[tint]||tints.canvas,borderRadius:'var(--radius-md)',padding:'var(--space-md)',display:'flex',flexDirection:'column',gap:8,height,boxShadow:tint==='canvas'?'inset 0 0 0 1px var(--color-hairline)':'none',fontFamily:'var(--font-sans)'}}>
    {title&&<div style={{fontSize:'var(--text-label-md-size)',fontWeight:'var(--text-label-md-weight)',color:'var(--color-ink)'}}>{title}</div>}
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-muted)',fontSize:13}}>{children}</div>
  </div>);
}

export function FeatureCardTabbed({tabs,active,onTabChange,children}){
  return (<div style={{background:'var(--color-surface-soft)',borderRadius:'var(--radius-lg)',padding:'var(--space-xl)',display:'flex',gap:32,fontFamily:'var(--font-sans)'}}>
    <div style={{display:'flex',flexDirection:'column',gap:16,minWidth:160}}>
      {tabs.map((t,i)=>(<div key={t} onClick={()=>onTabChange&&onTabChange(i)} style={{fontSize:'var(--text-title-md-size)',fontWeight:i===active?600:400,color:i===active?'var(--color-ink)':'var(--color-muted)',cursor:'pointer'}}>{t}</div>))}
    </div>
    <div style={{flex:1,color:'var(--color-body)',fontSize:14,lineHeight:1.6}}>{children}</div>
  </div>);
}
