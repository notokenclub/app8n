import React from 'react';

export function IconButton({icon,size=40,variant='circular',selected=false,disabled=false,...rest}){
  const style={
    width:size,height:size,borderRadius:variant==='circular'?'var(--radius-full)':'var(--radius-md)',
    background:selected?'var(--color-primary-subtle)':'var(--color-canvas)',
    color:selected?'var(--color-primary)':'var(--color-ink)',
    boxShadow:'inset 0 0 0 1px var(--color-hairline)',
    border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:disabled?'not-allowed':'pointer',
    opacity:disabled?0.4:1,
  };
  return <button style={style} disabled={disabled} {...rest}>{icon}</button>;
}
