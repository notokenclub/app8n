import React from 'react';
export function Tabs({tabs,active,onChange}){
  return (<div style={{display:'flex',gap:4,borderBottom:'1px solid var(--color-hairline)',fontFamily:'var(--font-sans)'}}>
    {tabs.map((t,i)=>(<div key={t} onClick={()=>onChange&&onChange(i)} style={{padding:'10px 14px',fontSize:14,fontWeight:i===active?600:400,color:i===active?'var(--color-ink)':'var(--color-muted)',borderBottom:i===active?'2px solid var(--color-primary)':'2px solid transparent',cursor:'pointer',marginBottom:-1}}>{t}</div>))}
  </div>);
}
