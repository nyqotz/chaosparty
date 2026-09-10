// js/main.js
import { initGeomapScreen, gestisciInvioCoordinate } from './minigame-geomap.js';

var titleId = "71EAC";
var roomCode = '';
var sessionTicket = '';
var playFabId = '';
var avatarBase64 = '';
var isReady = false;
var isMinigameReady = false;
var pollInterval = null;
var heartbeatInterval = null;
var myTeamColor = "";
var currentGameState = "LOBBY";
var isCaptain = false;

var localShakes = 0;
var gameTimerInterval = null;

var wfCurrentVote = -1;
var wfLastWord = "";
var wfLocalScore = 0;

var picTentativoCorrente = "";
var picBase64 = "";
var picCanvas, picCtx;
var isDrawing = false;
var picLastX = 0, picLastY = 0;
var picLastSyncTime = 0;
var picSyncIntervalMs = 250;

var picSquadraAttiva = "";
var picDisegnatore = "";
var picParolaSegreta = "";

var geoHasSent = false;
var geoLat = 0;
var geoLon = 0;

let cropImage = new Image();
let canvas, ctx;
let imgX = 0, imgY = 0, imgScale = 1;
let isDragging = false;
let startX, startY;
let renderSize = 300;

window.onload = function() {
    try {
        var urlParams = new URLSearchParams(window.location.search);
        var r = urlParams.get('room');
        if(r) { document.getElementById('pinInput').value = r; }
    } catch(e) {}

    canvas = document.getElementById('cropCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = renderSize;
    canvas.height = renderSize;

    setupCropListeners();
    setupPictionaryCanvas();

    // Collegamento pulito per l'input file dell'avatar
    let fileInputEl = document.getElementById('fileInput');
    if (fileInputEl) {
        fileInputEl.addEventListener('change', function(e) {
            initCrop(this);
        });
    }

    // Funzioni globali per i bottoni HTML
    window.joinRoom = joinRoom;
    window.confirmCrop = confirmCrop;
    window.saveProfile = saveProfile;
    window.toggleReady = toggleReady;
    window.submitTeamName = submitTeamName;
    window.setMinigameReady = setMinigameReady;
    window.inviaVotoWF = inviaVotoWF;
    window.inviaParolaWF = inviaParolaWF;
    window.pulisciTela = pulisciTela;
    window.inviaTentativoPictionary = inviaTentativoPictionary;
    window.adjustZoom = adjustZoom;
    
    window.inviaCoordinateMap = function() {
        gestisciInvioCoordinate((lat, lon) => {
            geoHasSent = true;
            geoLat = lat;
            geoLon = lon;
            sendPlayerDataToPlayFab();
        });
    };

    let savedRoom = localStorage.getItem('cp_room');
    let savedNick = localStorage.getItem('cp_nick');
    let savedAvatar = localStorage.getItem('cp_avatar');
    let savedCustomId = localStorage.getItem('cp_customid');

    if (savedRoom && savedNick && savedCustomId) {
        roomCode = savedRoom;
        document.getElementById('nicknameInput').value = savedNick;
        if (savedAvatar) {
            avatarBase64 = savedAvatar;
            document.getElementById('avatarPreview').src = avatarBase64;
        }

        var requestBody = JSON.stringify({ TitleId: titleId, CustomId: savedCustomId, CreateAccount: false });

        fetch("https://" + titleId + ".playfabapi.com/Client/LoginWithCustomID", {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody
        })
        .then(res => res.json())
        .then(data => {
            if (data.code === 200) {
                sessionTicket = data.data.SessionTicket;
                playFabId = data.data.PlayFabId;
                document.getElementById('screen-pin').classList.remove('active');
                document.getElementById('screen-lobby').classList.add('active');
                pollInterval = setInterval(checkGameLoop, 2000);
                startHeartbeat();
            } else {
                localStorage.clear();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('screen-pin').classList.add('active');
            }
        })
        .catch(() => {
            localStorage.clear();
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('screen-pin').classList.add('active');
        });
    }
};

function setupPictionaryCanvas() {
    picCanvas = document.getElementById('drawingCanvas');
    if (!picCanvas) return;
    picCtx = picCanvas.getContext('2d');
    pulisciTela(false); 

    function getPicPos(e) {
        let rect = picCanvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let scaleX = picCanvas.width / rect.width;
        let scaleY = picCanvas.height / rect.height;
        return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    picCanvas.addEventListener('mousedown', (e) => { isDrawing = true; let p = getPicPos(e); picLastX = p.x; picLastY = p.y; });
    picCanvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; drawPicLine(e); });
    picCanvas.addEventListener('mouseup', () => { isDrawing = false; syncDrawingToPlayFab(); });
    picCanvas.addEventListener('mouseleave', () => { if(isDrawing) { isDrawing = false; syncDrawingToPlayFab(); } });

    picCanvas.addEventListener('touchstart', (e) => { isDrawing = true; let p = getPicPos(e); picLastX = p.x; picLastY = p.y; e.preventDefault(); }, {passive: false});
    picCanvas.addEventListener('touchmove', (e) => { if (!isDrawing) return; drawPicLine(e); e.preventDefault(); }, {passive: false});
    picCanvas.addEventListener('touchend', () => { isDrawing = false; syncDrawingToPlayFab(); });
}

function drawPicLine(e) {
    let rect = picCanvas.getBoundingClientRect();
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let scaleX = picCanvas.width / rect.width;
    let scaleY = picCanvas.height / rect.height;
    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    picCtx.beginPath();
    picCtx.moveTo(picLastX, picLastY);
    picCtx.lineTo(x, y);
    picCtx.strokeStyle = "#0b0b10";
    picCtx.lineWidth = 5;
    picCtx.lineCap = "round";
    picCtx.stroke();

    picLastX = x;
    picLastY = y;

    if (Date.now() - picLastSyncTime > picSyncIntervalMs) {
        syncDrawingToPlayFab();
        picLastSyncTime = Date.now();
    }
}

function pulisciTela(sync = true) {
    if (picCtx) {
        picCtx.fillStyle = "white";
        picCtx.fillRect(0, 0, picCanvas.width, picCanvas.height);
        if(sync) syncDrawingToPlayFab();
    }
}

function syncDrawingToPlayFab() {
    if (!picCanvas) return;
    picBase64 = picCanvas.toDataURL('image/jpeg', 0.2); 
    sendPlayerDataToPlayFab();
}

function inviaTentativoPictionary() {
    let input = document.getElementById('pic-input-risposta');
    let tentativo = input.value.trim();
    if (tentativo !== "") {
        picTentativoCorrente = tentativo;
        sendPlayerDataToPlayFab();
        input.value = "";
        input.focus();
        if (navigator.vibrate) navigator.vibrate(20);
    }
}

function joinRoom() {
    var btn = document.getElementById('btnAvanti');
    btn.innerText = "CONNESSIONE...";
    roomCode = document.getElementById('pinInput').value.trim();
    
    if(roomCode.length !== 4) { 
        alert('Inserisci un PIN valido di 4 cifre'); 
        btn.innerText = "AVANTI"; 
        return; 
    }

    var customIdKey = localStorage.getItem('cp_customid') || ('phone_' + Math.random().toString(36).substring(2));
    var requestBody = JSON.stringify({ TitleId: titleId, CustomId: customIdKey, CreateAccount: true });

    fetch("https://" + titleId + ".playfabapi.com/Client/LoginWithCustomID", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody
    })
    .then(res => res.json())
    .then(data => {
        btn.innerText = "AVANTI";
        if (data.code === 200) {
            sessionTicket = data.data.SessionTicket;
            playFabId = data.data.PlayFabId;
            localStorage.setItem('cp_customid', playFabId);
            localStorage.setItem('cp_room', roomCode);

            document.getElementById('screen-pin').classList.remove('active');
            document.getElementById('screen-profile').classList.add('active');
        } else {
            alert('Errore Login PlayFab: ' + (data.errorMessage || "Login fallito"));
        }
    })
    .catch(() => {
        alert('Impossibile connettersi a PlayFab. Riprova.');
        btn.innerText = "AVANTI";
    });
}

function initCrop(input) {
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
        cropImage.onload = function () {
            document.getElementById('screen-profile').classList.remove('active');
            document.getElementById('screen-crop').classList.add('active');

            let scaleX = renderSize / cropImage.width;
            let scaleY = renderSize / cropImage.height;
            imgScale = Math.max(scaleX, scaleY);

            let slider = document.getElementById('zoomRange');
            if(slider) {
                slider.min = imgScale * 0.5;
                slider.max = imgScale * 3;
                slider.value = imgScale;
            }

            imgX = (renderSize - cropImage.width * imgScale) / 2;
            imgY = (renderSize - cropImage.height * imgScale) / 2;

            drawCanvas();
        }
        cropImage.src = e.target.result;
    }
    reader.readAsDataURL(file);
    input.value = ""; 
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(imgX, imgY);
    ctx.scale(imgScale, imgScale);
    ctx.drawImage(cropImage, 0, 0);
    ctx.restore();
}

function setupCropListeners() {
    let container = document.getElementById('cropContainer');
    function getClientPos(e) { return e.touches ? e.touches[0] : e; }
    if(container) {
        container.addEventListener('mousedown', (e) => { startDrag(getClientPos(e)); });
        container.addEventListener('mousemove', (e) => { onDrag(getClientPos(e)); });
        container.addEventListener('mouseup', endDrag);
        container.addEventListener('mouseleave', endDrag);
        container.addEventListener('touchstart', (e) => { startDrag(getClientPos(e)); }, {passive: true});
        container.addEventListener('touchmove', (e) => { onDrag(getClientPos(e)); }, {passive: true});
        container.addEventListener('touchend', endDrag);
    }
}

function startDrag(e) {
    isDragging = true;
    let rect = canvas.getBoundingClientRect();
    let scaleFactor = renderSize / rect.width;
    startX = (e.clientX - rect.left) * scaleFactor - imgX;
    startY = (e.clientY - rect.top) * scaleFactor - imgY;
}

function onDrag(e) {
    if (!isDragging) return;
    let rect = canvas.getBoundingClientRect();
    let scaleFactor = renderSize / rect.width;
    imgX = (e.clientX - rect.left) * scaleFactor - startX;
    imgY = (e.clientY - rect.top) * scaleFactor - startY;
    drawCanvas();
}

function endDrag() { isDragging = false; }
function adjustZoom(val) {
    let oldScale = imgScale;
    imgScale = parseFloat(val);
    let center = renderSize / 2;
    imgX = center - (center - imgX) * (imgScale / oldScale);
    imgY = center - (center - imgY) * (imgScale / oldScale);
    drawCanvas();
}

function confirmCrop() {
    let finalCanvas = document.createElement('canvas');
    let finalSize = 80; 
    finalCanvas.width = finalSize;
    finalCanvas.height = finalSize;
    let finalCtx = finalCanvas.getContext('2d');
    finalCtx.drawImage(canvas, 0, 0, renderSize, renderSize, 0, 0, finalSize, finalSize);

    avatarBase64 = finalCanvas.toDataURL('image/jpeg', 0.6);
    let preview = document.getElementById('avatarPreview');
    if(preview) preview.src = avatarBase64;

    document.getElementById('screen-crop').classList.remove('active');
    document.getElementById('screen-profile').classList.add('active');
}

function saveProfile() {
    var nickname = document.getElementById('nicknameInput').value.trim();
    if(!nickname) { alert('Inserisci un nickname'); return; }
    if(!avatarBase64) { alert('Scegli e ritaglia una foto per il tuo avatar!'); return; }

    var btn = document.getElementById('enterBtn');
    btn.innerText = "ACCESSO IN CORSO...";

    localStorage.setItem('cp_nick', nickname);
    localStorage.setItem('cp_avatar', avatarBase64);

    fetch("https://" + titleId + ".playfabapi.com/Client/ExecuteCloudScript", {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'X-Authorization': sessionTicket },
        body: JSON.stringify({ 
            FunctionName: "JoinRoom", 
            FunctionParameter: { roomId: roomCode, nickname: nickname, avatar: avatarBase64 } 
        })
    })
    .then(res => res.json())
    .then(data => {
        btn.innerText = "ENTRA IN PARTITA";
        if (data.code === 200 && data.data && data.data.FunctionResult && data.data.FunctionResult.success) {
            document.getElementById('screen-profile').classList.remove('active');
            document.getElementById('screen-lobby').classList.add('active');
            pollInterval = setInterval(checkGameLoop, 2000);
            startHeartbeat();
        } else {
            alert('Errore PlayFab: ' + JSON.stringify(data));
        }
    })
    .catch(err => {
        btn.innerText = "ENTRA IN PARTITA";
        alert('Errore di rete: ' + err);
    });
}

function startHeartbeat() {
    heartbeatInterval = setInterval(sendPlayerDataToPlayFab, 5000);
}

function sendPlayerDataToPlayFab() {
    if (!roomCode || !playFabId) return;
    var nickname = document.getElementById('nicknameInput').value.trim();
    
    var profileData = JSON.stringify({
        nickname: nickname, avatar: avatarBase64, ready: isReady,
        team: myTeamColor, isCaptain: isCaptain, ping: Date.now(), 
        score: localShakes, minigameReady: isMinigameReady,
        wfVote: wfCurrentVote, wfLastWord: wfLastWord,
        picTentativo: picTentativoCorrente, 
        picDrawData: picBase64,
        haInviatoCoord: geoHasSent || false,
        lat: geoLat || 0,
        lon: geoLon || 0
    });
    
    fetch("https://" + titleId + ".playfabapi.com/Client/UpdateSharedGroupData", {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Authorization': sessionTicket },
        body: JSON.stringify({ SharedGroupId: roomCode, Data: { [playFabId]: profileData } })
    }).catch(() => {});
}

function toggleReady() {
    if (currentGameState !== "LOBBY") return;
    isReady = !isReady;
    var btn = document.getElementById('readyBtn');
    btn.innerText = isReady ? 'ANNULLA' : 'SONO PRONTO!';
    btn.style.backgroundColor = isReady ? '#ff0055' : '#00ff66';
    btn.style.boxShadow = isReady ? '0 5px 0 #990033' : '0 5px 0 #00993d';
    sendPlayerDataToPlayFab();
}

function submitTeamName() {
    var input = document.getElementById('teamNameInput');
    if(!input) return;
    var teamName = input.value.trim();
    if(!teamName) { alert('Inserisci un nome per la squadra!'); return; }

    var teamKey = "TeamName_" + myTeamColor; 
    var dataObj = {};
    dataObj[teamKey] = teamName;

    document.getElementById('captainSection').innerHTML = "<p style='color:#00ff66; font-size:14px;'>Nome registrato!</p>";

    fetch("https://" + titleId + ".playfabapi.com/Client/UpdateSharedGroupData", {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Authorization': sessionTicket },
        body: JSON.stringify({ SharedGroupId: roomCode, Data: dataObj })
    }).catch(() => {});
}

function setMinigameReady() {
    isMinigameReady = true;
    var btn = document.getElementById('minigameReadyBtn');
    btn.innerText = "ATTESA ALTRI...";
    btn.style.backgroundColor = "#555";
    btn.style.boxShadow = "0 5px 0 #222";
    btn.disabled = true;
    document.getElementById('sensorStatus').innerText = "Pronto registrato!";
    document.getElementById('sensorStatus').style.color = "#00ff66";
    sendPlayerDataToPlayFab();
}

function checkGameLoop() {
    fetch("https://" + titleId + ".playfabapi.com/Client/GetSharedGroupData", {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Authorization': sessionTicket },
        body: JSON.stringify({ SharedGroupId: roomCode, GetMembers: true })
    })
    .then(res => res.json())
    .then(data => {
        if (data.code === 200 && data.data.Data) {
            if (data.data.Data["PicSquadraAttiva"]) picSquadraAttiva = data.data.Data["PicSquadraAttiva"].Value;
            if (data.data.Data["PicDisegnatore"]) picDisegnatore = data.data.Data["PicDisegnatore"].Value;
            if (data.data.Data["PicParolaSegreta"]) picParolaSegreta = data.data.Data["PicParolaSegreta"].Value;

            if (data.data.Data["GlobalState"]) {
                var newState = data.data.Data["GlobalState"].Value;
                if (newState !== currentGameState || newState === "PICTIONARY_PLAY" || newState === "GEOMAP_PLAY" || newState === "GEOMAP_WAIT") {
                    currentGameState = newState;
                    handleStateChange(currentGameState);
                }
            }

            if (data.data.Data["SelectedGame"]) {
                var chosenGame = data.data.Data["SelectedGame"].Value;
                let titleElem = document.getElementById('tutorialTitle');
                if(titleElem) titleElem.innerText = chosenGame.toUpperCase();
                
                let descElem = document.getElementById('tutorialDesc');
                if(descElem) {
                    if (chosenGame.toLowerCase().includes("words fight")) {
                        descElem.innerText = "30 secondi, una categoria, la mente più veloce!";
                    } else {
                        descElem.innerText = "Segui le istruzioni sullo schermo!";
                    }
                }
            }
            
            if (data.data.Data["WfCategories"]) {
                try {
                    var wrapper = JSON.parse(data.data.Data["WfCategories"].Value);
                    var catList = wrapper.list || wrapper;
                    for (let i = 0; i < 6; i++) {
                        let btn = document.getElementById('wf-cat-' + i);
                        if (catList[i] && btn) { btn.innerText = catList[i].toUpperCase(); }
                    }
                } catch (e) {}
            }
            
            if (data.data.Data["WfWinningCategory"]) {
                let catElem = document.getElementById('wf-titolo-categoria');
                if(catElem) catElem.innerText = data.data.Data["WfWinningCategory"].Value.toUpperCase();
            }

            if (data.data.Data[playFabId]) {
                var profile = JSON.parse(data.data.Data[playFabId].Value);
                if (profile.team && profile.team !== "") { myTeamColor = profile.team; }
                isCaptain = profile.isCaptain || false;
            }

            if (myTeamColor) {
                var keyName = "TeamName_" + myTeamColor; 
                let teamTitleElem = document.getElementById('teamTitle');
                if (teamTitleElem) {
                    if (data.data.Data[keyName]) {
                        teamTitleElem.innerText = data.data.Data[keyName].Value.toUpperCase();
                    } else {
                        teamTitleElem.innerText = "SQUADRA " + myTeamColor.toUpperCase();
                    }
                }

                let capSec = document.getElementById('captainSection');
                if (isCaptain && capSec && !capSec.innerHTML.includes("Nome registrato")) {
                    capSec.style.display = 'block';
                }
            }
        }
    }).catch(() => {});
}

function handleStateChange(state) {
    var screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));

    let targetScreen = null;
    
    if (state === "LOBBY") {
        targetScreen = document.getElementById('screen-lobby');
    } else if (state === "TEAM_SELECTION" || state === "TEAM_NAMING") {
        targetScreen = document.getElementById('screen-team');
    } else if (state === "ROULETTE") {
        targetScreen = document.getElementById('screen-roulette');
    } else if (state === "TUTORIAL") {
        targetScreen = document.getElementById('screen-tutorial');
        isMinigameReady = false;
        window.isGeoEliminato = false;
        let btn = document.getElementById('minigameReadyBtn');
        if(btn) {
            btn.innerText = "SONO PRONTO!";
            btn.style.backgroundColor = "#00ff66";
            btn.style.boxShadow = "0 5px 0 #00993d";
            btn.disabled = false;
        }
        let statusElem = document.getElementById('sensorStatus');
        if(statusElem) statusElem.innerText = "";

        wfCurrentVote = -1;
        wfLastWord = "";
        document.querySelectorAll('.wf-btn-categoria').forEach(b => {
            b.classList.remove('selezionato');
            b.disabled = false;
        });
        let attesaVoto = document.getElementById('wf-attesa-voto');
        if(attesaVoto) attesaVoto.style.display = "none";
        
    } else if (state === "PLAYING") {
        targetScreen = document.getElementById('screen-minigame');
        localShakes = 0;
        let scoreDisp = document.getElementById('scoreDisplay');
        if(scoreDisp) scoreDisp.innerText = "0";
        var sc = document.getElementById('scoreContainer');
        if(sc) {
            sc.style.opacity = "1";
            sc.style.pointerEvents = "auto";
        }
        startMinigameTimer();
    } else if (state === "WORDS_FIGHT_VOTE") {
        targetScreen = document.getElementById('screen-wf-vote');
    } else if (state === "WORDS_FIGHT_ARENA") {
        targetScreen = document.getElementById('screen-wf-arena');
        let wfCampo = document.getElementById('wf-campo-parola');
        if(wfCampo) wfCampo.value = "";
    } else if (state === "WORDS_FIGHT_SCORE") {
        targetScreen = document.getElementById('screen-wf-score');
        let wfFinal = document.getElementById('wf-final-score');
        if(wfFinal) wfFinal.innerText = wfLocalScore || 0;
    } else if (state === "PICTIONARY_PLAY") {
        picTentativoCorrente = ""; 
        let myRoleScreen = document.getElementById('screen-pic-wait'); 
        let isMyTeamActive = myTeamColor && picSquadraAttiva && myTeamColor.toLowerCase() === picSquadraAttiva.toLowerCase();

        if (playFabId === picDisegnatore) {
            myRoleScreen = document.getElementById('screen-pic-draw');
            let parolaSegreta = document.getElementById('pic-parola-segreta');
            if(parolaSegreta) parolaSegreta.innerText = picParolaSegreta ? picParolaSegreta.toUpperCase() : "---";
            pulisciTela(false); 
        } else if (isMyTeamActive) {
            myRoleScreen = document.getElementById('screen-pic-guess');
        }
        targetScreen = myRoleScreen;
    } else if (state === "GEOMAP_PLAY") {
        if (window.isGeoEliminato) {
            targetScreen = document.getElementById('screen-geo-out');
        } else {
            targetScreen = document.getElementById('screen-geomap');
            mapInviata = false;
            geoHasSent = false;
            geoLat = 0;
            geoLon = 0;
            let mapStatus = document.getElementById('map-status');
            if(mapStatus) mapStatus.style.display = "none";
            initGeomapScreen();
        }
    } else if (state === "GEOMAP_WAIT") {
        if (window.isGeoEliminato) {
            targetScreen = document.getElementById('screen-geo-out');
        } else {
            targetScreen = document.getElementById('screen-geo-wait');
            fetch("https://" + titleId + ".playfabapi.com/Client/GetSharedGroupData", {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Authorization': sessionTicket },
                body: JSON.stringify({ SharedGroupId: roomCode, GetMembers: true })
            })
            .then(res => res.json())
            .then(data => {
                if (data.code === 200 && data.data.Data && data.data.Data[playFabId]) {
                    let profile = JSON.parse(data.data.Data[playFabId].Value);
                    if (profile.eliminato) {
                        window.isGeoEliminato = true;
                        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                        let geoOut = document.getElementById('screen-geo-out');
                        if(geoOut) geoOut.classList.add('active');
                    }
                }
            }).catch(()=>{});
        }
    }

    if (targetScreen) { targetScreen.classList.add('active'); }
}

function startMinigameTimer() {
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    let timeLeft = 30; 
    gameTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft === 10) { 
            let sc = document.getElementById('scoreContainer');
            if(sc) sc.style.opacity = "0"; 
        }
        if (timeLeft <= 0) clearInterval(gameTimerInterval);
    }, 1000);
}

function inviaVotoWF(indice) {
    wfCurrentVote = indice;
    document.querySelectorAll('.wf-btn-categoria').forEach(b => b.disabled = true);
    let catBtn = document.getElementById('wf-cat-' + indice);
    if(catBtn) catBtn.classList.add('selezionato');
    let attVoto = document.getElementById('wf-attesa-voto');
    if(attVoto) attVoto.style.display = 'block';
    sendPlayerDataToPlayFab();
    if (navigator.vibrate) { navigator.vibrate(20); }
}

function inviaParolaWF() {
    const input = document.getElementById('wf-campo-parola');
    if(!input) return;
    const parola = input.value.trim();
    if (parola !== "") {
        wfLastWord = parola;
        wfLocalScore++; 
        sendPlayerDataToPlayFab();
        input.value = ""; 
        input.focus(); 
        if (navigator.vibrate) { navigator.vibrate(20); }
    }
}
