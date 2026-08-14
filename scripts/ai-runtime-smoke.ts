import assert from 'node:assert/strict';
import { pipeline } from '@huggingface/transformers';

type ChatMessage={role:'system'|'user'|'assistant';content:string};
const MODEL={name:'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',dtype:'q4'} as const;

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

async function main(){
  console.log(`Loading production CPU/WASM fallback ${MODEL.name} (${MODEL.dtype}) through Transformers.js...`);
  const generator=await pipeline('text-generation',MODEL.name,{dtype:MODEL.dtype} as any);

  const basicText=await generate(generator,[
    {role:'system',content:'You are a concise helpful chat assistant.'},
    {role:'user',content:'What is 2 + 2? Reply with just the number.'}
  ]);
  console.log('basic inference:',JSON.stringify(basicText));
  assert.ok(basicText.length>0,'fallback model returned empty text');
  assert.match(basicText,/4/,'fallback model failed basic conversational inference');

  const contextualText=await generate(generator,[
    {role:'system',content:'You are a concise helpful chat assistant. Use conversation history.'},
    {role:'user',content:'Remember this for our conversation: the code word is mango.'},
    {role:'assistant',content:'Got it. The code word is mango.'},
    {role:'user',content:'What is the code word? Reply with just the word.'}
  ]);
  console.log('history inference:',JSON.stringify(contextualText));
  assert.match(contextualText,/mango/i,'fallback model failed conversational history test');

  console.log(JSON.stringify({ok:true,model:MODEL.name,dtype:MODEL.dtype,basic:basicText,context:contextualText}));
}

main().catch(error=>{console.error(error);process.exitCode=1});
