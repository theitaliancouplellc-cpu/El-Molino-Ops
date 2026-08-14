import assert from 'node:assert/strict';
import { pipeline } from '@huggingface/transformers';

type ChatMessage={role:'system'|'user'|'assistant';content:string};
const MODELS=[
  {name:'onnx-community/Qwen2.5-0.5B-Instruct',dtype:'q8'},
  {name:'HuggingFaceTB/SmolLM2-360M-Instruct',dtype:'q8'},
] as const;

function plainTranscript(messages:ChatMessage[]){
  return messages.map(message=>`${message.role==='system'?'System':message.role==='user'?'User':'Assistant'}: ${message.content}`).join('\n')+'\nAssistant:';
}

async function renderPrompt(generator:any,messages:ChatMessage[]){
  const tokenizer=generator?.tokenizer;
  if(tokenizer?.apply_chat_template){
    try{
      const rendered=await Promise.resolve(tokenizer.apply_chat_template(messages,{tokenize:false,add_generation_prompt:true} as any));
      if(typeof rendered==='string'&&rendered.trim())return rendered;
    }catch(error){
      console.warn('CHAT_TEMPLATE_FAILED',error instanceof Error?error.message:'unknown');
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
    const last=[...generated].reverse().find((m:any)=>m?.role==='assistant'&&typeof m.content==='string');
    return String(last?.content||'').trim();
  }
  return '';
}

async function generate(generator:any,messages:ChatMessage[],max_new_tokens=24){
  const prompt=await renderPrompt(generator,messages);
  const result=await generator(prompt,{max_new_tokens,do_sample:false,return_full_text:false} as any);
  return assistantText(result,prompt);
}

async function verifyModel(model:string,dtype:string){
  console.log(`Loading ${model} through Transformers.js...`);
  const generator=await pipeline('text-generation',model,{dtype} as any);

  const basicMessages:ChatMessage[]=[
    {role:'system',content:'You are a concise helpful chat assistant.'},
    {role:'user',content:'What is 2 + 2? Reply with just the number.'}
  ];
  const basicText=await generate(generator,basicMessages);
  console.log(`${model} basic inference:`,JSON.stringify(basicText));
  assert.ok(basicText.length>0,`${model} returned empty text`);
  assert.match(basicText,/4/,`${model} failed basic conversational inference`);

  const contextualMessages:ChatMessage[]=[
    {role:'system',content:'You are a concise helpful chat assistant. Use conversation history.'},
    {role:'user',content:'Remember this for our conversation: the code word is mango.'},
    {role:'assistant',content:'Got it. The code word is mango.'},
    {role:'user',content:'What is the code word? Reply with just the word.'}
  ];
  const contextualText=await generate(generator,contextualMessages);
  console.log(`${model} history inference:`,JSON.stringify(contextualText));
  assert.match(contextualText,/mango/i,`${model} failed conversational history test`);
  return {model,basic:basicText,context:contextualText};
}

async function main(){
  const results=[];
  for(const model of MODELS)results.push(await verifyModel(model.name,model.dtype));
  console.log(JSON.stringify({ok:true,results}));
}

main().catch(error=>{console.error(error);process.exitCode=1});
