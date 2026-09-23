import React from 'react';

export function BarChart({data,width=280,height=140,color='var(--color-primary)'}){
  const max=Math.max(...data.map(d=>d.value))||1;
  const barW=width/data.length*0.6;
  const gap=width/data.length;
  return (<svg width={width} height={height+20} viewBox={`0 0 ${width} ${height+20}`}>
    {data.map((d,i)=>{
      const h=(d.value/max)*height;
      return (<g key={d.label}>
        <rect x={i*gap+(gap-barW)/2} y={height-h} width={barW} height={h} rx="3" fill={color}/>
        <text x={i*gap+gap/2} y={height+14} textAnchor="middle" fontSize="10" fill="var(--color-muted)" fontFamily="var(--font-sans)">{d.label}</text>
      </g>);
    })}
  </svg>);
}
