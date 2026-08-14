type OpenMeteoResponse={
  current?:{
    time?:string;
    temperature_2m?:number;
    apparent_temperature?:number;
    relative_humidity_2m?:number;
    precipitation?:number;
    rain?:number;
    weather_code?:number;
    wind_speed_10m?:number;
    wind_gusts_10m?:number;
  };
  daily?:{
    time?:string[];
    temperature_2m_max?:number[];
    temperature_2m_min?:number[];
    precipitation_probability_max?:number[];
  };
};

const JOHNS_ISLAND_LAT=32.7175;
const JOHNS_ISLAND_LON=-80.0640;

function weatherLabel(code:unknown){
  const n=Number(code);
  if(n===0)return 'clear';
  if([1,2].includes(n))return 'partly cloudy';
  if(n===3)return 'overcast';
  if([45,48].includes(n))return 'foggy';
  if([51,53,55,56,57].includes(n))return 'drizzle';
  if([61,63,65,66,67,80,81,82].includes(n))return 'rain';
  if([71,73,75,77,85,86].includes(n))return 'snow';
  if([95,96,99].includes(n))return 'thunderstorms';
  return 'mixed conditions';
}

export function needsLiveWeather(text:string){
  return /\b(weather|forecast|temperature|temp|rain|raining|storm|storms|thunder|lightning|wind|windy|heat|hot|cold|humidity|humid|patio|outdoor seating|awning)\b/i.test(text);
}

export async function getJohnsIslandWeatherContext(){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const params=new URLSearchParams({
      latitude:String(JOHNS_ISLAND_LAT),
      longitude:String(JOHNS_ISLAND_LON),
      current:'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m',
      daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit:'fahrenheit',
      wind_speed_unit:'mph',
      precipitation_unit:'inch',
      timezone:'America/New_York',
      forecast_days:'2'
    });
    const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`,{signal:controller.signal,next:{revalidate:300}});
    if(!response.ok)return '';
    const data=await response.json() as OpenMeteoResponse;
    const c=data.current||{};
    const d=data.daily||{};
    if(typeof c.temperature_2m!=='number')return '';
    const todayHigh=d.temperature_2m_max?.[0];
    const todayLow=d.temperature_2m_min?.[0];
    const rainChance=d.precipitation_probability_max?.[0];
    const parts=[
      `Live Johns Island conditions at ${c.time||'the latest reading'}: ${weatherLabel(c.weather_code)}, ${Math.round(c.temperature_2m)} F`,
      typeof c.apparent_temperature==='number'?`feels like ${Math.round(c.apparent_temperature)} F`:'',
      typeof c.relative_humidity_2m==='number'?`humidity ${Math.round(c.relative_humidity_2m)}%`:'',
      typeof c.wind_speed_10m==='number'?`wind ${Math.round(c.wind_speed_10m)} mph`:'',
      typeof c.wind_gusts_10m==='number'?`gusts ${Math.round(c.wind_gusts_10m)} mph`:'',
      typeof c.precipitation==='number'?`current precipitation ${c.precipitation.toFixed(2)} in`:'',
      typeof todayHigh==='number'&&typeof todayLow==='number'?`today ${Math.round(todayLow)}-${Math.round(todayHigh)} F`:'',
      typeof rainChance==='number'?`today max precipitation chance ${Math.round(rainChance)}%`:''
    ].filter(Boolean);
    return parts.join('; ')+'. Use this as live operational context for El Molino. Do not claim the user needs to provide weather data.';
  }catch{return '';}finally{clearTimeout(timeout);}
}
