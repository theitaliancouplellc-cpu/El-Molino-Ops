import {addDateDays,dateDayOfWeek} from './scheduling-engine';

export type HistoricalPerformance={business_date:string;net_sales:number;labor_hours?:number|null};
export type ForecastSuggestion={business_date:string;projected_sales:number;confidence:number;sample_count:number;method:'same_weekday_robust'};

const round2=(n:number)=>Math.round(n*100)/100;
const median=(xs:number[])=>{const a=[...xs].sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};

export function robustSameWeekdayForecast(history:HistoricalPerformance[],businessDate:string):ForecastSuggestion|null{
  const dow=dateDayOfWeek(businessDate);
  const samples=history
    .filter(x=>x.business_date<businessDate&&dateDayOfWeek(x.business_date)===dow&&Number.isFinite(Number(x.net_sales))&&Number(x.net_sales)>0)
    .sort((a,b)=>b.business_date.localeCompare(a.business_date))
    .slice(0,10)
    .map(x=>Number(x.net_sales));
  if(!samples.length)return null;
  const med=median(samples);
  const deviations=samples.map(x=>Math.abs(x-med)),mad=median(deviations);
  const limit=mad>0?3.5*mad:Math.max(1,med*.5);
  const filtered=samples.filter(x=>Math.abs(x-med)<=limit);
  const usable=filtered.length>=Math.min(3,samples.length)?filtered:samples;
  let weighted=0,weightTotal=0;
  usable.forEach((value,index)=>{const w=Math.pow(.82,index);weighted+=value*w;weightTotal+=w});
  const recencyMean=weighted/weightTotal;
  const estimate=recencyMean*.7+median(usable)*.3;
  const mean=usable.reduce((a,b)=>a+b,0)/usable.length;
  const variance=usable.length>1?usable.reduce((n,x)=>n+(x-mean)**2,0)/usable.length:0;
  const cv=mean>0?Math.sqrt(variance)/mean:1;
  const sampleScore=Math.min(1,usable.length/6),stabilityScore=Math.max(0,1-Math.min(1,cv));
  const confidence=Math.round(100*(.65*sampleScore+.35*stabilityScore));
  return {business_date:businessDate,projected_sales:round2(Math.max(0,estimate)),confidence,sample_count:usable.length,method:'same_weekday_robust'};
}

export function suggestForecastWeek(history:HistoricalPerformance[],weekStart:string){
  return Array.from({length:7},(_,i)=>robustSameWeekdayForecast(history,addDateDays(weekStart,i))).filter((x):x is ForecastSuggestion=>Boolean(x));
}

export function projectedLaborHours(projectedSales:number,salesPerLaborHour:number|null|undefined){
  if(!salesPerLaborHour||salesPerLaborHour<=0||projectedSales<0)return null;
  return round2(projectedSales/salesPerLaborHour);
}
