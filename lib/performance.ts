export type PerformanceField =
  | 'gross_sales' | 'net_sales' | 'food_sales' | 'alcohol_sales'
  | 'discounts' | 'comps' | 'voids' | 'refunds' | 'guest_count'
  | 'labor_hours' | 'labor_cost' | 'overtime_hours' | 'overtime_cost';

export type PerformancePatch = Partial<Record<PerformanceField, number>> & { business_date: string };

const aliases: Record<PerformanceField, string[]> = {
  gross_sales: ['gross sales','gross revenue','total gross sales','grosssalesamount'],
  net_sales: ['net sales','net revenue','total net sales','sales','netsalesamount'],
  food_sales: ['food sales','food net sales','net food sales'],
  alcohol_sales: ['alcohol sales','beverage sales','bar sales','liquor beer wine sales'],
  discounts: ['discounts','discount amount','discount total','discountamount'],
  comps: ['comps','comp amount','comps amount','complimentary'],
  voids: ['voids','void amount','void total','voidamount'],
  refunds: ['refunds','refund amount','refund total','refundamount'],
  guest_count: ['guest count','guests','covers','cover count'],
  labor_hours: ['labor hours','total labor hours','total hours','hours','totalhours'],
  labor_cost: ['labor cost','labor dollars','total labor','wages','labor wages','totalcost'],
  overtime_hours: ['overtime hours','ot hours','overtimehours'],
  overtime_cost: ['overtime cost','overtime dollars','ot cost','ot dollars','overtimecost'],
};

const dateAliases = new Set(['business date','businessdate','date','sales date','work date','day']);
const magnitudeFields = new Set<PerformanceField>(['discounts','comps','voids','refunds']);

export function normalizeHeader(v:string){return String(v||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');}

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
  if(quoted)return [];
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows.filter(r=>r.some(c=>c.trim()!==''));
}

export function parseNumber(v:string){
  const cleaned=String(v??'').trim().replace(/[$,%]/g,'').replace(/,/g,'').replace(/^\((.*)\)$/,'-$1');
  if(!cleaned)return 0;const n=Number(cleaned);return Number.isFinite(n)?n:NaN;
}

function validYmd(y:number,m:number,d:number){
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
  const x=new Date(Date.UTC(y,m-1,d));
  if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d)return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

export function parseBusinessDate(v:string){
  const s=String(v||'').trim();if(!s)return null;
  const compact=s.match(/^(\d{4})(\d{2})(\d{2})$/);if(compact)return validYmd(Number(compact[1]),Number(compact[2]),Number(compact[3]));
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\b|T)/);if(iso)return validYmd(Number(iso[1]),Number(iso[2]),Number(iso[3]));
  const us=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\b|\s)/);if(us){const y=us[3].length===2?2000+Number(us[3]):Number(us[3]);return validYmd(y,Number(us[1]),Number(us[2]));}
  const d=new Date(s);if(Number.isFinite(d.getTime()))return validYmd(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());return null;
}

export function mapPerformanceCsv(text:string){
  const rows=parseCsv(text);if(rows.length<2)return {records:[] as PerformancePatch[],warnings:['The CSV has no data rows or contains an unclosed quoted field.'],recognized:[] as string[]};
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
  const sourceRow=new Map<string,number>();
  const ambiguousDates=new Set<string>();
  rows.slice(1).forEach((r,rowOffset)=>{
    const rowNo=rowOffset+2;
    const date=parseBusinessDate(r[dateIndex]||'');if(!date){warnings.push(`Row ${rowNo}: invalid date.`);return;}
    if(byDate.has(date)){
      ambiguousDates.add(date);
      warnings.push(`Rows ${sourceRow.get(date)} and ${rowNo}: duplicate business date ${date}; that date was excluded to prevent accidental overwrite or double-counting. Export data grouped by business day only.`);
      return;
    }
    const patch:PerformancePatch={business_date:date};
    let validFields=0;
    for(const f of fieldIndexes){
      const raw=r[f.idx]||'';
      if(!String(raw).trim())continue;
      const n=parseNumber(raw);
      if(Number.isNaN(n)){warnings.push(`Row ${rowNo}: invalid ${f.field.replaceAll('_',' ')}.`);continue;}
      if(n<0&&!magnitudeFields.has(f.field)){warnings.push(`Row ${rowNo}: negative ${f.field.replaceAll('_',' ')} was not imported.`);continue;}
      patch[f.field]=magnitudeFields.has(f.field)?Math.abs(n):n;
      validFields++;
    }
    if(!validFields){warnings.push(`Row ${rowNo}: no valid numeric values.`);return;}
    byDate.set(date,patch);sourceRow.set(date,rowNo);
  });
  for(const date of ambiguousDates)byDate.delete(date);
  return {records:[...byDate.values()].sort((a,b)=>a.business_date.localeCompare(b.business_date)),warnings,recognized};
}

export function laborPercent(netSales:number,laborCost:number){return netSales>0?(laborCost/netSales)*100:0;}
export function salesPerLaborHour(netSales:number,laborHours:number){return laborHours>0?netSales/laborHours:0;}
export function averageCheck(netSales:number,guests:number){return guests>0?netSales/guests:0;}
export function percentChange(current:number,previous:number){return previous!==0?((current-previous)/Math.abs(previous))*100:(current!==0?100:0);}
