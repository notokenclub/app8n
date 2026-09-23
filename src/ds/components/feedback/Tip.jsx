import React from 'react';

export function Tip({children,IconComponent}){
  return (<div style={{display:'flex',gap:10,alignItems:'flex-start',fontFamily:'var(--font-sans)',fontSize:13,color:'var(--color-muted)'}}>
    {IconComponent&&<IconComponent name="MagicWand" size={16}/>}
    <span style={{lineHeight:1.5}}>{children}</span>
  </div>);
}

export function Shortcut({keys=[]}){
  return (<span style={{display:'inline-flex',gap:4}}>
    {keys.map((k,i)=>(<kbd key={i} style={{fontFamily:'var(--font-mono)',fontSize:11,background:'var(--color-surface-strong)',color:'var(--color-ink)',borderRadius:4,padding:'2px 6px',boxShadow:'inset 0 -1px 0 var(--color-border-strong)'}}>{k}</kbd>))}
  </span>);
}
