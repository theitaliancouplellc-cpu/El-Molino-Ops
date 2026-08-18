'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/lib/supabase';

const DEVICE_KEY='el-molino-native-push-device';
type StoredDevice={deviceId:string;token:string;platform:'ios'|'android'};

export function nativePushSupported(){return Capacitor.isNativePlatform()&&['ios','android'].includes(Capacitor.getPlatform())}
async function storedDevice(){const {value}=await Preferences.get({key:DEVICE_KEY});if(!value)return null;try{return JSON.parse(value) as StoredDevice}catch{return null}}
function tokenOnce(){return new Promise<Token>((resolve,reject)=>{let done=false;void PushNotifications.addListener('registration',token=>{if(!done){done=true;resolve(token)}});void PushNotifications.addListener('registrationError',error=>{if(!done){done=true;reject(error)}})})}

export async function getNativePushState(){
 if(!nativePushSupported())return 'unsupported' as const;
 const permission=await PushNotifications.checkPermissions();
 if(permission.receive==='denied')return 'denied' as const;
 return await storedDevice()?'enabled' as const:'default' as const;
}

export async function enableNativePush(){
 if(!nativePushSupported())return 'unsupported' as const;
 const permission=await PushNotifications.requestPermissions();
 if(permission.receive==='denied')return 'denied' as const;
 if(permission.receive!=='granted')return 'default' as const;
 const device=await storedDevice();
 const pending=tokenOnce();await PushNotifications.register();const token=(await pending).value;
 const platform=Capacitor.getPlatform() as 'ios'|'android';
 const deviceId=device?.deviceId||crypto.randomUUID();
 const result=await supabase.rpc('register_my_native_push_device',{p_device_id:deviceId,p_platform:platform,p_token:token});
 if(result.error)throw new Error('native_push_registration_failed');
 await Preferences.set({key:DEVICE_KEY,value:JSON.stringify({deviceId,platform,token} satisfies StoredDevice)});
 return 'enabled' as const;
}

export async function disableNativePush(){
 const device=await storedDevice();
 if(device){const result=await supabase.rpc('remove_my_native_push_device',{p_device_id:device.deviceId});if(result.error)throw new Error('native_push_disable_failed')}
 await PushNotifications.unregister();await Preferences.remove({key:DEVICE_KEY});return 'disabled' as const;
}
