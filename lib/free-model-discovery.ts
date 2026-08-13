type GatewayModel={id?:string;type?:string;pricing?:{input?:string|number;output?:string|number}};
type Cache={models:string[];expiresAt:number};

const g=globalThis as typeof globalThis & {__elMolinoFreeModels?:Cache};

function zero(v:unknown){const n=Number(v);return Number.isFinite(n)&&n===0;}
function score(id:string){
  const s=id.toLowerCase();
  let n=0;
  if(/gemini|gemma/.test(s))n+=70;
  if(/qwen/.test(s))n+=65;
  if(/llama/.test(s))n+=60;
  if(/mistral|mixtral/.test(s))n+=55;
  if(/deepseek/.test(s))n+=50;
  if(/instruct|chat/.test(s))n+=25;
  if(/embedding|rerank|vision|image/.test(s))n-=100;
  return n;
}

export async function discoverFreeLanguageModels(){
  const cached=g.__elMolinoFreeModels;
  if(cached&&cached.expiresAt>Date.now()&&cached.models.length)return cached.models;
  try{
    const response=await fetch('https://ai-gateway.vercel.sh/v1/models',{headers:{accept:'application/json'},cache:'no-store'});
    if(!response.ok)return [];
    const data=await response.json();
    const models=(Array.isArray(data?.data)?data.data:[]) as GatewayModel[];
    const free=models.filter(m=>m?.type==='language'&&m.id&&zero(m.pricing?.input)&&zero(m.pricing?.output)).map(m=>String(m.id)).sort((a,b)=>score(b)-score(a)||a.localeCompare(b));
    g.__elMolinoFreeModels={models:free,expiresAt:Date.now()+15*60_000};
    return free;
  }catch{return [];}
}
