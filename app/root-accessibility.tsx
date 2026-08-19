'use client';

import {useEffect} from 'react';

const AUTH_CONTROL_IDS:Record<string,string>={
 name:'auth-full-name',
 email:'auth-email',
 password:'auth-password',
};

function bindLegacyAuthLabels(){
 const card=document.querySelector('.auth-card');
 if(!card)return;
 for(const field of Array.from(card.querySelectorAll<HTMLElement>('.field'))){
  const label=field.querySelector<HTMLLabelElement>('label');
  const control=field.querySelector<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea');
  if(!label||!control)continue;
  const key=control.getAttribute('autocomplete')==='name'?'name':control.getAttribute('type')==='email'?'email':control.getAttribute('type')==='password'?'password':'';
  const id=AUTH_CONTROL_IDS[key];
  if(!id)continue;
  control.id=id;
  label.htmlFor=id;
 }
}

function nameLegacySwitches(){
 for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('.settings-card button[role="switch"]'))){
  if(button.getAttribute('aria-label')?.trim())continue;
  const row=button.closest('.setting-row');
  const title=row?.querySelector('b')?.textContent?.trim();
  if(title)button.setAttribute('aria-label',title);
 }
}

export default function RootAccessibility(){
 useEffect(()=>{
  const repair=()=>{bindLegacyAuthLabels();nameLegacySwitches()};
  repair();
  const observer=new MutationObserver(repair);
  observer.observe(document.body,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[]);
 return null;
}
