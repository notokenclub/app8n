import React from 'react';

export function Heatmap({rows,cols,values,colorScale}){
  const scale=colorScale||['var(--sand-100)','var(--flame-200)','var(--flame-400)','var(--flame-600)'];
  const cell=20,gap=3;
  return (<svg width={cols*(cell+gap)} height={rows*(cell+gap)}>
    {values.map((v,i)=>{
      const x=(i%cols)*(cell+gap), y=Math.floor(i/cols)*(cell+gap);
      const idx=Math.min(scale.length-1,Math.floor(v*scale.length));
      return <rect key={i} x={x} y={y} width={cell} height={cell} rx="3" fill={scale[idx]}/>;
    })}
  </svg>);
}
