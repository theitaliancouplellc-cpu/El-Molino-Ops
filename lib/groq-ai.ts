import type { AIMessage } from './free-ai-router';

export type GroqResult={text:string;provider:string;model:string};

function key(){return String(process.env.GROQ_API_KEY||'').trim();}

export function groqConfigured(){return Boolean(key());}

export async function runGroqAI(messages:AIMessage[]):Promise<GroqResult|null>{
  const token=key();
  if(!token)return null;
  const models=['openai/gpt-oss-120b','llama-3.3-70b-versatile','llama-3.1-8b-instant'];
  for(const model of models){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),18000);
      const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages,max_tokens:1800,temperature:0.35,stream:false}),
        signal:controller.signal,
        cache:'no-store'
      }).finally(()=>clearTimeout(timer));
      const raw=await response.text();
      if(!response.ok){console.error('GROQ_AI_FAILED',response.status,raw.slice(0,300));continue;}
      const data=JSON.parse(raw);
      const text=String(data?.choices?.[0]?.message?.content||'').trim();
      if(text)return {text,provider:'Groq Free',model};
    }catch(error){console.error('GROQ_AI_ERROR',error instanceof Error?error.message:'unknown');}
  }
  return null;
}
