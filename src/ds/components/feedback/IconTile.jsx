import React from 'react';

const appearances={
  ember:{bg:'var(--color-primary-subtle)',fg:'var(--color-primary)'},
  charcoal:{bg:'var(--color-surface-dark)',fg:'#fff'},
  neutral:{bg:'var(--color-surface-strong)',fg:'var(--color-ink)'},
};

export function IconTile({icon,appearance='ember',size=40}){
  const a=appearances[appearance]||appearances.ember;
  return <div style={{width:size,height:size,borderRadius:'var(--radius-md)',background:a.bg,color:a.fg,display:'flex',alignItems:'center',justifyContent:'center'}}>{icon}</div>;
}
