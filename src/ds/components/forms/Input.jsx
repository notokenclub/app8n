import React from 'react';

export function Input({label,placeholder,focused=false,error=false,icon=null,...rest}){
  const wrap={display:'flex',flexDirection:'column',gap:6,fontFamily:'var(--font-sans)'};
  const labelStyle={fontSize:13,fontWeight:500,color:'var(--color-body)'};
  const box={
    display:'flex',alignItems:'center',gap:8,height:44,padding:'0 16px',borderRadius:'var(--radius-sm)',
    background:'var(--color-canvas)',color:'var(--color-ink)',fontSize:14,
    boxShadow:focused?'inset 0 0 0 1.5px var(--color-primary)':error?'inset 0 0 0 1.5px var(--color-danger)':'inset 0 0 0 1px var(--color-hairline)',
  };
  return (<div style={wrap}>
    {label&&<label style={labelStyle}>{label}</label>}
    <div style={box}>{icon}<input placeholder={placeholder} style={{border:'none',outline:'none',flex:1,fontSize:14,fontFamily:'var(--font-sans)',background:'transparent',color:'var(--color-ink)'}} {...rest}/></div>
  </div>);
}
