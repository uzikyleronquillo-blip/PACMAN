const socket = io();
const app = document.getElementById("app");
let state = {mode:null,code:null,player:null,players:[],question:null,roundActive:false,remaining:20};

const monsters = [
  {x:25,y:25,c:"#ff4e67"},{x:75,y:25,c:"#ff69b4"},
  {x:25,y:65,c:"#35a7ff"},{x:75,y:65,c:"#ff9f43"},{x:50,y:48,c:"#b66cff"}
];

function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function page(html){app.innerHTML=html;}
function home(){
 page(`<div class="screen"><div class="card">
 <div class="title">PAC-STYLE<br>CAREER MAZE</div>
 <p class="subtitle">Multiplayer arcade maze chase + career quiz</p>
 <div style="text-align:center;margin-top:25px">
 <button class="btn" onclick="host()">👨‍🏫 HOST GAME</button>
 <button class="btn alt" onclick="joinForm()">📱 JOIN GAME</button>
 </div>
 <p class="small" style="text-align:center">4–5 players • 10 questions • 20 seconds per round</p>
 </div></div>`);
}
function host(){
 state.mode="host";
 page(`<div class="screen"><div class="card">
 <div class="title">HOST LOBBY</div><div id="hostLobby" style="text-align:center">Creating room...</div>
 </div></div>`);
 socket.emit("host:create");
}
socket.on("host:created", d=>{
 state.code=d.code;
 document.getElementById("hostLobby").innerHTML=`
 <h2>ROOM CODE: <strong>${d.code}</strong></h2>
 <img class="qr" src="${d.qr}" alt="QR code">
 <p class="small">Students scan this QR code or open the join link.</p>
 <p style="word-break:break-all">${esc(d.joinUrl)}</p>
 <div id="hostPlayers" class="players"></div>
 <button id="startBtn" class="btn" onclick="startGame()">🚀 START GAME</button>
 <button class="btn danger" onclick="location.reload()">CLOSE</button>`;
});
function joinForm(){
 const params=new URLSearchParams(location.search);
 const room=params.get("room")||"";
 state.mode="player";
 page(`<div class="screen"><div class="card" style="text-align:center">
 <div class="title" style="font-size:42px">JOIN GAME</div>
 <input id="room" maxlength="5" placeholder="ROOM CODE" value="${esc(room.toUpperCase())}">
 <input id="name" maxlength="18" placeholder="PLAYER NAME">
 <br><button class="btn alt" onclick="join()">JOIN ROOM</button>
 <p id="joinError" class="small"></p>
 </div></div>`);
}
function join(){
 const code=document.getElementById("room").value.trim().toUpperCase();
 const name=document.getElementById("name").value.trim();
 socket.emit("player:join",{code,name},r=>{
   if(!r.ok){document.getElementById("joinError").textContent=r.error;return;}
   state.code=r.code; state.player=r.player;
   page(`<div class="screen"><div class="card" style="text-align:center">
    <div class="title" style="font-size:42px">READY!</div>
    <h2>${esc(r.player.name)}</h2><p>Your character is ready.</p>
    <div class="player-chip" style="display:inline-block;background:${r.player.color}">● ${esc(r.player.name)}</div>
    <p class="small">Wait for your teacher to start the game.</p><div id="waitingPlayers"></div>
   </div></div>`);
 });
}
function startGame(){socket.emit("host:start",{code:state.code});}
socket.on("lobby:update",d=>{
 state.players=d.players;
 if(state.mode==="host"){
  const el=document.getElementById("hostPlayers");
  if(el) el.innerHTML=d.players.length?d.players.map(p=>`<div class="player-chip">${esc(p.name)}</div>`).join(""):"<p class='small'>Waiting for players...</p>";
  const b=document.getElementById("startBtn"); if(b)b.disabled=d.players.length<1;
 }
 if(state.mode==="player"){
  const el=document.getElementById("waitingPlayers");
  if(el) el.innerHTML=`<p>Players joined: ${d.players.length}/5</p>`;
 }
});
socket.on("game:started",q=>{state.question=q;state.roundActive=true;renderGame();startTimer();});
socket.on("round:next",q=>{state.question=q;state.roundActive=true;renderGame();startTimer();});
socket.on("players:positions",positions=>{
 positions.forEach(p=>{const el=document.getElementById("p-"+p.id);if(el){el.style.left=(p.x/20*100)+"%";el.style.top=(p.y/20*100)+"%";}});
});
socket.on("player:answered",d=>{state.players=d.players;});
socket.on("round:result",d=>{state.roundActive=false;state.players=d.players;renderResult(d);});
socket.on("game:finished",d=>{state.players=d.players;renderFinal();});
socket.on("room:closed",()=>{page(`<div class="screen"><div class="card big">The host closed the room.</div></div>`);});

function renderGame(){
 const q=state.question.question;
 const opts=state.question.options;
 page(`<div class="game">
 <div class="topbar"><strong>QUESTION ${state.question.index+1} / 10</strong><span id="timer" class="timer">20</span><strong>Score: ${state.player?state.players.find(p=>p.id===state.player.id)?.score||0:"HOST"}</strong></div>
 <div class="question">${esc(q)}</div>
 <div class="category" style="text-align:center">${esc(state.question.category||"CAREER")}</div>
 <div class="maze-wrap"><div id="maze" class="maze">
 ${Array.from({length:10},(_,i)=>`<div class="wall" style="left:${8+i*8}%;top:${28+(i%2)*16}%;width:${i%3?10:18}%;height:2%"></div>`).join("")}
 <div class="answer-zone zone-a" onclick="choose('A')"><div class="zone-letter">A</div>${esc(opts.A)}</div>
 <div class="answer-zone zone-b" onclick="choose('B')"><div class="zone-letter">B</div>${esc(opts.B)}</div>
 <div class="answer-zone zone-c" onclick="choose('C')"><div class="zone-letter">C</div>${esc(opts.C)}</div>
 ${monsters.map((m,i)=>`<div class="monster" style="left:${m.x}%;top:${m.y}%;background:${m.c}"></div>`).join("")}
 ${state.players.map(p=>`<div id="p-${p.id}" class="actor" style="left:10%;top:10%;background:${p.color}" title="${esc(p.name)}"></div>`).join("")}
 </div></div>
 <div class="controls">
  <button class="up" ontouchstart="move(0,-1)" onclick="move(0,-1)">▲</button>
  <button class="left" ontouchstart="move(-1,0)" onclick="move(-1,0)">◀</button>
  <button class="down" ontouchstart="move(0,1)" onclick="move(0,1)">▼</button>
  <button class="right" ontouchstart="move(1,0)" onclick="move(1,0)">▶</button>
 </div>
 <div class="status" id="status">Move to an answer zone or tap A/B/C when you reach it.</div>
 </div>`;
}
function move(dx,dy){if(state.mode==="player"&&state.roundActive)socket.emit("player:move",{dx,dy});}
function choose(c){if(state.mode==="player"&&state.roundActive){socket.emit("player:answer",{choice:c});document.getElementById("status").textContent=`Answer selected: ${c}`;}}
let timerHandle;
function startTimer(){
 clearInterval(timerHandle);let left=20;
 const el=()=>document.getElementById("timer");
 timerHandle=setInterval(()=>{left--;if(el()){el().textContent=left;el().classList.toggle("warn",left<=5)}if(left<=0)clearInterval(timerHandle)},1000);
}
function renderResult(d){
 const correct=d.correct;
 const rows=[...d.players].sort((a,b)=>b.score-a.score);
 if(state.mode==="host"){
  page(`<div class="screen"><div class="card">
   <div class="title" style="font-size:44px">ROUND RESULT</div>
   <div class="big">Correct answer: <strong>${correct}</strong></div>
   <p class="subtitle">${esc(d.explanation)}</p>
   <table class="scoreboard"><tr><th>Player</th><th>Answer</th><th>Score</th></tr>${rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.answer||"—"}</td><td>${p.score}</td></tr>`).join("")}</table>
   <div style="text-align:center"><button class="btn" onclick="nextRound()">${state.question.index===9?"🏆 FINISH GAME":"➡️ NEXT QUESTION"}</button></div>
  </div></div>`);
 }else{
  const me=rows.find(p=>p.id===state.player.id);
  page(`<div class="screen"><div class="card">
   <div class="title" style="font-size:44px">${me?.answer===correct?"🎉 CORRECT!":"❌ ROUND OVER"}</div>
   <div class="big">Correct answer: <strong>${correct}</strong></div>
   <p class="subtitle">${esc(d.explanation)}</p>
   <p style="text-align:center;font-size:25px">Your score: <strong>${me?.score||0}</strong></p>
   <p class="small" style="text-align:center">Waiting for the host to continue...</p>
  </div></div>`);
 }
}
function nextRound(){socket.emit("host:next",{code:state.code});}
function renderFinal(){
 const rows=[...state.players].sort((a,b)=>b.score-a.score);
 page(`<div class="screen"><div class="card">
  <div class="confetti">🎉 🏆 🎉</div><div class="title">GAME COMPLETE!</div>
  <table class="scoreboard"><tr><th>Rank</th><th>Player</th><th>Score</th></tr>${rows.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.name)}</td><td>${p.score}</td></tr>`).join("")}</table>
  ${state.mode==="host"?`<div style="text-align:center"><button class="btn" onclick="socket.emit('host:reset',{code:state.code})">🔄 PLAY AGAIN</button></div>`:"<p class='subtitle'>Thank you for playing!</p>"}
 </div></div>`);
}
home();