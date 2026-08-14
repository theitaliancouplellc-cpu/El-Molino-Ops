import assert from 'node:assert/strict';
import { pipeline } from '@huggingface/transformers';

type ChatMessage={role:'system'|'user'|'assistant';content:string};
const MODELS=[
  {name:'onnx-community/Qwen2.5-0.5B-Instruct',dtype:'q8'},
  {name:'HuggingFaceTB/SmolLM2-360M-Instruct',dtype:'q8'},
] as const;

function assistantText(result:any){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string')return generated.trim();
  if(Array.isArray(generated)){
    const last=[...generated].reverse().find((m:any)=>m?.role==='assistant'&&typeof m.content==='string');
    return String(last?.content||'').trim();
  }
  return '';
}

async function verifyModel(model:string,dtype:string){
  console.log(`Loading ${model} through Transformers.js...`);
  const generator=await pipeline('text-generation',model,{dtype} as any);

  const basicMessages:ChatMessage[]=[
    {role:'system',content:'You are a concise helpful chat assistant.'},
    {role:'user',content:'What is 2 + 2? Reply with just the number.'}
  ];
  const basic=await generator(basicMessages,{max_new_tokens:24,do_sample:false} as any);
  const basicText=assistantText(basic);
  console.log(`${model} basic inference:`,JSON.stringify(basicText));
  assert.ok(basicText.length>0,`${model} returned empty text`);
  assert.match(basicText,/4/,`${model} failed basic conversational inference`);

  const contextualMessages:ChatMessage[]=[
    {role:'system',content:'You are a concise helpful chat assistant. Use conversation history.'},
    {role:'user',content:'Remember this for our conversation: the code word is mango.'},
    {role:'assistant',content:'Got it. The code word is mango.'},
    {role:'user',content:'What is the code word? Reply with just the word.'}
  ];
  const contextual=await generator(contextualMessages,{max_new_tokens:24,do_sample:false} as any);
  const contextualText=assistantText(contextual);
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
