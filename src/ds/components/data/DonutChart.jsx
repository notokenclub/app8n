import React from 'react';

export function DonutChart({data,size=140,thickness=18}){
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  const r=(size-thickness)/2, c=size/2, circ=2*Math.PI*r;
  let offset=0;
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-surface-strong)" strokeWidth={thickness}/>
    {data.map(d=>{
      const frac=d.value/total, len=frac*circ;
      const el=(<circle key={d.label} cx={c} cy={c} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
        strokeDasharray={`${len} ${circ-len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${c} ${c})`} strokeLinecap="butt"/>);
      offset+=len; return el;
    })}
  </svg>);
}
