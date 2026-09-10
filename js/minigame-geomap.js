// js/minigame-geomap.js
let leafletMap = null;
let markerScelto = null;
let selectedLat = 0;
let selectedLon = 0;
let mapInviata = false;

export function initGeomapScreen() {
    mapInviata = false;
    let statusElem = document.getElementById('map-status');
    if (statusElem) statusElem.style.display = "none";
    
    setTimeout(() => {
        if (!leafletMap) {
            leafletMap = L.map('map').setView([45.0, 10.0], 4);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
                attribution: '© OpenStreetMap'
            }).addTo(leafletMap);

            leafletMap.on('click', function(e) {
                selectedLat = e.latlng.lat;
                selectedLon = e.latlng.lng;
                if (markerScelto) {
                    markerScelto.setLatLng(e.latlng);
                } else {
                    markerScelto = L.marker(e.latlng).addTo(leafletMap);
                }
            });
        } else {
            leafletMap.invalidateSize();
        }
    }, 200);
}

export function gestisciInvioCoordinate(callback) {
    if (mapInviata) return;
    if (!markerScelto) {
        alert("Tocca un punto sulla mappa prima di confermare!");
        return;
    }

    mapInviata = true;
    let statusElem = document.getElementById('map-status');
    if (statusElem) statusElem.style.display = "block";
    if (navigator.vibrate) navigator.vibrate(20);

    if (callback) callback(selectedLat, selectedLon);
}