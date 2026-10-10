(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const STORE_KEY = "horae.v1";
  const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyYmRmttQiamEbZZ_F4NDUK0sTm3-m_MciP-913T8-b59nI3rSiM6hBno3QrjgzGpDT/exec";
  const DEFAULT_SERVICES = [
    {id:"svc-responsable",name:"Responsable",type:"hourly",rate:12,color:"green",active:true},
    {id:"svc-manana",name:"Mañana",type:"hourly",rate:12,color:"blue",active:true}
  ];
  const now = new Date();
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  const fmtMoney = n => new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(Number(n)||0);
  const fmtHours = mins => { const h=Math.floor(mins/60), m=mins%60; return m ? `${h} h ${String(m).padStart(2,"0")} min` : `${h} h`; };
  const fmtDate = s => { if(!s)return "—"; const d=new Date(`${s}T12:00:00`); return new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"short",year:"numeric"}).format(d).replace(".",""); };
  const monthName = key => { const [y,m]=key.split("-").map(Number); return new Intl.DateTimeFormat("es-ES",{month:"long",year:"numeric"}).format(new Date(y,m-1,1)); };
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  let state = loadState();
  let activeMonth = monthKey(now);
  let deferredInstallPrompt = null;
  let toastTimer = null;

  function loadState(){
    try {
      const raw=localStorage.getItem(STORE_KEY);
      if(raw){const parsed=JSON.parse(raw);return {records:Array.isArray(parsed.records)?parsed.records:[],services:Array.isArray(parsed.services)&&parsed.services.length?parsed.services:DEFAULT_SERVICES,profile:parsed.profile||{name:"",company:""},scriptUrl:parsed.scriptUrl||DEFAULT_SCRIPT_URL,timer:parsed.timer||null,connected:Boolean(parsed.connected)};}
    } catch(e){console.warn("No se pudieron leer los datos locales",e);}
    return {records:[],services:DEFAULT_SERVICES.map(x=>({...x})),profile:{name:"",company:""},scriptUrl:DEFAULT_SCRIPT_URL,timer:null,connected:false};
  }
  function persist(){localStorage.setItem(STORE_KEY,JSON.stringify({records:state.records,services:state.services,profile:state.profile,scriptUrl:state.scriptUrl,timer:state.timer||null,connected:Boolean(state.connected)}));}
  function serviceFor(id){return state.services.find(s=>s.id===id)||{name:"Servicio eliminado",type:"hourly",rate:0,fixedAmount:0,color:"green"};}
  function isFixedRecord(r){return r?.billingType==="fixed"||r?.type==="fixed"||serviceFor(r?.serviceId).type==="fixed";}
  function durationMinutes(start,end){if(!start||!end)return 0;const [sh,sm]=start.split(":").map(Number),[eh,em]=end.split(":").map(Number);let diff=eh*60+em-(sh*60+sm);if(diff<=0)diff+=1440;return diff;}
  function recordMinutes(r){return Number.isFinite(r.minutes)?r.minutes:durationMinutes(r.start,r.end);}
  function recordAmount(r){
    if(r.billingType==="fixed" || r.type==="fixed") return Number(r.fixedAmount ?? r.rate ?? 0);
    return recordMinutes(r)/60*Number(r.rate||0);
  }
  function recordsForMonth(key=activeMonth){return state.records.filter(r=>r.date&&r.date.startsWith(key)).sort((a,b)=>b.date.localeCompare(a.date)||(b.start||"").localeCompare(a.start||""));}
  function sumMinutes(records){return records.reduce((a,r)=>a+recordMinutes(r),0);}
  function sumAmount(records){return records.reduce((a,r)=>a+recordAmount(r),0);}
  function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800);}
  function updateConnectionUI(connected=state.connected){state.connected=connected;$("#syncDot").classList.toggle("connected",connected);$("#syncTitle").textContent=connected?"Google Sheets conectado":"Modo local";$("#syncText").textContent=connected?"Sincronización disponible":"Pendiente de conectar Sheets";$("#connectionBadge").textContent=connected?"Conectado":"No conectado";$("#connectionBadge").classList.toggle("connected",connected);}
  function setView(view){$$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${view}`));$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));$("#pageName").textContent=({dashboard:"Resumen",records:"Jornadas",services:"Servicios y tarifas",reports:"Informes",settings:"Configuración"})[view]||"Resumen";if(view==="reports"){if(!$("#reportMonth").value)$("#reportMonth").value=activeMonth;}if(view==="records")renderRecords();if(view==="services")renderServices();window.scrollTo({top:0,behavior:"smooth"});}
  function renderAll(){renderDashboard();renderRecords();renderServices();renderServiceOptions();renderFilters();renderTimer();updateConnectionUI(state.connected);$("#monthTitle").textContent=monthName(activeMonth);$("#todayLabel").textContent=new Intl.DateTimeFormat("es-ES",{weekday:"short",day:"numeric",month:"short"}).format(now);$("#reportMonth").value=activeMonth;$("#settingsName").value=state.profile.name||"";$("#settingsCompany").value=state.profile.company||"";$("#reportName").value=state.profile.name||"";$("#reportBoss").value=state.profile.company||"";$("#scriptUrl").value=state.scriptUrl||"";}
  function renderDashboard(){
    const list=recordsForMonth(), mins=sumMinutes(list), total=sumAmount(list), days=new Set(list.map(r=>r.date)).size;
    $("#statHours").textContent=(mins/60).toLocaleString("es-ES",{maximumFractionDigits:1})+" h";$("#statTotal").textContent=fmtMoney(total);$("#statDays").textContent=days;$("#statDaysFoot").textContent=`${days} ${days===1?"día":"días"} con actividad este mes`;$("#statAverage").textContent=fmtMoney(days?total/days:0);
    const recent=$("#recentRecords");recent.innerHTML="";
    if(!list.length){recent.innerHTML='<div class="empty-state"><div class="empty-icon">◷</div><h3>Todo empieza aquí</h3><p>Registra tu primera jornada del mes.</p><button class="btn btn-primary" id="dashboardEmptyAdd">＋ Añadir jornada</button></div>';$("#dashboardEmptyAdd").addEventListener("click",()=>openRecord());}
    else list.slice(0,5).forEach(r=>{const d=new Date(`${r.date}T12:00:00`),svc=serviceFor(r.serviceId);const row=document.createElement("div");row.className="record-row";row.innerHTML=`<div class="record-date"><b>${d.getDate()}</b><small>${new Intl.DateTimeFormat("es-ES",{month:"short"}).format(d).replace(".","")}</small></div><div class="record-main"><strong>${esc(svc.name)}</strong><small>${(r.billingType==="fixed"||serviceFor(r.serviceId).type==="fixed")?"Importe fijo":`${r.start} – ${r.end} · ${fmtHours(recordMinutes(r))}`}</small></div><div class="record-amount">${fmtMoney(recordAmount(r))}<small>${fmtMoney(r.rate)}/h</small></div>`;recent.appendChild(row);});
    const breakdown=$("#serviceBreakdown");breakdown.innerHTML="";const byService=new Map();list.forEach(r=>{const svc=serviceFor(r.serviceId),v=byService.get(r.serviceId)||{name:svc.name,total:0,minutes:0,color:svc.color};v.total+=recordAmount(r);v.minutes+=recordMinutes(r);byService.set(r.serviceId,v);});const arr=[...byService.values()].sort((a,b)=>b.total-a.total);
    if(!arr.length)breakdown.innerHTML='<p class="settings-help">Todavía no hay servicios registrados este mes.</p>';else arr.forEach(s=>{const el=document.createElement("div");el.innerHTML=`<div class="breakdown-top"><span>${esc(s.name)}</span><span>${fmtMoney(s.total)} · ${(s.minutes/60).toLocaleString("es-ES",{maximumFractionDigits:1})} h</span></div><div class="progress-track"><div class="progress-fill" style="width:${total?Math.max(2,s.total/total*100):0}%;opacity:${s.color==="green"?1:.72}"></div></div>`;breakdown.appendChild(el);});
    $("#breakdownPeriod").textContent=monthName(activeMonth);
  }
  function renderRecords(){
    const query=($("#recordSearch")?.value||"").trim().toLowerCase(),filter=$("#serviceFilter")?.value||"";
    const list=recordsForMonth().filter(r=>{const s=serviceFor(r.serviceId);return (!filter||r.serviceId===filter)&&(!query||s.name.toLowerCase().includes(query)||(r.notes||"").toLowerCase().includes(query));});
    $("#recordsTable").innerHTML="";$("#recordsEmpty").hidden=list.length>0;$("#recordCount").textContent=`${list.length} ${list.length===1?"registro":"registros"}`;
    list.forEach(r=>{const s=serviceFor(r.serviceId),fixed=isFixedRecord(r),tr=document.createElement("tr");tr.innerHTML=`<td>${fmtDate(r.date)}</td><td><span class="service-tag"><i class="service-dot ${s.color}"></i>${esc(s.name)}</span>${r.notes?`<div class="td-muted" style="margin-top:5px;font-size:10px">${esc(r.notes)}</div>`:""}</td><td>${fixed?"Importe fijo":`${esc(r.start||"—")} – ${esc(r.end||"—")}`}</td><td>${fixed?"—":fmtHours(recordMinutes(r))}</td><td>${fixed?"—":`${isFixedRecord(r)?"Importe fijo":`${fmtMoney(r.rate)}/h`}`}</td><td><strong>${fmtMoney(recordAmount(r))}</strong></td><td><div class="row-actions"><button class="small-icon-btn" data-edit="${esc(r.id)}" title="Editar">✎</button><button class="small-icon-btn delete" data-delete="${esc(r.id)}" title="Eliminar">×</button></div></td>`;$("#recordsTable").appendChild(tr);});
    $$('[data-edit]').forEach(b=>b.addEventListener("click",()=>openRecord(b.dataset.edit)));$$('[data-delete]').forEach(b=>b.addEventListener("click",()=>deleteRecord(b.dataset.delete)));
  }
  function renderServiceOptions(){
    const opts=state.services.filter(s=>s.active!==false).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
    $("#recordService").innerHTML=opts||'<option value="">Crea primero un servicio</option>';
    const timerSelect=$("#timerService"), previous=timerSelect.value;
    timerSelect.innerHTML=opts||'<option value="">Crea primero un servicio</option>';
    if(state.timer)timerSelect.value=state.timer.serviceId;else if(previous&&state.services.some(s=>s.id===previous))timerSelect.value=previous;
  }
  function renderFilters(){
    const old=$("#serviceFilter").value;$("#serviceFilter").innerHTML='<option value="">Todos los servicios</option>'+state.services.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");$("#serviceFilter").value=old;
  }
  function renderServices(){
    const root=$("#serviceCards");root.innerHTML="";
    state.services.forEach(s=>{const count=state.records.filter(r=>r.serviceId===s.id).length,card=document.createElement("article");card.className="service-card";card.innerHTML=`<div class="service-card-top"><div class="service-emblem ${s.color}">${s.color==="blue"?"◈":s.color==="purple"?"◇":s.color==="orange"?"◉":"✳"}</div><span class="period-pill">${count} ${count===1?"registro":"registros"}</span></div><h3>${esc(s.name)}</h3><div class="service-rate">${fmtMoney(s.type==="fixed" ? (s.fixedAmount||0) : (s.rate||0))} <small>${s.type==="fixed" ? "/ servicio" : "/ hora"}</small></div><div class="service-meta">${s.type==="fixed" ? "Importe fijo por cada registro" : "Tarifa aplicada a los nuevos registros"}</div><div class="service-card-actions"><button class="btn btn-secondary" data-service-edit="${s.id}">Editar</button><button class="btn btn-secondary" data-service-delete="${s.id}">Eliminar</button></div>`;root.appendChild(card);});
    if(!state.services.length)root.innerHTML='<div class="empty-state"><h3>No hay servicios</h3><p>Añade un servicio para empezar.</p></div>';
    $$("[data-service-edit]").forEach(b=>b.addEventListener("click",()=>openService(b.dataset.serviceEdit)));$$("[data-service-delete]").forEach(b=>b.addEventListener("click",()=>deleteService(b.dataset.serviceDelete)));
  }
  function openRecord(id=null){
    $("#recordForm").reset();$("#recordError").textContent="";$("#recordId").value=id||"";renderServiceOptions();
    const r=id?state.records.find(x=>x.id===id):null;
    $("#recordDialogTitle").textContent=r?"Editar registro":"Nuevo registro";
    $("#recordDate").value=r?.date||isoDate();$("#recordNotes").value=r?.notes||"";
    if(r){$("#recordService").value=r.serviceId;$("#recordRate").value=Number(r.rate||0);$("#recordFixedAmount").value=Number(r.fixedAmount ?? (serviceFor(r.serviceId).fixedAmount||150));$("#recordStart").value=(r.start&&r.start!=="—")?r.start:"";$("#recordEnd").value=(r.end&&r.end!=="—")?r.end:"";}
    else {const svc=state.services.find(x=>x.active!==false)||state.services[0];$("#recordService").value=svc?.id||"";$("#recordRate").value=svc?.rate??12;$("#recordFixedAmount").value=svc?.fixedAmount??150;$("#recordStart").value="19:00";$("#recordEnd").value="22:00";}
    updateRecordBillingFields();updateDurationPreview();$("#recordDialog").showModal();
  }
  function updateRecordBillingFields(){
    const svc=serviceFor($("#recordService").value),fixed=svc.type==="fixed";
    $("#recordRateField").hidden=fixed;$("#recordFixedAmountField").hidden=!fixed;
    $("#recordStartField").hidden=fixed;$("#recordEndField").hidden=fixed;
    $("#recordRate").required=!fixed;$("#recordFixedAmount").required=fixed;
    $("#recordStart").required=!fixed;$("#recordEnd").required=!fixed;
    if(fixed&&!(Number($("#recordFixedAmount").value)>0))$("#recordFixedAmount").value=svc.fixedAmount??150;
    if(!fixed&&(!$("#recordStart").value||!$("#recordEnd").value)){$("#recordStart").value="19:00";$("#recordEnd").value="22:00";}
  }
  function updateDurationPreview(){
    const fixed=serviceFor($("#recordService").value).type==="fixed";
    if(fixed){$("#durationPreview").textContent="No computa horas";$("#amountPreview").textContent=fmtMoney(Number($("#recordFixedAmount").value)||0);return;}
    const mins=durationMinutes($("#recordStart").value,$("#recordEnd").value),rate=Number($("#recordRate").value)||0;
    $("#durationPreview").textContent=fmtHours(mins);$("#amountPreview").textContent=fmtMoney(mins/60*rate);
  }
  function deleteRecord(id){const r=state.records.find(x=>x.id===id);if(!r)return;if(!confirm(`¿Eliminar la jornada del ${fmtDate(r.date)}?`))return;state.records=state.records.filter(x=>x.id!==id);persist();renderAll();queueSync();toast("Jornada eliminada");}
  function openService(id=null){
    $("#serviceForm").reset();$("#serviceError").textContent="";
    const s=id?state.services.find(x=>x.id===id):null;
    $("#serviceId").value=id||"";$("#serviceDialogTitle").textContent=s?"Editar servicio":"Nuevo servicio";
    $("#serviceName").value=s?.name||"";$("#serviceType").value=s?.type||"hourly";
    $("#serviceRate").value=s?.rate??12;$("#serviceFixedAmount").value=s?.fixedAmount??150;
    $("#serviceColor").value=s?.color||"green";updateServiceBillingFields();$("#serviceDialog").showModal();
  }
  function updateServiceBillingFields(){
    const fixed=$("#serviceType").value==="fixed";
    $("#serviceRateField").hidden=fixed;$("#serviceFixedAmountField").hidden=!fixed;
    $("#serviceRate").required=!fixed;$("#serviceFixedAmount").required=fixed;
  }
  function deleteService(id){const s=serviceFor(id),used=state.records.some(r=>r.serviceId===id);if(used){if(!confirm(`Hay jornadas asociadas a “${s.name}”. Si lo eliminas, esas jornadas conservarán su importe pero mostrarán “Servicio eliminado”. ¿Continuar?`))return;}else if(!confirm(`¿Eliminar el servicio “${s.name}”?`))return;state.services=state.services.filter(x=>x.id!==id);persist();renderAll();queueSync();toast("Servicio eliminado");}
  function esc(str){return String(str??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function api(action,payload={}){
    if(!state.scriptUrl)throw new Error("Añade primero la URL de Apps Script en Configuración.");
    const url=state.scriptUrl.trim();const response=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...payload})});
    if(!response.ok)throw new Error(`Error de conexión (${response.status}).`);
    const data=await response.json();if(!data.ok)throw new Error(data.error||"Apps Script ha devuelto un error.");return data;
  }
  let syncTimeout=null;
  function queueSync(){if(!state.scriptUrl)return;clearTimeout(syncTimeout);syncTimeout=setTimeout(()=>syncToCloud(false),900);}
  async function syncToCloud(showMessage=true){
    if(!state.scriptUrl){if(showMessage)toast("Configura la URL de Apps Script primero.");return;}
    const btn=$("#connectBtn");btn.disabled=true;btn.textContent="Sincronizando…";
    try{
      const result=await api("sync",{data:{records:state.records,services:state.services,profile:state.profile}});
      if(result.data){state.records=Array.isArray(result.data.records)?result.data.records:state.records;state.services=Array.isArray(result.data.services)&&result.data.services.length?result.data.services:state.services;state.profile=result.data.profile||state.profile;persist();}
      state.connected=true;persist();renderAll();if(showMessage)toast("Google Sheets sincronizado correctamente.");
    }catch(e){state.connected=false;persist();updateConnectionUI(false);if(showMessage)toast(e.message||"No se pudo conectar.");console.error(e);}
    finally{btn.disabled=false;btn.textContent="Conectar y sincronizar";}
  }
  function makeReport(key,name,company){
    const list=recordsForMonth(key).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.start||"").localeCompare(b.start||""));
    const mins=sumMinutes(list),total=sumAmount(list),days=new Set(list.map(r=>r.date)).size;
    const rows=list.map(r=>{const s=serviceFor(r.serviceId);return `<tr><td>${fmtDate(r.date)}</td><td>${esc(s.name)}</td><td>${isFixedRecord(r)?"Importe fijo":`${r.start} – ${r.end}`}</td><td>${isFixedRecord(r)?"—":fmtHours(recordMinutes(r))}</td><td>${isFixedRecord(r)?"—":fmtMoney(r.rate)+"/h"}</td><td>${fmtMoney(recordAmount(r))}</td></tr>`;}).join("");
    const serviceTotals=new Map();list.forEach(r=>{const s=serviceFor(r.serviceId),old=serviceTotals.get(r.serviceId)||{name:s.name,minutes:0,total:0};old.minutes+=recordMinutes(r);old.total+=recordAmount(r);serviceTotals.set(r.serviceId,old);});
    const summary=[...serviceTotals.values()].map(s=>`<tr><td>${esc(s.name)}</td><td>${fmtHours(s.minutes)}</td><td>${fmtMoney(s.total)}</td></tr>`).join("");
    return `<div class="report-document"><div class="report-brand"><div><strong>HORAE</strong><small>CONTROL HORARIO · INFORME MENSUAL</small></div><div class="report-month"><strong>${esc(monthName(key))}</strong><p>Generado el ${fmtDate(isoDate())}</p></div></div><h2>Informe de jornadas</h2><p>Trabajador: <strong>${esc(name||"No especificado")}</strong><br>${company?`Responsable / empresa: <strong>${esc(company)}</strong><br>`:""}Periodo: ${esc(monthName(key))}</p><div class="report-summary"><div><small>Horas registradas</small><strong>${(mins/60).toLocaleString("es-ES",{maximumFractionDigits:2})} h</strong></div><div><small>Jornadas</small><strong>${days}</strong></div><div><small>Importe estimado</small><strong>${fmtMoney(total)}</strong></div></div><h3 style="font-size:14px;margin:28px 0 10px">Detalle de jornadas</h3><table><thead><tr><th>FECHA</th><th>SERVICIO</th><th>HORARIO</th><th>DURACIÓN</th><th>TARIFA</th><th>IMPORTE</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No hay jornadas registradas en este periodo.</td></tr>'}</tbody></table><h3 style="font-size:14px;margin:28px 0 10px">Resumen por servicio</h3><table><thead><tr><th>SERVICIO</th><th>HORAS</th><th>IMPORTE</th></tr></thead><tbody>${summary||'<tr><td colspan="3">Sin actividad</td></tr>'}</tbody></table><div class="report-total">TOTAL DEL MES: ${fmtMoney(total)}</div><div class="report-signature"><div>Firma del trabajador</div><div>Conformidad del responsable</div></div><p style="font-size:9px;margin-top:35px">Documento generado con HORAE. Los importes son estimaciones calculadas a partir de las tarifas configuradas y deben revisarse antes de su validación.</p></div>`;
  }
  function showReport(){const key=$("#reportMonth").value||activeMonth;$("#reportPreview").innerHTML=`<div class="report-actions"><button class="btn btn-primary" id="printReport">Imprimir / Guardar como PDF ↗</button></div>`+makeReport(key,$("#reportName").value.trim()||state.profile.name,$("#reportBoss").value.trim()||state.profile.company);$("#printReport")?.addEventListener("click",()=>window.print());$("#reportPreview").scrollIntoView({behavior:"smooth",block:"start"});}
  function exportJSON(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records:state.records,services:state.services,profile:state.profile,timer:state.timer||null},null,2)],{type:"application/json"});downloadBlob(blob,`horae-copia-${isoDate()}.json`);}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}

  let timerTick = null;
  function elapsedTimerMs(){return state.timer ? Math.max(0, Date.now()-Number(state.timer.startedAt)) : 0;}
  function renderTimer(){
    const running=!!state.timer;
    $("#timerService").disabled=running;
    $("#timerStart").hidden=running;
    $("#timerStop").hidden=!running;
    $("#timerClock").textContent=running?new Date(elapsedTimerMs()).toISOString().slice(11,19):"00:00:00";
    $("#timerTitle").textContent=running?"Jornada en curso":"¿Empezamos una jornada?";
    $("#timerDescription").textContent=running?`${serviceFor(state.timer.serviceId).name} · Inicio ${state.timer.start} · ${fmtDate(state.timer.date)}`:"Inicia el cronómetro y guarda la jornada al terminar.";
    $(".timer-panel").classList.toggle("running",running);
    if(timerTick)clearInterval(timerTick);
    if(running)timerTick=setInterval(()=>{$("#timerClock").textContent=new Date(elapsedTimerMs()).toISOString().slice(11,19);},1000);
  }
  function startTimer(){
    if(state.timer){toast("Ya hay una jornada en curso.");return;}
    const serviceId=$("#timerService").value, svc=serviceFor(serviceId);
    if(!serviceId){toast("Crea o selecciona un servicio primero.");return;}
    const d=new Date();
    state.timer={serviceId,startedAt:d.getTime(),date:isoDate(d),start:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`,rate:Number(svc.rate)||0};
    persist();renderTimer();toast("Cronómetro iniciado");
  }
  function stopTimer(){
    if(!state.timer)return;
    const timer=state.timer, endDate=new Date(), elapsedRaw=(endDate.getTime()-Number(state.timer.startedAt));
    const elapsed=Math.max(1,Math.round((endDate.getTime()-Number(timer.startedAt))/60000));
    if(elapsed>24*60){toast("La jornada supera 24 horas. Revisa el registro manualmente.");return;}
    const startMinutes=Number(timer.start.slice(0,2))*60+Number(timer.start.slice(3,5));
    const endMinutes=(startMinutes+elapsed)%1440;
    const end=`${String(Math.floor(endMinutes/60)).padStart(2,"0")}:${String(endMinutes%60).padStart(2,"0")}`;
    const item={id:uid("rec"),date:timer.date,start:timer.start,end,rate:Number(timer.rate)||0,serviceId:timer.serviceId,minutes:elapsed,notes:"Registrado con cronómetro"};
    state.records.push(item);state.timer=null;activeMonth=monthKey(new Date(`${item.date}T12:00:00`));persist();renderAll();renderTimer();queueSync();toast(`Jornada guardada · ${fmtHours(elapsed)}`);
  }
  function exportCSV(){
    const list=recordsForMonth().slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.start||"").localeCompare(b.start||""));
    const headers=["Fecha","Servicio","Hora inicio","Hora fin","Duración (minutos)","Tarifa €/h","Importe €","Notas"];
    const rows=list.map(r=>[r.date,serviceFor(r.serviceId).name,isFixedRecord(r)?"":""+r.start,isFixedRecord(r)?"":""+r.end,recordMinutes(r),isFixedRecord(r)?"":Number(r.rate||0).toFixed(2),recordAmount(r).toFixed(2),r.notes||""]);
    const csv=[headers,...rows].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
    downloadBlob(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),`horae-jornadas-${activeMonth}.csv`);
    toast("CSV mensual exportado");
  }

  function bind(){
    $$("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));$$("[data-goto]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.goto)));
    $("#prevMonth").addEventListener("click",()=>{const [y,m]=activeMonth.split("-").map(Number);activeMonth=monthKey(new Date(y,m-2,1));renderAll();});
    $("#nextMonth").addEventListener("click",()=>{const [y,m]=activeMonth.split("-").map(Number);activeMonth=monthKey(new Date(y,m,1));renderAll();});
    ["newRecordTop","newRecordRecords","quickAdd","emptyAdd"].forEach(id=>$("#"+id)?.addEventListener("click",()=>openRecord()));
    $("#newServiceBtn").addEventListener("click",()=>openService());
    $("#timerStart").addEventListener("click",startTimer);
    $("#timerStop").addEventListener("click",stopTimer);
    $("#csvBackupBtn").addEventListener("click",exportCSV);
    ["recordStart","recordEnd","recordRate"].forEach(id=>$("#"+id).addEventListener("input",updateDurationPreview));
    $("#recordService").addEventListener("change",()=>{const s=serviceFor($("#recordService").value);$("#recordRate").value=s.rate||0;$("#recordFixedAmount").value=s.fixedAmount??150;updateRecordBillingFields();updateDurationPreview();});
    $("#recordFixedAmount").addEventListener("input",updateDurationPreview);
    $("#serviceType").addEventListener("change",updateServiceBillingFields);
    $("#recordForm").addEventListener("submit",e=>{e.preventDefault();const id=$("#recordId").value,date=$("#recordDate").value,start=$("#recordStart").value,end=$("#recordEnd").value,serviceId=$("#recordService").value,svc=serviceFor(serviceId),fixed=svc.type==="fixed";
      const rate= fixed ? 0 : Number($("#recordRate").value);
      const fixedAmount= fixed ? Number($("#recordFixedAmount").value) : 0;
      if(!date||!serviceId||(fixed?(!Number.isFinite(fixedAmount)||fixedAmount<0):(!start||!end||!Number.isFinite(rate)||rate<0))){$("#recordError").textContent="Revisa los campos obligatorios y el importe.";return;}
      if(!fixed&&start===end){$("#recordError").textContent="La hora de inicio y fin no pueden ser iguales.";return;}
      const minutes=fixed?0:durationMinutes(start,end);
      if(!fixed&&(minutes<=0||minutes>1440)){ $("#recordError").textContent="No se ha podido calcular la duración.";return;}
      const item={id:id||uid("rec"),date,start:fixed?"—":start,end:fixed?"—":end,rate,serviceId,minutes,billingType:fixed?"fixed":"hourly",fixedAmount:fixed?fixedAmount:0,notes:$("#recordNotes").value.trim()};if(id)state.records=state.records.map(r=>r.id===id?item:r);else state.records.push(item);activeMonth=monthKey(new Date(`${date}T12:00:00`));persist();$("#recordDialog").close();renderAll();queueSync();toast(id?"Jornada actualizada":"Jornada guardada correctamente");});
    $("#serviceForm").addEventListener("submit",e=>{e.preventDefault();const id=$("#serviceId").value,name=$("#serviceName").value.trim(),rate=Number($("#serviceRate").value);const billingType=$("#serviceType").value,fixedAmount=Number($("#serviceFixedAmount").value);
      if(!name||(billingType==="hourly"&&(!Number.isFinite(rate)||rate<0))||(billingType==="fixed"&&(!Number.isFinite(fixedAmount)||fixedAmount<0))){$("#serviceError").textContent="Introduce un nombre y un importe válido.";return;}if(state.services.some(s=>s.name.toLowerCase()===name.toLowerCase()&&s.id!==id)){$("#serviceError").textContent="Ya existe un servicio con ese nombre.";return;}const old=state.services.find(s=>s.id===id);const type=billingType;
      const item={id:id||uid("svc"),name,type,rate:type==="hourly"?rate:0,fixedAmount:type==="fixed"?fixedAmount:0,color:$("#serviceColor").value,active:true};if(old)state.services=state.services.map(s=>s.id===id?item:s);else state.services.push(item);persist();$("#serviceDialog").close();renderAll();queueSync();toast("Servicio guardado");});
    $$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).close()));
    $("#recordSearch").addEventListener("input",renderRecords);$("#serviceFilter").addEventListener("change",renderRecords);
    $("#exportMonth").addEventListener("click",()=>{setView("reports");$("#reportMonth").value=activeMonth;showReport();});$("#generateReport").addEventListener("click",showReport);
    $("#saveProfile").addEventListener("click",()=>{state.profile={name:$("#settingsName").value.trim(),company:$("#settingsCompany").value.trim()};persist();$("#reportName").value=state.profile.name;$("#reportBoss").value=state.profile.company;queueSync();toast("Perfil guardado");});
    $("#connectBtn").addEventListener("click",async()=>{state.scriptUrl=$("#scriptUrl").value.trim();persist();if(!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(state.scriptUrl)){toast("Pega una URL válida de una aplicación web de Apps Script.");return;}if(!state.records.length&&!confirm("La sincronización inicial enviará los datos locales a la hoja HORAE. Si ya tienes registros en la hoja, no se importarán automáticamente. ¿Continuar?"))return;await syncToCloud(true);});
    $("#disconnectBtn").addEventListener("click",()=>{state.connected=false;persist();updateConnectionUI(false);toast("Sincronización pausada. Tus datos locales siguen guardados.");});
    $("#backupBtn").addEventListener("click",exportJSON);
    $("#restoreInput").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.records)||!Array.isArray(data.services))throw new Error("Formato no válido");if(!confirm("Importar la copia reemplazará los registros, servicios y perfil locales actuales. ¿Continuar?"))return;state.records=data.records;state.services=data.services;state.profile=data.profile||{name:"",company:""};state.timer=data.timer||null;persist();renderAll();queueSync();toast("Copia importada correctamente");}catch(err){toast("No se ha podido importar la copia JSON.");}finally{e.target.value="";}});
    $("#clearLocalBtn").addEventListener("click",()=>{if(!confirm("Esto eliminará los datos guardados en este dispositivo. ¿Has descargado una copia de seguridad?"))return;localStorage.removeItem(STORE_KEY);state={records:[],services:DEFAULT_SERVICES.map(x=>({...x})),profile:{name:"",company:""},scriptUrl:"",connected:false};persist();renderAll();toast("Datos locales eliminados");});
    $("#installBtn").addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("#installBtn").hidden=true;});
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;$("#installBtn").hidden=false;});
    window.addEventListener("online",()=>{if(state.scriptUrl)syncToCloud(false);});window.addEventListener("offline",()=>toast("Sin conexión. Los datos locales siguen disponibles."));
  }
  bind();renderAll();
  if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker no disponible",e));
})();