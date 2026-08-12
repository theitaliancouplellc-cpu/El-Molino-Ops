export type RetryDecision={retry:boolean;delayMs:number;reason:string};

export function retryDecision(status:number,attempt:number,retryAfterMs=0):RetryDecision{
  if(attempt>=3)return {retry:false,delayMs:0,reason:'attempt_limit'};
  const transient=status===408||status===425||status===429||status===502||status===503||status===504||status===599;
  if(!transient)return {retry:false,delayMs:0,reason:'not_transient'};
  const base=Math.min(250*Math.pow(2,attempt),2000);
  return {retry:true,delayMs:Math.min(Math.max(retryAfterMs,base),5000),reason:status===429?'rate_limit':'transient'};
}

export function isSafeRetryRequest(method:string|undefined,url:string){
  const m=(method||'GET').toUpperCase();
  if(['GET','HEAD','OPTIONS'].includes(m))return true;
  if(m==='POST'&&/\/api\/ask(?:\?|$)/.test(url))return true;
  return false;
}

export async function safeFetchWithRetry(input:RequestInfo|URL,init:RequestInit={},fetcher:typeof fetch=fetch){
  const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
  if(!isSafeRetryRequest(init.method,url))return fetcher(input,init);
  let last:Response|undefined;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetcher(input,init);last=response;
      if(response.ok)return response;
      const ra=Number(response.headers.get('retry-after')||0)*1000;
      const d=retryDecision(response.status,attempt,ra);
      if(!d.retry)return response;
      await new Promise(r=>setTimeout(r,d.delayMs));
    }catch(e){
      const d=retryDecision(599,attempt,0);if(!d.retry)throw e;await new Promise(r=>setTimeout(r,d.delayMs));
    }
  }
  if(last)return last;
  throw new Error('Request failed after retries.');
}
