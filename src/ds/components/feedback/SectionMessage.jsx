import React from 'react';

const appearances={
  information:{bg:'#EAF0FF',fg:'#1D3E9C',icon:'InformationCircle'},
  warning:{bg:'#FFF6E0',fg:'#8A5A00',icon:'Alert'},
  danger:{bg:'#FBEAE4',fg:'var(--color-danger)',icon:'CrossCircle'},
  success:{bg:'#E9F5EA',fg:'var(--color-success)',icon:'CheckCircle'},
  discovery:{bg:'var(--color-primary-subtle)',fg:'var(--color-primary)',icon:'MagicWand'},
};

export function SectionMessage({appearance='information',title,children,IconComponent}){
  const a=appearances[appearance]||appearances.information;
  return (<div style={{display:'flex',gap:12,background:a.bg,color:a.fg,borderRadius:'var(--radius-md)',padding:'var(--space-md)',fontFamily:'var(--font-sans)'}}>
    {IconComponent&&<IconComponent name={a.icon} size={18}/>}
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {title&&<div style={{fontWeight:600,fontSize:14}}>{title}</div>}
      <div style={{fontSize:14,lineHeight:1.5,opacity:0.9}}>{children}</div>
    </div>
  </div>);
}
