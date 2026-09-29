import { readFileSync, writeFileSync } from "node:fs";
const groups={
 'auth-service':{'auth':'/auth'},
 'organization-service':{'organization':'/organizations','structure':'','membership':'/memberships','invitation':'/invitations','branch':'/branches'},
 'user-service':{'employee':'/employees'},
 'hr-service':{'attendance':'/attendance','leave':'','performance':'/performance-reviews'},
 'project-service':{'project':'/projects','task':'/tasks'},
 'crm-service':{'lead':'/leads','client':'/clients','pipeline':'/pipelines','deal':'/deals'},
 'finance-service':{'invoice':'/invoices','payment':'/payments','expense':'/expenses','reporting':'/reports'},
 'document-service':{'document':'/documents'},
 'notification-service':{'notification':'/notifications'},
 'analytics-service':{'dashboard':'/dashboard'},
 'audit-service':{'audit':'/audit-logs'}
};
const paths={};
for(const [service,routers] of Object.entries(groups))for(const [name,prefix]of Object.entries(routers)){
 const source=readFileSync(`services/${service}/src/routes/${name}.routes.ts`,'utf8');
 for(const match of source.matchAll(/router\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g)){
  const method=match[1];const path='/api'+(prefix+match[2]).replace(/\/$/,'').replace(/:(\w+)/g,'{$1}');
  const parameters=[...path.matchAll(/\{(\w+)\}/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string',format:'uuid'}}));
  const isPublic=prefix==='/auth'&&method==='post';
  (paths[path]??={})[method]={tags:[service],summary:`${method.toUpperCase()} ${path}`,security:isPublic?[]:[{bearerAuth:[]}],parameters,responses:{[method==='post'&&match[2]==='/'?'201':'200']:{description:'Successful operation'},'400':{description:'Invalid input'},'401':{description:'Missing, expired or revoked session'},'403':{description:'Insufficient permission'},'404':{description:'Record not found in this tenant'},'409':{description:'Conflicting state'}}};
 }
}
const document={openapi:'3.0.3',info:{title:'Nexora public API route catalog',version:'0.2.0',description:'Generated from router declarations. Request field schemas remain authoritative in services/*/src/validation. This catalog documents route availability and authentication, not a complete generated client contract.'},servers:[{url:'http://localhost:4000'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}}}};
writeFileSync('docs/openapi.json',JSON.stringify(document,null,2)+'\n');
console.log(`${Object.keys(paths).length} API paths documented.`);
