export interface LocalTimeResolution {
  status: 'exact' | 'ambiguous' | 'invalid';
  candidatesUtc: number[];
}

interface Parts { year:number; month:number; day:number; hour:number; minute:number; second:number; }

export function resolveLocalDateTime(localDateTime:string,timeZone:string):LocalTimeResolution{
  const target=parseLocal(localDateTime);
  if(!target)return {status:'invalid',candidatesUtc:[]};
  if(!isValidTimeZone(timeZone))return {status:'invalid',candidatesUtc:[]};
  const naive=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);
  const offsets=new Set<number>();
  for(let h=-36;h<=36;h+=3){
    const instant=naive+h*3600000;
    const p=partsAt(instant,timeZone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    offsets.add(Math.round((represented-instant)/60000));
  }
  const candidates=[...offsets].map(offset=>naive-offset*60000).filter(instant=>same(partsAt(instant,timeZone),target));
  const unique=[...new Set(candidates)].sort((a,b)=>a-b);
  return {status:unique.length===0?'invalid':unique.length===1?'exact':'ambiguous',candidatesUtc:unique};
}

export function eventLocalLabel(instantUtc:number,timeZone:string,locale='en'):string{
  return new Intl.DateTimeFormat(locale,{timeZone,year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(instantUtc));
}

function parseLocal(value:string):Parts|null{
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if(!m)return null;
  const out={year:Number(m[1]),month:Number(m[2]),day:Number(m[3]),hour:Number(m[4]),minute:Number(m[5]),second:Number(m[6]??0)};
  if(out.month<1||out.month>12||out.day<1||out.day>31||out.hour>23||out.minute>59||out.second>59)return null;
  const d=new Date(Date.UTC(out.year,out.month-1,out.day,out.hour,out.minute,out.second));
  if(d.getUTCFullYear()!==out.year||d.getUTCMonth()+1!==out.month||d.getUTCDate()!==out.day)return null;
  return out;
}
function isValidTimeZone(tz:string):boolean{try{new Intl.DateTimeFormat('en',{timeZone:tz}).format(0);return true;}catch{return false;}}
function partsAt(instant:number,timeZone:string):Parts{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const map:Record<string,string>={};for(const p of parts)if(p.type!=='literal')map[p.type]=p.value;
  return {year:Number(map.year),month:Number(map.month),day:Number(map.day),hour:Number(map.hour),minute:Number(map.minute),second:Number(map.second)};
}
function same(a:Parts,b:Parts):boolean{return a.year===b.year&&a.month===b.month&&a.day===b.day&&a.hour===b.hour&&a.minute===b.minute&&a.second===b.second;}
