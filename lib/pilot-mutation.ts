import {supabase} from '@/lib/supabase';

export type PilotMutationError={code:string;message:string};
export type PilotMutationResult<T>={data:T|null;error:PilotMutationError|null;operationId:string|null;measurementRecorded:boolean};

export async function pilotMutation<T=unknown>(operation:string,args:Record<string,unknown>={}):Promise<PilotMutationResult<T>>{
 const {data,error}=await supabase.functions.invoke('pilot-mutation-gateway',{body:{operation,args}});
 if(error)return {data:null,error:{code:'GATEWAY_REQUEST_FAILED',message:error.message||'Operation gateway could not be reached.'},operationId:null,measurementRecorded:false};
 const body=data as any;
 if(!body?.ok)return {data:null,error:{code:String(body?.error?.code||'OPERATION_FAILED'),message:String(body?.error?.message||'Operation could not be completed.')},operationId:typeof body?.operation_id==='string'?body.operation_id:null,measurementRecorded:body?.measurement_recorded===true};
 return {data:(body.data??null) as T,error:null,operationId:typeof body?.operation_id==='string'?body.operation_id:null,measurementRecorded:body?.measurement_recorded===true};
}
