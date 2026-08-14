import { test,expect } from '@playwright/test';

test('Ask El Molino local worker performs contextual inference in browser',async({page})=>{
  test.setTimeout(300_000);
  const browserErrors:string[]=[];
  const consoleLines:string[]=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  page.on('console',message=>consoleLines.push(`${message.type()}: ${message.text()}`));
  await page.goto('http://127.0.0.1:3000/ai-runtime-test',{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toHaveText('AI Runtime Test');
  await page.waitForFunction(()=>Boolean(window.__EL_MOLINO_AI_BROWSER_SMOKE__?.ok||window.__EL_MOLINO_AI_BROWSER_SMOKE__?.error),undefined,{timeout:260_000});
  const result=await page.evaluate(()=>window.__EL_MOLINO_AI_BROWSER_SMOKE__);
  console.log('Browser AI result:',JSON.stringify(result));
  console.log('Browser console:',JSON.stringify(consoleLines));
  expect(result?.error,'browser AI runtime error').toBeFalsy();
  expect(result?.ok).toBe(true);
  expect(result?.text||'').toMatch(/mango/i);
  expect(result?.model).toBeTruthy();
  expect(browserErrors).toEqual([]);
});
