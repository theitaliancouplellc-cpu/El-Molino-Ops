export type ToastEmployee={guid:string;externalEmployeeId?:string|null;firstName?:string|null;chosenName?:string|null;lastName?:string|null;email?:string|null;phoneNumber?:string|null;deleted?:boolean|null};
export type ToastBreak={guid?:string|null;paid?:boolean|null;inDate?:string|null;outDate?:string|null;missed?:boolean|null;waived?:boolean|null};
export type ToastTimeEntry={guid:string;employeeReference?:{guid?:string|null}|null;jobReference?:{guid?:string|null}|null;shiftReference?:{guid?:string|null}|null;inDate:string;outDate?:string|null;businessDate?:string|null;regularHours?:number|null;overtimeHours?:number|null;hourlyWage?:number|null;breaks?:ToastBreak[]|null;declaredCashTips?:number|null;nonCashTips?:number|null;cashGratuityServiceCharges?:number|null;nonCashGratuityServiceCharges?:number|null;tipsWithheld?:number|null;cashSales?:number|null;nonCashSales?:number|null;autoClockedOut?:boolean|null;deleted?:boolean|null;createdDate?:string|null;modifiedDate?:string|null};
type ToastReference={guid?:string|null};
type ToastRefund={refundAmount?:number|null;tipRefundAmount?:number|null};
type ToastPayment={guid?:string|null;paidDate?:string|null;type?:string|null;amount?:number|null;tipAmount?:number|null;paymentStatus?:string|null;server?:ToastReference|null;refund?:ToastRefund|null;voidInfo?:unknown};
type ToastCheck={guid?:string|null;server?:ToastReference|null;payments?:ToastPayment[]|null};
type ToastOrder={guid?:string|null;businessDate?:number|string|null;server?:ToastReference|null;voided?:boolean|null;checks?:ToastCheck[]|null};
type ToastCashEntry={guid?:string|null;amount?:number|null;date?:string|null;type?:string|null;employee?:ToastReference|null;creator?:ToastReference|null};
type ToastDeposit={guid?:string|null;amount?:number|null;date?:string|null;employee?:ToastReference|null;creator?:ToastReference|null};

export type ToastSnapshot={
 restaurantGuid:string;
 employees:Array<Record<string,unknown>>;
 timeEntries:Array<Record<string,unknown>>;
 payments:Array<Record<string,unknown>>;
 cashEntries:Array<Record<string,unknown>>;
 deposits:Array<Record<string,unknown>>;
};

type ToastConfig={host:string;clientId:string;clientSecret:string;restaurantGuid:string};

function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is not configured.`);return value;}
export function toastConfigured(){return Boolean(process.env.TOAST_API_HOST?.trim()&&process.env.TOAST_CLIENT_ID?.trim()&&process.env.TOAST_CLIENT_SECRET?.trim()&&process.env.TOAST_RESTAURANT_GUID?.trim());}
function config():ToastConfig{return {host:required('TOAST_API_HOST').replace(/\/+$/,''),clientId:required('TOAST_CLIENT_ID'),clientSecret:required('TOAST_CLIENT_SECRET'),restaurantGuid:required('TOAST_RESTAURANT_GUID')}}
const asNumber=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:0;
const ymd=(date:string)=>date.replaceAll('-','');

async function token(c:ToastConfig){
 const response=await fetch(`${c.host}/authentication/v1/authentication/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:c.clientId,clientSecret:c.clientSecret,userAccessType:'TOAST_MACHINE_CLIENT'}),cache:'no-store'});
 if(!response.ok)throw new Error(`Toast authentication failed (${response.status}).`);
 const data=await response.json() as {token?:{accessToken?:string}};
 if(!data.token?.accessToken)throw new Error('Toast authentication returned no access token.');
 return data.token.accessToken;
}

async function toastGet<T>(c:ToastConfig,accessToken:string,path:string){
 const response=await fetch(`${c.host}${path}`,{headers:{authorization:`Bearer ${accessToken}`,'Toast-Restaurant-External-ID':c.restaurantGuid},cache:'no-store'});
 if(!response.ok){const text=(await response.text()).slice(0,500);throw new Error(`Toast request failed ${response.status} for ${path}${text?`: ${text}`:''}`)}
 return await response.json() as T;
}

async function getOrders(c:ToastConfig,accessToken:string,businessDate:string){
 const all:ToastOrder[]=[];const pageSize=100;
 for(let page=1;page<=100;page++){
  const batch=await toastGet<ToastOrder[]>(c,accessToken,`/orders/v2/ordersBulk?businessDate=${ymd(businessDate)}&page=${page}&pageSize=${pageSize}`);
  all.push(...batch);
  if(batch.length<pageSize)break;
  if(page===100)throw new Error('Toast order pagination exceeded the safety limit.');
 }
 return all;
}

export async function fetchToastSnapshot(businessDate:string):Promise<ToastSnapshot>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(businessDate))throw new Error('Business date must be YYYY-MM-DD.');
 const c=config();const accessToken=await token(c);const bd=ymd(businessDate);
 const [employees,timeEntries,cashEntries,deposits,orders]=await Promise.all([
  toastGet<ToastEmployee[]>(c,accessToken,'/labor/v1/employees'),
  toastGet<ToastTimeEntry[]>(c,accessToken,`/labor/v1/timeEntries?businessDate=${bd}`),
  toastGet<ToastCashEntry[]>(c,accessToken,`/cashmgmt/v1/entries?businessDate=${bd}`),
  toastGet<ToastDeposit[]>(c,accessToken,`/cashmgmt/v1/deposits?businessDate=${bd}`),
  getOrders(c,accessToken,businessDate),
 ]);
 const employeeRows=employees.map(e=>({guid:e.guid,external_employee_id:e.externalEmployeeId??null,name:[e.chosenName||e.firstName,e.lastName].filter(Boolean).join(' ').trim()||e.email||e.guid,email:e.email??null,phone:e.phoneNumber??null,deleted:Boolean(e.deleted)}));
 const timeRows=timeEntries.map(t=>({guid:t.guid,employee_guid:t.employeeReference?.guid??'',job_guid:t.jobReference?.guid??null,shift_guid:t.shiftReference?.guid??null,in_date:t.inDate,out_date:t.outDate??null,regular_hours:asNumber(t.regularHours),overtime_hours:asNumber(t.overtimeHours),hourly_wage:t.hourlyWage??null,declared_cash_tips:asNumber(t.declaredCashTips),non_cash_tips:asNumber(t.nonCashTips),cash_gratuity_service_charges:asNumber(t.cashGratuityServiceCharges),non_cash_gratuity_service_charges:asNumber(t.nonCashGratuityServiceCharges),tips_withheld:asNumber(t.tipsWithheld),cash_sales:asNumber(t.cashSales),non_cash_sales:asNumber(t.nonCashSales),auto_clocked_out:Boolean(t.autoClockedOut),deleted:Boolean(t.deleted),created_date:t.createdDate??null,modified_date:t.modifiedDate??null,breaks:(t.breaks??[]).map(b=>({guid:b.guid??'',in_date:b.inDate??null,out_date:b.outDate??null,paid:Boolean(b.paid),missed:Boolean(b.missed),waived:Boolean(b.waived)}))}));
 const payments:Array<Record<string,unknown>>=[];
 for(const order of orders){
  if(!order.guid)continue;
  for(const check of order.checks??[]){for(const payment of check.payments??[]){if(!payment.guid)continue;payments.push({guid:payment.guid,order_guid:order.guid,check_guid:check.guid??null,paid_date:payment.paidDate??null,employee_guid:payment.server?.guid??check.server?.guid??order.server?.guid??null,type:payment.type??null,amount:asNumber(payment.amount),tip_amount:asNumber(payment.tipAmount),refund_amount:asNumber(payment.refund?.refundAmount),tip_refund_amount:asNumber(payment.refund?.tipRefundAmount),payment_status:payment.paymentStatus??null,voided:Boolean(order.voided||payment.voidInfo)})}}
 }
 const cashRows=cashEntries.filter(x=>x.guid&&x.type).map(x=>({guid:x.guid,type:x.type,amount:asNumber(x.amount),date:x.date??null,employee_guid:x.employee?.guid??null,creator_guid:x.creator?.guid??null}));
 const depositRows=deposits.filter(x=>x.guid).map(x=>({guid:x.guid,amount:asNumber(x.amount),date:x.date??null,employee_guid:x.employee?.guid??null,creator_guid:x.creator?.guid??null}));
 return {restaurantGuid:c.restaurantGuid,employees:employeeRows,timeEntries:timeRows,payments,cashEntries:cashRows,deposits:depositRows};
}
