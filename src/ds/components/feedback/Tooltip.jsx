import React from 'react';

export function Tooltip({label,children,position='top'}){
  const [show,setShow]=React.useState(false);
  const pos={top:{bottom:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)'},bottom:{top:'calc(100% + 8px)',left:'50%',transform:'translateX(-50%)'}}[position]||{};
  return (<span style={{position:'relative',display:'inline-block'}} onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)}>
    {children}
    {show&&<span style={{position:'absolute',...pos,background:'var(--color-surface-dark)',color:'#fff',fontSize:12,fontWeight:500,padding:'6px 10px',borderRadius:'var(--radius-sm)',whiteSpace:'nowrap',fontFamily:'var(--font-sans)',zIndex:10}}>{label}</span>}
  </span>);
}
