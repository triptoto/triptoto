export type JourneyType='one_way'|'round_trip'|'multi_city'|'open_jaw'|'road_trip'|'single_city'|'mixed';
export type JourneyRole='outbound'|'return'|'stopover'|'stay'|'transfer'|'activity'|'other';

export interface JourneyItemInput{
  itemId:string;
  sequenceNo:number;
  semanticRole:JourneyRole;
  startsAtUtc?:number;
  endsAtUtc?:number;
}
export interface JourneyValidationIssue{code:string;severity:'high'|'medium'|'low';message:string;itemIds:string[]}
export interface JourneyValidation{valid:boolean;issues:JourneyValidationIssue[];orderedItemIds:string[]}

export function validateJourney(type:JourneyType,items:JourneyItemInput[]):JourneyValidation{
  const ordered=[...items].sort((a,b)=>a.sequenceNo-b.sequenceNo);
  const issues:JourneyValidationIssue[]=[];
  const sequenceSeen=new Set<number>();
  for(const item of ordered){
    if(sequenceSeen.has(item.sequenceNo))issues.push({code:'DUPLICATE_SEQUENCE',severity:'medium',message:`More than one journey item uses sequence ${item.sequenceNo}.`,itemIds:[item.itemId]});
    sequenceSeen.add(item.sequenceNo);
    if(item.startsAtUtc!=null&&item.endsAtUtc!=null&&item.endsAtUtc<item.startsAtUtc)issues.push({code:'ITEM_ENDS_BEFORE_START',severity:'high',message:'A journey item ends before it starts.',itemIds:[item.itemId]});
  }
  for(let i=0;i<ordered.length-1;i++){
    const a=ordered[i],b=ordered[i+1];
    if(a.startsAtUtc!=null&&b.startsAtUtc!=null&&b.startsAtUtc<a.startsAtUtc)issues.push({code:'NON_CHRONOLOGICAL_ORDER',severity:'medium',message:'Journey sequence does not match chronological order.',itemIds:[a.itemId,b.itemId]});
    if(a.endsAtUtc!=null&&b.startsAtUtc!=null&&a.endsAtUtc>b.startsAtUtc)issues.push({code:'JOURNEY_ITEMS_OVERLAP',severity:'high',message:'Consecutive journey items overlap.',itemIds:[a.itemId,b.itemId]});
  }
  if(type==='round_trip'){
    const outbound=ordered.filter(x=>x.semanticRole==='outbound').length,returns=ordered.filter(x=>x.semanticRole==='return').length;
    if(outbound===0||returns===0)issues.push({code:'ROUND_TRIP_ROLES_MISSING',severity:'medium',message:'A round trip should identify outbound and return items.',itemIds:[]});
  }
  if(type==='one_way'&&ordered.some(x=>x.semanticRole==='return'))issues.push({code:'ONE_WAY_HAS_RETURN',severity:'low',message:'A one-way journey contains an item marked return.',itemIds:ordered.filter(x=>x.semanticRole==='return').map(x=>x.itemId)});
  if(type==='open_jaw'&&ordered.length<2)issues.push({code:'OPEN_JAW_TOO_SHORT',severity:'medium',message:'An open-jaw journey normally needs at least two transport legs.',itemIds:ordered.map(x=>x.itemId)});
  if(type==='road_trip'&&!ordered.length)issues.push({code:'ROAD_TRIP_EMPTY',severity:'medium',message:'The road-trip journey has no itinerary items.',itemIds:[]});
  return{valid:!issues.some(x=>x.severity==='high'),issues,orderedItemIds:ordered.map(x=>x.itemId)};
}
