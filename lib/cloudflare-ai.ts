import type { AIMessage } from './free-ai-router';

export type CloudflareResult={text:string;provider:string;model:string};

function token(){return String(process.env.CLOUDFLARE_API_TOKEN||'').trim();}
function accountId(){return String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();}

export function cloudflareConfigured(){return Boolean(token()&&accountId());}

export async function runCloudflareAI(messages:AIMessage[]):Promise<CloudflareResult|null>{
  const apiToken=token();
  const account=accountId();
  if(!apiToken||!account)return null;

  const models=[
    '@cf/qwen/qwen3-30b-a3b-fp8',
    '@cf/meta/llama-3.2-3b-instruct',
    '@cf/meta/llama-3.1-8b-instruct-fast'
  ];

  for(const model of models){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),20_000);
    try{
      const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1/chat/completions`,{
        method:'POST',
        headers:{Authorization:`Bearer ${apiToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages,max_tokens:1600,temperature:0.35,stream:false}),
        signal:controller.signal,
        cache:'no-store'
      });
      const raw=await response.text();
      if(!response.ok){
        console.error('CLOUDFLARE_AI_FAILED',response.status,raw.slice(0,300));
        if([401,403,429].includes(response.status))break;
        continue;
      }
      let data:any;
      try{data=JSON.parse(raw);}catch{continue;}
      const text=String(data?.choices?.[0]?.message?.content||data?.result?.response||'').trim();
      if(text)return {text,provider:'Cloudflare Workers AI',model};
    }catch(error){
      console.error('CLOUDFLARE_AI_ERROR',error instanceof Error?error.message:'unknown');
    }finally{
      clearTimeout(timer);
    }
  }
  return null;
}
