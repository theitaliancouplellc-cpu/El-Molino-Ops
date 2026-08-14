import assert from 'node:assert/strict';
import { pipeline } from '@huggingface/transformers';

const MODEL='HuggingFaceTB/SmolLM2-360M-Instruct';

function assistantText(result:any){
  const generated=result?.[0]?.generated_text;
  if(typeof generated==='string')return generated.trim();
  if(Array.isArray(generated)){
    const last=[...generated].reverse().find((m:any)=>m?.role==='assistant'&&typeof m.content==='string');
    return String(last?.content||'').trim();
  }
  return '';
}

async function main(){
  console.log(`Loading ${MODEL} through the same Transformers.js runtime used by Ask El Molino fallback...`);
  const generator=await pipeline('text-generation',MODEL,{dtype:'q8'} as any);

  const basic=await generator([
    {role:'system',content:'You are a concise helpful chat assistant.'},
    {role:'user',content:'What is 2 + 2? Reply with just the number.'}
  ],{max_new_tokens:24,do_sample:false} as any);
  const basicText=assistantText(basic);
  console.log('Basic inference:',JSON.stringify(basicText));
  assert.ok(basicText.length>0,'model returned empty text');
  assert.match(basicText,/4/,'model failed basic conversational inference');

  const contextual=await generator([
    {role:'system',content:'You are a concise helpful chat assistant. Use conversation history.'},
    {role:'user',content:'Remember this for our conversation: the code word is mango.'},
    {role:'assistant',content:'Got it. The code word is mango.'},
    {role:'user',content:'What is the code word? Reply with just the word.'}
  ],{max_new_tokens:24,do_sample:false} as any);
  const contextualText=assistantText(contextual);
  console.log('History inference:',JSON.stringify(contextualText));
  assert.match(contextualText,/mango/i,'model failed conversational history test');

  console.log(JSON.stringify({ok:true,model:MODEL,basic:basicText,context:contextualText}));
}

main().catch(error=>{console.error(error);process.exitCode=1});
