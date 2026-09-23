import React from 'react';

const surfaceBg={ember:'var(--color-signature-ember)',charcoal:'var(--color-signature-charcoal)',sand:'var(--color-signature-sand)'};
const surfaceFg={ember:'var(--color-on-primary)',charcoal:'var(--color-on-dark)',sand:'var(--color-ink)'};

export function SignatureCard({surface='ember',eyebrow,title,body,children}){
  return (<div style={{background:surfaceBg[surface],color:surfaceFg[surface],borderRadius:'var(--radius-lg)',padding:'var(--space-xxl)',display:'flex',flexDirection:'column',gap:16,fontFamily:'var(--font-sans)'}}>
    {eyebrow&&<div style={{fontSize:13,fontWeight:600,letterSpacing:0.3,opacity:0.75,textTransform:'uppercase'}}>{eyebrow}</div>}
    {title&&<div style={{fontFamily:'var(--font-display)',fontSize:'var(--text-display-md-size)',fontWeight:'var(--text-display-md-weight)',lineHeight:'var(--text-display-md-lh)'}}>{title}</div>}
    {body&&<div style={{fontSize:14,lineHeight:1.6,opacity:0.9,maxWidth:520}}>{body}</div>}
    {children}
  </div>);
}

export function CalloutCard({title,body,children}){
  return (<div style={{background:'var(--color-signature-sand)',color:'var(--color-ink)',borderRadius:'var(--radius-md)',padding:'var(--space-lg)',display:'flex',flexDirection:'column',gap:10,fontFamily:'var(--font-sans)'}}>
    {title&&<div style={{fontSize:'var(--text-title-lg-size)',fontWeight:'var(--text-title-lg-weight)'}}>{title}</div>}
    {body&&<div style={{fontSize:14,lineHeight:1.6,color:'var(--color-body)'}}>{body}</div>}
    {children}
  </div>);
}

export function CtaBand({title,children}){
  return (<div style={{background:'var(--color-surface-strong)',color:'var(--color-ink)',borderRadius:'var(--radius-lg)',padding:'var(--space-xxl)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:24,fontFamily:'var(--font-sans)',flexWrap:'wrap'}}>
    <div style={{fontFamily:'var(--font-display)',fontSize:'var(--text-display-md-size)',fontWeight:'var(--text-display-md-weight)'}}>{title}</div>
    {children}
  </div>);
}
