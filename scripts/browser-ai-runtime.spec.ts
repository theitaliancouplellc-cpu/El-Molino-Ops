import { test,expect } from '@playwright/test';

test('Ask El Molino local worker performs contextual inference in browser',async({page})=>{
  test.setTimeout(300_000);
  const browserErrors:string[]=[];
  page.on('pageerror',error=>browserErrors.push(error.message));
  await page.goto('http://127.0.0.1:3000/ai-runtime-test',{waitUntil:'domcontentloaded'});
  await expect(page.locator('h1')).toHaveText('AI Runtime Test');
  await page.waitForFunction(()=>Boolean(window.__EL_MOLINO_AI_BROWSER_SMOKE__?.ok),undefined,{timeout:260_000});
  const result=await page.evaluate(()=>window.__EL_MOLINO_AI_BROWSER_SMOKE__);
  console.log('Browser AI result:',JSON.stringify(result));
  expect(result?.ok).toBe(true);
  expect(result?.text||'').toMatch(/mango/i);
  expect(result?.model).toBeTruthy();
  expect(browserErrors).toEqual([]);
});
