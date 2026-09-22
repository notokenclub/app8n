import React from 'react';
export function LogConsole({lines=[]}){
  return (<div style={{background:'var(--color-surface-dark)',borderRadius:'var(--radius-md)',padding:16,fontFamily:'var(--font-mono)',fontSize:13,color:'#E7E1D8',overflow:'hidden'}}>
    {lines.map((l,i)=>(<div key={i} style={{whiteSpace:'pre',padding:'2px 0',color:l.level==='error'?'#FF9C6E':l.level==='warn'?'var(--flame-300)':'#E7E1D8'}}>
      <span style={{opacity:0.5}}>{l.time} </span>{l.text}
    </div>))}
  </div>);
}
