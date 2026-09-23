import React from 'react';
const dirs={up:-90,down:90,left:180,right:0};
export function Arrow({direction='right',size=16,color='currentColor',style}){
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{transform:`rotate(${dirs[direction]}deg)`,...style}}>
    <path d="M2 8H13.5M13.5 8L9 3.5M13.5 8L9 12.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
}

export function FlowArrow({direction='right',lineStyle='solid',color='var(--color-border-strong)',length=80}){
  const vertical=direction==='up'||direction==='down';
  const w=vertical?24:length, h=vertical?length:24;
  return (<div style={{position:'relative',width:w,height:h,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{position:'absolute',width:vertical?2:'100%',height:vertical?'100%':2,background:lineStyle==='dashed'?`repeating-linear-gradient(${vertical?'0deg':'90deg'},${color} 0 4px,transparent 4px 8px)`:color}}/>
    <Arrow direction={direction} size={12} color={color} style={{position:'absolute',[direction==='right'?'right':direction==='left'?'left':direction==='down'?'bottom':'top']:-4}}/>
  </div>);
}
