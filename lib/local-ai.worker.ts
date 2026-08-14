/// <reference lib="webworker" />

import { pipeline } from '@huggingface/transformers';
import type { LocalAIMessage } from './local-ai-prompt';

type InMessage={id:string;messages:LocalAIMessage[]};
type OutMessage={id:string;ok:boolean;text?:string;model?:string;device?:string;error?:string};

const PRIMARY_MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
const FALLBACK_MODEL='HuggingFaceTB/SmolLM2-360M-Instruct';
let generatorPromise:Promise<any>|null=null;
let loadedDevice='';
let loadedModel='';

async function usableWebGPU(){
  if(typeof navigator==='undefined'||!('gpu' in navigator))return false;
  const gpu=(navigator as any).gpu;
  if(!gpu?.requestAdapter)return false;
  try{
    const adapter=await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>(resolve=>setTimeout(()=>resolve(null),2500))
    ]);
    return Boolean(adapter);
  }catch{return false;}
}

async function loadFallback(){
  const generator=await pipeline('text-generation',FALLBACK_MODEL,{dtype:'q4'} as any);
  loadedDevice='wasm-q4';loadedModel=FALLBACK_MODEL;
  return generator;
}

async function loadGenerator(){
  if(generatorPromise)return generatorPromise;
  generatorPromise=(async()=>{
    if(await usableWebGPU()){
      try{
        const generator=await pipeline('text-generation',PRIMARY_MODEL,{device:'webgpu',dtype:'q4f16'} as any);
        loadedDevice='webgpu-q4f16';loadedModel=PRIMARY_MODEL;
        return generator;
      }catch(error){
        console.warn('LOCAL_AI_WEBGPU_INIT_FAILED',error instanceof Error?error.message:'unknown');
      }
    }
    return loadFallback();
  })().catch(error=>{generatorPromise=null;loadedDevice='';loadedModel='';throw error});
  return generatorPromise;
}

async function switchToFallback(){
  generatorPromise=loadFallback().catch(error=>{generatorPromise=null;loadedDevice='';loadedModel='';throw error});
  return generatorPromise;
}

function plainTranscript(messages:LocalAIMessage[]){
  return messages.map(message=>`${message.role==='system'?'System':message.role==='user'?'User':'Assistant'}: ${message.content}`).join('\n')+'\nAssistant:';
}

async function renderPrompt(generator:any,messages:LocalAIMessage[]){
  const tokenizer=generator?.tokenizer;
  if(tokenizer?.apply_chat_template){
    try{
      const rendered=await Promise.resolve(tokenizer.apply_chat_template(messages,{tokenize:false,add_generation_prompt:true} as any));
      if(typeof rendered==='string'&&rendered.trim())return rendered;
    }catch(error){
      console.warn('LOCAL_AI_CHAT_TEMPLATE_FAILED',error instanceof Error?error.message:'unknown');
    }
  }
  return plainTranscript(messages);
}

function assistantText(result:any,prompt=''){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string'){
    const text=generated.trim();
    if(prompt&&text.startsWith(prompt.trim()))return text.slice(prompt.trim().length).trim();
    return text;
  }
  if(Array.isArray(generated)){
    const last=[...generated].reverse().find((m:any)=>m?.role==='assistant'&&typeof m?.content==='string');
    return String(last?.content||'').trim();
  }
  return '';
}

const generationOptions={max_new_tokens:220,do_sample:true,temperature:0.5,top_p:0.9,repetition_penalty:1.08,return_full_text:false};
async function generate(generator:any,messages:LocalAIMessage[]){
  const prompt=await renderPrompt(generator,messages);
  const result=await generator(prompt,generationOptions as any);
  const text=assistantText(result,prompt);
  if(!text)throw new Error('Local model returned no text');
  return text;
}

self.onmessage=async(event:MessageEvent<InMessage>)=>{
  const {id,messages}=event.data||{};
  if(!id||!Array.isArray(messages))return;
  try{
    let generator=await loadGenerator();
    let text:string;
    try{text=await generate(generator,messages)}catch(primaryError){
      if(loadedModel!==PRIMARY_MODEL)throw primaryError;
      console.warn('LOCAL_AI_WEBGPU_GENERATION_FAILED',primaryError instanceof Error?primaryError.message:'unknown');
      generator=await switchToFallback();
      text=await generate(generator,messages);
    }
    const out:OutMessage={id,ok:true,text,model:loadedModel||PRIMARY_MODEL,device:loadedDevice};
    self.postMessage(out);
  }catch(error){
    const out:OutMessage={id,ok:false,error:error instanceof Error?error.message:'Local AI failed'};
    self.postMessage(out);
  }
};

export {};
