const T={sensors:"smartroom/sensors",mode:"smartroom/mode",alerts:"smartroom/alerts",status:"smartroom/status"};
let client=null, mode="normal", alerts=[], samples=[], previousSensorAlerts={smoke:false,ir:false,ldr:false};
const $=id=>document.getElementById(id);
const notes={normal:"Normal mode keeps smoke monitoring active. IR and LDR are disabled.",meeting:"Meeting mode monitors smoke and intrusion. LDR is disabled.",vacation:"Vacation monitors smoke and intrusion; LDR activates after 6:30 PM IST."};
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.remove("show"),3000)}
function settings(open=true){$("modal").classList.toggle("open",open)}
function closeAlertPopup(){$("alertPopup").classList.remove("open")}
$("alertPopupClose").onclick=closeAlertPopup;
$("alertPopupAck").onclick=closeAlertPopup;
$("alertPopup").onclick=e=>{if(e.target===$("alertPopup"))closeAlertPopup()};
function showAlertPopup(a){
 const type=String(a.type||a.sensor||"SmartRoom alert").replace(/[_-]/g," ");
 const sensor=String(a.sensor||a.type||"Sensor").replace(/[_-]/g," ");
 const severity=String(a.severity||"warning").toUpperCase();
 $("popupTitle").textContent=type+" detected!";
 $("popupMessage").textContent=a.message||("SmartRoom detected an event from "+sensor+". Please check the room.");
 $("popupDetails").innerHTML=`<span><b>Sensor</b>${esc(sensor)}</span><span><b>Mode</b>${esc(a.mode||mode)}</span><span><b>Reading</b>${esc(a.value??"—")}</span><span><b>Severity</b>${esc(severity)}</span>`;
 $("alertPopup").classList.add("open");
 toast("🚨 SmartRoom alert: "+type);
 try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){const ctx=new AC();[0,1,2].forEach(i=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=i===1?880:660;gain.gain.setValueAtTime(.0001,ctx.currentTime+i*.18);gain.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+i*.18+.02);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.18+.13);osc.start(ctx.currentTime+i*.18);osc.stop(ctx.currentTime+i*.18+.14)});setTimeout(()=>ctx.close(),1000)}}catch(e){console.debug("Alert sound unavailable",e)}
}
$("settingsBtn").onclick=()=>settings();$("close").onclick=()=>settings(false);$("modal").onclick=e=>{if(e.target===$("modal"))settings(false)};
$("form").onsubmit=e=>{e.preventDefault();connect()};
function connect(){
 if(!window.mqtt){$("error").textContent="MQTT.js couldn't load. Check internet and refresh.";return}
 if(client)client.end(true);
 const host=$("host").value.trim(),port=$("port").value,path=$("path").value||"/mqtt";
 const url=`wss://${host}:${port}${path.startsWith("/")?path:"/"+path}`;
 $("error").textContent="Connecting…";
 client=mqtt.connect(url,{username:$("user").value,password:$("pass").value,clientId:"SmartRoomWeb_"+Math.random().toString(16).slice(2,9),clean:true,keepalive:60,connectTimeout:10000,reconnectPeriod:3000,protocolVersion:4});
 client.on("connect",()=>{ $("error").textContent="";$("dot").classList.add("on");$("connText").textContent="Connected";$("web").textContent="Connected";$("applyMode").disabled=false;client.subscribe([T.sensors,T.alerts,T.status],{qos:0});settings(false);$("pass").value="";toast("Connected! Listening for SmartRoom data.")});
 client.on("reconnect",()=>{$("connText").textContent="Reconnecting…";$("web").textContent="Reconnecting…"});
 client.on("close",()=>{$("dot").classList.remove("on");$("connText").textContent="Disconnected";$("web").textContent="Disconnected";$("applyMode").disabled=true});
 client.on("error",err=>{$("error").textContent="Connection error: "+(err.message||"Check endpoint, credentials and EMQX permissions.");console.error(err)});
 client.on("message",(topic,payload)=>{const text=payload.toString();if(topic===T.sensors){try{const d=JSON.parse(text);render(d);samples.push({smoke:+d.smoke,ldr:+d.ldr});if(samples.length>20)samples.shift();draw()}catch(e){console.warn("Bad sensor JSON",text)}}else if(topic===T.alerts){try{const a=JSON.parse(text);alerts.unshift({...a,time:new Date()});if(alerts.length>50)alerts.pop();renderAlerts()}catch(e){}}else if(topic===T.status){$("device").textContent=text.toLowerCase()==="online"?"ESP32 online":"ESP32 offline"}});
}
function render(d){
 const smoke=+d.smoke,ldr=+d.ldr,sm=!!d.smokeAlert,ir=!!d.irAlert,la=!!d.ldrAlert,led=!!d.led;
 const newlyActive=[];
 if(sm&&!previousSensorAlerts.smoke)newlyActive.push({type:"Smoke alert",sensor:"MQ-2 smoke sensor",value:smoke,mode:d.mode,severity:"critical"});
 if(ir&&!previousSensorAlerts.ir)newlyActive.push({type:"Intrusion alert",sensor:"IR intrusion sensor",value:d.ir===undefined?"Detected":d.ir?"Detected":"Alert",mode:d.mode,severity:"warning"});
 if(la&&!previousSensorAlerts.ldr)newlyActive.push({type:"Light alert",sensor:"LDR light sensor",value:ldr,mode:d.mode,severity:"warning"});
 previousSensorAlerts={smoke:sm,ir,ldr:la};
 if(newlyActive.length)showAlertPopup(newlyActive[0]);
 $("smoke").textContent=Number.isFinite(smoke)?smoke:"--";$("ir").textContent=d.ir===undefined?"--":d.ir?"DETECTED":"CLEAR";$("ldr").textContent=Number.isFinite(ldr)?ldr:"--";$("led").textContent=led?"ON":"OFF";
 $("smokeTh").textContent=d.smokeThreshold??"—";$("ldrTh").textContent=d.ldrThreshold??"—";$("irEnabled").textContent=d.irEnabled?"Enabled":"Disabled";
 badge("smokeBadge",sm?"ALERT":"NORMAL",sm);badge("irBadge",ir?"ALERT":"CLEAR",ir);badge("ldrBadge",la?"ALERT":"NORMAL",la);badge("ledBadge",led?"ACTIVE":"OFF",led);
 $("smokeText").textContent=sm?"Smoke alert detected":"Below configured threshold";$("irText").textContent=ir?"Intrusion detected":d.irEnabled?"No intrusion detected":"Monitoring disabled";$("ldrText").textContent=la?"Light detected during Vacation":d.ldrEnabled?"No light alert":"Monitoring disabled";$("ledText").textContent=led?"Alert LED is active":"No active alert";$("alertState").textContent=led?"Active":"Clear";
 // Show the ESP32's reported mode without changing the user's pending selection.
 $("modeChip").textContent=(d.mode||"UNKNOWN").toUpperCase();
 $("wifi").textContent=d.wifiConnected?"Connected":"Disconnected";$("mqtt").textContent=d.mqttConnected?"Connected":"Disconnected";$("timeWindow").textContent=d.ldrTimeWindowActive?"Active":"Inactive";
 $("device").textContent=d.mqttConnected?"ESP32 online":"ESP32 status unavailable";const now=new Date().toLocaleTimeString("en-IN");$("last").textContent="Last message "+now;$("updated").textContent="Updated "+now;$("sensorTime").textContent=now;
}
function badge(id,text,alert){$(id).textContent=text;$(id).classList.toggle("alert",alert)}
document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>selectMode(b.dataset.mode,true));
function selectMode(m,clicked){if(!["normal","meeting","vacation"].includes(m))return;mode=m;document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("selected",b.dataset.mode===m));$("modeChip").textContent=m.toUpperCase();$("modeNote").textContent=notes[m];if(clicked)$("modeStatus").textContent="Ready to send "+m.toUpperCase()}
$("applyMode").onclick=()=>{if(!client||!client.connected){settings();return}client.publish(T.mode,mode,{qos:1},err=>{if(err)toast("Mode command failed");else{$("modeStatus").textContent="Sent "+mode.toUpperCase()+" — waiting for ESP32";toast("Mode command sent: "+mode)}})};
function esc(s){return String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function renderAlerts(){if(!alerts.length){$("alertRows").innerHTML='<div class="empty"><b>No alerts yet</b><span>ESP32 alerts will appear here.</span></div>';return}
 $("alertRows").innerHTML=alerts.slice(0,12).map(a=>`<div class="alertrow"><b>${esc(a.type||"SmartRoom alert")}</b><span>${esc(a.sensor)}</span><span>${esc(a.mode)}</span><span>${esc(a.value)}</span><span>${(a.time||new Date()).toLocaleTimeString("en-IN")}</span><span class="severity">${esc((a.severity||"warning").toUpperCase())}</span></div>`).join("")}
$("clear").onclick=()=>{if(alerts.length&&confirm("Clear alerts from this browser session?")){alerts=[];renderAlerts();toast("Alert list cleared")}};
function draw(){const c=$("chart"),ctx=c.getContext("2d"),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;c.width=r.width*dpr;c.height=230*dpr;ctx.scale(dpr,dpr);const w=r.width,h=230;ctx.clearRect(0,0,w,h);if(!samples.length)return;const p={l:35,r:10,t:10,b:25},cw=w-p.l-p.r,ch=h-p.t-p.b;ctx.font="10px Manrope";ctx.fillStyle="#657a91";ctx.strokeStyle="#223146";for(let i=0;i<=4;i++){let y=p.t+ch*i/4;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillText(Math.round(4095*(1-i/4)),2,y+3)}for(const [key,color] of [["smoke","#ffb86b"],["ldr","#65a5ff"]]){ctx.beginPath();samples.forEach((v,i)=>{let x=p.l+(samples.length===1?0:i/(samples.length-1))*cw,y=p.t+ch*(1-Math.max(0,Math.min(4095,v[key]))/4095);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()}}
setInterval(()=>{$("clock").textContent=new Date().toLocaleTimeString("en-IN",{hour12:false,timeZone:"Asia/Kolkata"})},1000);
$("clock").textContent=new Date().toLocaleTimeString("en-IN",{hour12:false,timeZone:"Asia/Kolkata"});renderAlerts();settings();
