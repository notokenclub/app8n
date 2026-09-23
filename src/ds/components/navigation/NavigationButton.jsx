import React from 'react';

export function NavigationButton({icon,label,active=false,onClick}){
  return (<button onClick={onClick} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:'var(--radius-sm)',border:'none',background:active?'var(--color-primary-subtle)':'transparent',color:active?'var(--color-primary)':'var(--color-body)',fontSize:14,fontWeight:active?600:400,fontFamily:'var(--font-sans)',cursor:'pointer',width:'100%',textAlign:'left'}}>
    {icon}{label}
  </button>);
}

export function LinkItem({label,active=false,onClick}){
  return (<div onClick={onClick} style={{fontSize:14,fontFamily:'var(--font-sans)',color:active?'var(--color-ink)':'var(--color-body)',fontWeight:active?600:400,cursor:'pointer',padding:'4px 0'}}>{label}</div>);
}
