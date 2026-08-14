/// <reference lib="webworker" />

import { pipeline } from '@huggingface/transformers';
import type { LocalAIMessage } from './local-ai-prompt';

type InMessage={id:string;messages:LocalAIMessage[]};
type OutMessage={id:string;ok:boolean;text?:string;model?:string;device?:string;error?:string};

const MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
let generatorPromise:Promise<any>|null=null;
let loadedDevice='';

async function loadGenerator(){
  if(generatorPromise)return generatorPromise;
  generatorPromise=(async()=>{
    const canWebGPU=typeof navigator!=='undefined'&&'gpu' in navigator;
    if(canWebGPU){
      try{
        const generator=await pipeline('text-generation',MODEL,{device:'webgpu',dtype:'q4f16'} as any);
        loadedDevice='webgpu-q4f16';
        return generator;
      }catch(error){
        console.warn('LOCAL_AI_WEBGPU_INIT_FAILED',error instanceof Error?error.message:'unknown');
      }
    }
    const generator=await pipeline('text-generation',MODEL,{dtype:'q8'} as any);
    loadedDevice='wasm-q8';
    return generator;
  })().catch(error=>{generatorPromise=null;throw error});
  return generatorPromise;
}

function assistantText(result:any){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string')return generated.trim();
  if(Array.isArray(generated)){
    const last=[...generated].reverse().find((m:any)=>m?.role==='assistant'&&typeof m?.content==='string');
    return String(last?.content||'').trim();
  }
  return '';
}

self.onmessage=async(event:MessageEvent<InMessage>)=>{
  const {id,messages}=event.data||{};
  if(!id||!Array.isArray(messages))return;
  try{
    const generator=await loadGenerator();
    const result=await generator(messages,{
      max_new_tokens:360,
      do_sample:true,
      temperature:0.55,
      top_p:0.9,
      repetition_penalty:1.08,
    } as any);
    const text=assistantText(result);
    if(!text)throw new Error('Local model returned no text');
    const out:OutMessage={id,ok:true,text,model:MODEL,device:loadedDevice};
    self.postMessage(out);
  }catch(error){
    const out:OutMessage={id,ok:false,error:error instanceof Error?error.message:'Local AI failed'};
    self.postMessage(out);
  }
};

export {};
