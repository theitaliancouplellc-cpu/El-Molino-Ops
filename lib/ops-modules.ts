export type OpsKind =
  | 'shift_handoff'|'manager_log'|'daily_recap'|'incident'|'maintenance_ticket'|'equipment'|'equipment_service'|'vendor'
  | 'temperature_log'|'waste_log'|'comp_void_log'|'inventory_count'|'stock_flag'|'order_prep_note'|'menu_availability'
  | 'ingredient'|'recipe'|'allergen'|'emergency_contact'|'training_module'|'training_progress'|'training_quiz'|'certification'
  | 'onboarding'|'acknowledgment'|'announcement'|'cleaning_schedule'|'deep_clean'|'favorite_link'|'saved_search'|'system_note';

export type OpsField = { key:string; label:string; type:'text'|'textarea'|'number'|'date'|'datetime'|'select'|'boolean'; required?:boolean; options?:string[]; min?:number; max?:number; placeholder?:string };
export type OpsModule = { kind:OpsKind; title:string; description:string; category:string; sensitivity:'team'|'manager'|'private'; fields:OpsField[] };

const f=(key:string,label:string,type:OpsField['type']='text',extra:Partial<OpsField>={}):OpsField=>({key,label,type,...extra});

export const OPS_MODULES: OpsModule[] = [
  {kind:'shift_handoff',title:'Shift Handoffs',description:'Structured outgoing-to-incoming manager handoffs.',category:'Shift',sensitivity:'manager',fields:[f('summary','Shift summary','textarea',{required:true}),f('open_items','Open items','textarea'),f('staffing','Staffing notes','textarea'),f('cash_notes','Cash / close notes','textarea')]},
  {kind:'manager_log',title:'Manager Logbook',description:'Searchable daily management notes.',category:'Shift',sensitivity:'manager',fields:[f('body','Manager note','textarea',{required:true}),f('follow_up','Follow-up needed','boolean')]},
  {kind:'daily_recap',title:'Daily Recaps',description:'End-of-day sales, labor and operational recap notes.',category:'Shift',sensitivity:'manager',fields:[f('sales','Sales total','number',{min:0}),f('labor_pct','Labor %','number',{min:0,max:100}),f('guest_notes','Guest / service notes','textarea'),f('wins','Wins','textarea'),f('issues','Issues','textarea')]},
  {kind:'incident',title:'Incident Reports',description:'Document guest, employee, safety and operational incidents.',category:'Safety',sensitivity:'manager',fields:[f('incident_type','Incident type','select',{required:true,options:['Guest','Employee','Safety','Security','Property','Other']}),f('occurred_at_text','When it happened','datetime',{required:true}),f('people','People involved','textarea'),f('details','What happened','textarea',{required:true}),f('action_taken','Action taken','textarea')]},
  {kind:'maintenance_ticket',title:'Maintenance Tickets',description:'Track broken equipment and facility issues through completion.',category:'Maintenance',sensitivity:'team',fields:[f('asset','Equipment / area'),f('problem','Problem','textarea',{required:true}),f('vendor','Vendor / technician'),f('cost','Estimated / actual cost','number',{min:0})]},
  {kind:'equipment',title:'Equipment Registry',description:'Restaurant equipment, serials, models and warranty data.',category:'Maintenance',sensitivity:'team',fields:[f('category','Category'),f('manufacturer','Manufacturer'),f('model','Model'),f('serial','Serial number'),f('location','Physical location'),f('purchase_date','Purchase date','date'),f('warranty_until','Warranty until','date')]},
  {kind:'equipment_service',title:'Service History',description:'Repairs and preventive maintenance tied to equipment.',category:'Maintenance',sensitivity:'team',fields:[f('equipment_name','Equipment','text',{required:true}),f('service_date','Service date','date',{required:true}),f('provider','Service provider'),f('work','Work performed','textarea',{required:true}),f('cost','Cost','number',{min:0})]},
  {kind:'vendor',title:'Vendors',description:'Supplier and service-provider contact directory.',category:'Maintenance',sensitivity:'manager',fields:[f('company','Company','text',{required:true}),f('contact','Contact person'),f('phone','Phone'),f('email','Email'),f('account','Account / customer #'),f('notes','Notes','textarea')]},
  {kind:'temperature_log',title:'Temperature Logs',description:'Food and equipment temperature records.',category:'Food Safety',sensitivity:'team',fields:[f('item','Food / equipment','text',{required:true}),f('temperature','Temperature °F','number',{required:true,min:-50,max:500}),f('limit','Required range'),f('corrective_action','Corrective action','textarea')]},
  {kind:'waste_log',title:'Waste Log',description:'Track wasted product, quantity, cost and cause.',category:'Food Safety',sensitivity:'team',fields:[f('item','Item','text',{required:true}),f('quantity','Quantity','number',{required:true,min:0}),f('unit','Unit'),f('estimated_cost','Estimated cost','number',{min:0}),f('reason','Reason','select',{options:['Spoilage','Overproduction','Mistake','Quality','Dropped','Expired','Other']}),f('notes','Notes','textarea')]},
  {kind:'comp_void_log',title:'Comp / Void Log',description:'Manager record of comps, voids and explanations.',category:'Food Safety',sensitivity:'manager',fields:[f('check_number','Check / order #'),f('amount','Amount','number',{min:0}),f('type','Type','select',{required:true,options:['Comp','Void','Refund']}),f('reason','Reason','textarea',{required:true}),f('approved_by','Approved by')]},
  {kind:'inventory_count',title:'Inventory Counts',description:'Reusable manual count records.',category:'Inventory',sensitivity:'team',fields:[f('item','Item','text',{required:true}),f('count','Count','number',{required:true,min:0}),f('unit','Unit'),f('par','Par','number',{min:0}),f('location','Storage location')]},
  {kind:'stock_flag',title:'Low Stock Flags',description:'Flag product requiring purchase or attention.',category:'Inventory',sensitivity:'team',fields:[f('item','Item','text',{required:true}),f('on_hand','On hand','number',{min:0}),f('par','Par','number',{min:0}),f('needed_by','Needed by','datetime'),f('note','Note','textarea')]},
  {kind:'order_prep_note',title:'Order / Prep Notes',description:'Purchasing and prep planning notes.',category:'Inventory',sensitivity:'team',fields:[f('vendor','Vendor / source'),f('items','Items / prep','textarea',{required:true}),f('needed_by','Needed by','datetime'),f('owner','Responsible person')]},
  {kind:'menu_availability',title:'86 Board',description:'Track unavailable or limited menu items.',category:'Menu',sensitivity:'team',fields:[f('item','Menu item','text',{required:true}),f('state','Availability','select',{required:true,options:['86d','Limited','Back soon','Available']}),f('reason','Reason'),f('expected_back','Expected back','datetime')]},
  {kind:'ingredient',title:'Ingredients',description:'Reusable ingredient records and storage information.',category:'Menu',sensitivity:'team',fields:[f('name','Ingredient name','text',{required:true}),f('unit','Default unit'),f('storage','Storage'),f('shelf_life','Shelf life'),f('notes','Notes','textarea')]},
  {kind:'recipe',title:'Recipes',description:'Ingredients, yields and preparation instructions.',category:'Menu',sensitivity:'manager',fields:[f('yield','Yield'),f('ingredients','Ingredients + quantities','textarea',{required:true}),f('steps','Preparation steps','textarea',{required:true}),f('hold_time','Hold time'),f('plating','Assembly / plating','textarea')]},
  {kind:'allergen',title:'Allergens',description:'Structured allergen and cross-contact notes.',category:'Menu',sensitivity:'team',fields:[f('item','Menu item / ingredient','text',{required:true}),f('allergens','Allergens','textarea',{required:true}),f('cross_contact','Cross-contact notes','textarea'),f('substitution','Possible substitution','textarea')]},
  {kind:'emergency_contact',title:'Emergency Contacts',description:'Protected employee emergency-contact records.',category:'People',sensitivity:'private',fields:[f('employee','Employee','text',{required:true}),f('contact_name','Contact name','text',{required:true}),f('relationship','Relationship'),f('phone','Phone','text',{required:true}),f('notes','Notes','textarea')]},
  {kind:'training_module',title:'Training Modules',description:'Structured learning material for team roles.',category:'People',sensitivity:'team',fields:[f('role','Role'),f('content','Training content','textarea',{required:true}),f('pass_score','Pass score %','number',{min:0,max:100})]},
  {kind:'training_progress',title:'Training Progress',description:'Employee completion and competency tracking.',category:'People',sensitivity:'manager',fields:[f('employee','Employee','text',{required:true}),f('module','Module','text',{required:true}),f('state','Status','select',{required:true,options:['Not started','In progress','Complete','Needs retraining']}),f('score','Score %','number',{min:0,max:100}),f('completed_on','Completed on','date')]},
  {kind:'training_quiz',title:'Training Quizzes',description:'Knowledge-check questions and answer keys.',category:'People',sensitivity:'manager',fields:[f('module','Module'),f('questions','Questions','textarea',{required:true}),f('answer_key','Answer key','textarea',{required:true})]},
  {kind:'certification',title:'Certifications',description:'Track required certifications and expirations.',category:'People',sensitivity:'manager',fields:[f('employee','Employee','text',{required:true}),f('certification','Certification','text',{required:true}),f('issued','Issued','date'),f('expires','Expires','date'),f('credential','Credential #')]},
  {kind:'onboarding',title:'New Hire Onboarding',description:'Step-by-step new-hire onboarding status.',category:'People',sensitivity:'manager',fields:[f('employee','Employee','text',{required:true}),f('stage','Stage','select',{required:true,options:['Paperwork','Orientation','Training','Shadowing','Certified','Complete']}),f('next_step','Next step','textarea'),f('target_date','Target date','date')]},
  {kind:'acknowledgment',title:'Acknowledgments',description:'Record employee acknowledgment of policies or announcements.',category:'People',sensitivity:'manager',fields:[f('employee','Employee','text',{required:true}),f('document','Policy / announcement','text',{required:true}),f('acknowledged_on','Acknowledged on','datetime'),f('note','Note','textarea')]},
  {kind:'announcement',title:'Announcements',description:'Management notices for the restaurant team.',category:'Communication',sensitivity:'team',fields:[f('body','Announcement','textarea',{required:true}),f('audience','Audience','select',{options:['Everyone','Managers','Kitchen','FOH']}),f('expires','Expires','datetime'),f('pinned','Pinned','boolean')]},
  {kind:'cleaning_schedule',title:'Cleaning Schedule',description:'Recurring cleaning responsibilities and standards.',category:'Cleaning',sensitivity:'team',fields:[f('area','Area','text',{required:true}),f('task','Cleaning task','textarea',{required:true}),f('frequency','Frequency','select',{options:['Each shift','Daily','Weekly','Monthly']}),f('standard','Completion standard','textarea')]},
  {kind:'deep_clean',title:'Deep Clean Plan',description:'Periodic deep-clean work beyond shift cleaning.',category:'Cleaning',sensitivity:'team',fields:[f('area','Area','text',{required:true}),f('scope','Scope','textarea',{required:true}),f('frequency','Frequency'),f('last_done','Last completed','date'),f('next_due','Next due','date')]},
  {kind:'favorite_link',title:'Favorites',description:'Pin frequently used internal destinations or records.',category:'Personal',sensitivity:'team',fields:[f('href','App path / reference','text',{required:true}),f('note','Note')]},
  {kind:'saved_search',title:'Saved Searches',description:'Reusable search terms and filters.',category:'Personal',sensitivity:'team',fields:[f('query','Search query','text',{required:true}),f('scope','Scope'),f('filters','Filters','textarea')]},
  {kind:'system_note',title:'System Notes',description:'Internal operational metadata and administrative notes.',category:'System',sensitivity:'manager',fields:[f('body','Note','textarea',{required:true})]},
];

export const OPS_MODULE_BY_KIND = Object.fromEntries(OPS_MODULES.map(m=>[m.kind,m])) as Record<OpsKind,OpsModule>;
export const OPS_CATEGORIES = [...new Set(OPS_MODULES.map(m=>m.category))];

export function validateOpsRecord(kind:OpsKind,title:string,data:Record<string,unknown>){
  const mod=OPS_MODULE_BY_KIND[kind];
  const errors:string[]=[];
  if(!mod) return ['Unknown module.'];
  if(!title.trim()) errors.push('Title is required.');
  if(title.trim().length>200) errors.push('Title must be 200 characters or fewer.');
  for(const field of mod.fields){
    const value=data[field.key];
    const empty=value===undefined||value===null||value===''||value===false;
    if(field.required&&empty) errors.push(`${field.label} is required.`);
    if(field.type==='number'&&value!==''&&value!==undefined&&value!==null){
      const n=Number(value); if(!Number.isFinite(n)) errors.push(`${field.label} must be a number.`);
      if(field.min!==undefined&&n<field.min) errors.push(`${field.label} must be at least ${field.min}.`);
      if(field.max!==undefined&&n>field.max) errors.push(`${field.label} must be at most ${field.max}.`);
    }
  }
  return errors;
}

export function normalizeOpsData(kind:OpsKind,input:Record<string,unknown>){
  const mod=OPS_MODULE_BY_KIND[kind]; const out:Record<string,unknown>={};
  for(const field of mod.fields){
    let v=input[field.key];
    if(field.type==='number'&&v!==''&&v!==undefined&&v!==null) v=Number(v);
    if(field.type==='boolean') v=Boolean(v);
    if(typeof v==='string') v=v.trim().slice(0,12000);
    if(v!==''&&v!==undefined&&v!==null) out[field.key]=v;
  }
  return out;
}
