'use client';

import { useEffect,useState } from 'react';
import { runLocalBrowserAI } from '@/lib/local-ai-client';
import type { LocalAIMessage } from '@/lib/local-ai-prompt';
import { useI18n } from '@/lib/i18n';

type Result={ok:boolean;text?:string;model?:string;device?:string;error?:string};

declare global{interface Window{__EL_MOLINO_AI_BROWSER_SMOKE__?:Result}}

export default function BrowserAIRuntimeTest(){
  const {locale}=useI18n();
  const [result,setResult]=useState<Result>({ok:false});
  useEffect(()=>{
    let live=true;
    void (async()=>{
      try{
        const messages:LocalAIMessage[]=[
          {role:'system',content:'You are a concise chat assistant. Use conversation history.'},
          {role:'user',content:'Remember this for our conversation: the code word is mango.'},
          {role:'assistant',content:'Got it. The code word is mango.'},
          {role:'user',content:'What is the code word? Reply with just the word.'}
        ];
        const response=await runLocalBrowserAI(messages,180_000);
        const next:Result={ok:/mango/i.test(response.text),text:response.text,model:response.model,device:response.device};
        if(live){window.__EL_MOLINO_AI_BROWSER_SMOKE__=next;setResult(next)}
      }catch(error){
        const next:Result={ok:false,error:error instanceof Error?error.message:'browser local AI failed'};
        if(live){window.__EL_MOLINO_AI_BROWSER_SMOKE__=next;setResult(next)}
      }
    })();
    return()=>{live=false};
  },[]);
  return <main style={{fontFamily:'system-ui',padding:24}}><h1>{locale==='es'?'Prueba de ejecución de IA':'AI Runtime Test'}</h1><pre id="ai-runtime-result">{JSON.stringify(result)}</pre></main>;
}
