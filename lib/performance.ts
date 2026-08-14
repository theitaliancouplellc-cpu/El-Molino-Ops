export type PerformanceField =
  | 'gross_sales' | 'net_sales' | 'food_sales' | 'alcohol_sales'
  | 'discounts' | 'comps' | 'voids' | 'refunds' | 'guest_count'
  | 'labor_hours' | 'labor_cost' | 'overtime_hours' | 'overtime_cost';

export type PerformancePatch = Partial<Record<PerformanceField, number>> & { business_date: string };

const aliases: Record<PerformanceField, string[]> = {
  gross_sales: ['gross sales','gross revenue','total gross sales'],
  net_sales: ['net sales','net revenue','total net sales','sales'],
  food_sales: ['food sales','food net sales','net food sales'],
  alcohol_sales: ['alcohol sales','beverage sales','bar sales','liquor beer wine sales'],
  discounts: ['discounts','discount amount','discount total'],
  comps: ['comps','comp amount','comps amount','complimentary'],
  voids: ['voids','void amount','void total'],
  refunds: ['refunds','refund amount','refund total'],
  guest_count: ['guest count','guests','covers','cover count'],
  labor_hours: ['labor hours','total labor hours','total hours','hours'],
  labor_cost: ['labor cost','labor dollars','total labor','wages','labor wages'],
  overtime_hours: ['overtime hours','ot hours'],
  overtime_cost: ['overtime cost','overtime dollars','ot cost','ot dollars'],
};

const dateAliases = new Set(['business date','date','sales date','work date','day']);

export function normalizeHeader(v:string){return String(v||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}

export function parseCsv(text:string): string[][] {
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
      continue;
    }
    if(ch==='"'){quoted=true;continue;}
    if(ch===','){row.push(cell);cell='';continue;}
    if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(c=>c.trim()!==''));
}

export function parseNumber(v:string){
  const cleaned=String(v??'').trim().replace(/[$,%]/g,'').replace(/,/g,'').replace(/^\((.*)\)$/,'-$1');
  if(!cleaned)return 0;const n=Number(cleaned);return Number.isFinite(n)?n:NaN;
}

export function parseBusinessDate(v:string){
  const s=String(v||'').trim();if(!s)return null;
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(iso)return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const us=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);if(us){const y=us[3].length===2?`20${us[3]}`:us[3];return `${y}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;}
  const d=new Date(s);if(Number.isFinite(d.getTime()))return d.toISOString().slice(0,10);return null;
}

export function mapPerformanceCsv(text:string){
  const rows=parseCsv(text);if(rows.length<2)return {records:[] as PerformancePatch[],warnings:['The CSV has no data rows.'],recognized:[] as string[]};
  const headers=rows[0].map(normalizeHeader);
  const dateIndex=headers.findIndex(h=>dateAliases.has(h));
  const fieldIndexes = Object.entries(aliases).flatMap(([field,names])=>{
    const idx=headers.findIndex(h=>names.includes(h));return idx>=0?[{field:field as PerformanceField,idx}]:[];
  });
  const recognized=fieldIndexes.map(x=>x.field);
  const warnings:string[]=[];
  if(dateIndex<0)return {records:[] as PerformancePatch[],warnings:['No business-date column was recognized. Use Date or Business Date.'],recognized};
  if(!fieldIndexes.length)return {records:[] as PerformancePatch[],warnings:['No supported sales or labor columns were recognized.'],recognized};
  const byDate=new Map<string,PerformancePatch>();
  rows.slice(1).forEach((r,rowOffset)=>{
    const date=parseBusinessDate(r[dateIndex]||'');if(!date){warnings.push(`Row ${rowOffset+2}: invalid date.`);return;}
    const patch=byDate.get(date)||{business_date:date};
    for(const f of fieldIndexes){const n=parseNumber(r[f.idx]||'');if(Number.isNaN(n)){warnings.push(`Row ${rowOffset+2}: invalid ${f.field.replaceAll('_',' ')}.`);continue;}patch[f.field]=Math.max(0,n);}
    byDate.set(date,patch);
  });
  return {records:[...byDate.values()].sort((a,b)=>a.business_date.localeCompare(b.business_date)),warnings,recognized};
}

export function laborPercent(netSales:number,laborCost:number){return netSales>0?(laborCost/netSales)*100:0;}
export function salesPerLaborHour(netSales:number,laborHours:number){return laborHours>0?netSales/laborHours:0;}
export function averageCheck(netSales:number,guests:number){return guests>0?netSales/guests:0;}
export function percentChange(current:number,previous:number){return previous!==0?((current-previous)/Math.abs(previous))*100:(current!==0?100:0);}
