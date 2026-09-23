import React from 'react';

export function Switch({checked=false,onChange,disabled=false}){
  const track={width:36,height:20,borderRadius:'var(--radius-pill)',background:checked?'var(--color-primary)':'var(--color-hairline)',position:'relative',transition:'background .15s ease',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1,border:'none',padding:0};
  const thumb={position:'absolute',top:2,left:checked?18:2,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .15s ease',boxShadow:'0 1px 2px rgba(0,0,0,0.2)'};
  return <button style={track} onClick={()=>!disabled&&onChange&&onChange(!checked)} disabled={disabled}><span style={thumb}/></button>;
}

export function Checkbox({checked=false,onChange,label,disabled=false}){
  const box={width:18,height:18,borderRadius:4,background:checked?'var(--color-primary)':'var(--color-canvas)',boxShadow:checked?'none':'inset 0 0 0 1.5px var(--color-border-strong)',display:'flex',alignItems:'center',justifyContent:'center',cursor:disabled?'not-allowed':'pointer',opacity:disabled?0.5:1};
  return (<label style={{display:'inline-flex',alignItems:'center',gap:8,fontFamily:'var(--font-sans)',fontSize:14,color:'var(--color-body)',cursor:disabled?'not-allowed':'pointer'}}>
    <span style={box} onClick={()=>!disabled&&onChange&&onChange(!checked)}>{checked&&<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
    {label}
  </label>);
}
