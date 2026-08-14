import { notFound } from 'next/navigation';
import BrowserAIRuntimeTest from './runtime-test-client';

export const dynamic='force-dynamic';

export default function AIRuntimeTestPage(){
  if(process.env.ENABLE_AI_RUNTIME_TEST!=='1')notFound();
  return <BrowserAIRuntimeTest/>;
}
