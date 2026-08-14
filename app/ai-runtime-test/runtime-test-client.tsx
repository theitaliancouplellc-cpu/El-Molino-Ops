'use client';

import { useEffect,useState } from 'react';
import { buildLocalAIMessages } from '@/lib/local-ai-prompt';
import { runLocalBrowserAI } from '@/lib/local-ai-client';

type Result={ok:boolean;text?:string;model?:string;device?:string;error?:string};

declare global{interface Window{__EL_MOLINO_AI_BROWSER_SMOKE__?:Result}}

export default function BrowserAIRuntimeTest(){
  const [result,setResult]=useState<Result>({ok:false});
  useEffect(()=>{
    let live=true;
    void (async()=>{
      try{
        const messages=buildLocalAIMessages({
          question:'What is the code word? Reply with just the word.',
          history:[
            {role:'user',content:'Remember this for our conversation: the code word is mango.'},
            {role:'assistant',content:'Got it. The code word is mango.'}
          ],
          knowledge:[{title:'Closing cash',content:'Managers reconcile the drawer before final close.',status:'approved'}],
          procedures:[{title:'Closing procedure',description:'Reconcile cash, verify totals, secure funds.',status:'published'}]
        });
        const response=await runLocalBrowserAI(messages,240_000);
        const next:Result={ok:/mango/i.test(response.text),text:response.text,model:response.model,device:response.device};
        if(live){window.__EL_MOLINO_AI_BROWSER_SMOKE__=next;setResult(next)}
      }catch(error){
        const next:Result={ok:false,error:error instanceof Error?error.message:'browser local AI failed'};
        if(live){window.__EL_MOLINO_AI_BROWSER_SMOKE__=next;setResult(next)}
      }
    })();
    return()=>{live=false};
  },[]);
  return <main style={{fontFamily:'system-ui',padding:24}}><h1>AI Runtime Test</h1><pre id="ai-runtime-result">{JSON.stringify(result)}</pre></main>;
}
