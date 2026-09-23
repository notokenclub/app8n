import React from 'react';
export function Divider({orientation='horizontal',tone='hairline',style}){
  const color=tone==='strong'?'var(--color-border-strong)':'var(--color-hairline)';
  return orientation==='horizontal'
    ? <div style={{height:1,width:'100%',background:color,...style}}/>
    : <div style={{width:1,height:'100%',background:color,...style}}/>;
}
