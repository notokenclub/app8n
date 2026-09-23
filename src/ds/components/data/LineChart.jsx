import React from 'react';

export function LineChart({data,width=280,height=80,color='var(--color-primary)'}){
  const max=Math.max(...data),min=Math.min(...data);
  const range=(max-min)||1;
  const step=width/(data.length-1);
  const pts=data.map((v,i)=>`${i*step},${height-((v-min)/range)*height}`).join(' ');
  const area=`0,${height} ${pts} ${width},${height}`;
  return (<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <polygon points={area} fill={color} opacity="0.08"/>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>);
}
