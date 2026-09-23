import React from 'react';

const base={fontFamily:'var(--font-sans)',fontSize:'var(--text-button-size)',fontWeight:'var(--text-button-weight)',lineHeight:'var(--text-button-lh)',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background-color .12s ease,border-color .12s ease,transform .08s ease'};

const sizes={
  md:{padding:'16px 24px',borderRadius:'var(--radius-lg)'},
  sm:{padding:'10px 16px',borderRadius:'var(--radius-md)',fontSize:14},
};

const variants={
  primary:{background:'var(--color-primary)',color:'var(--color-on-primary)',boxShadow:'var(--shadow-button-rest)'},
  'primary-active':{background:'var(--color-primary-active)',color:'var(--color-on-primary)'},
  secondary:{background:'var(--color-canvas)',color:'var(--color-ink)',boxShadow:'inset 0 0 0 1px var(--color-hairline)'},
  'secondary-on-dark':{background:'var(--color-canvas)',color:'var(--color-ink)',boxShadow:'inset 0 0 0 1px var(--color-hairline)'},
  ghost:{background:'transparent',color:'var(--color-ink)'},
  legal:{background:'var(--color-link)',color:'var(--color-on-primary)',fontSize:'var(--text-legal-size)',fontWeight:'var(--text-legal-weight)',borderRadius:'var(--radius-xs)',padding:'12px 10px'},
  pill:{background:'var(--color-primary)',color:'var(--color-on-primary)',borderRadius:'var(--radius-pill)',padding:'12px 24px'},
};

export function Button({variant='primary',size='md',disabled=false,icon=null,children,...rest}){
  const v=variants[variant]||variants.primary;
  const s=variant==='legal'||variant==='pill'?{}:(sizes[size]||sizes.md);
  const style={...base,...s,...v,opacity:disabled?0.45:1,cursor:disabled?'not-allowed':'pointer'};
  return <button style={style} disabled={disabled} {...rest}>{icon}{children}</button>;
}
