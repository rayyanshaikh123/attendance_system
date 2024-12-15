let userMarkers = {};
let userMarker = null;
let mylat = 0;
let mylong = 0;
const geofenceLat = 19.07448;
const geofenceLng = 72.8812857;
const geofenceRadius = 500;

document.addEventListener('DOMContentLoaded', () => {
  const para = document.querySelector("p");
  const showGeofenceBtn = document.querySelector('#showGeofenceBtn');

  // Initialize the map
  var map = L.map('map').setView([51.505, -0.09], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);


  const userIcon = L.Icon.extend({
    options: {
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', // URL to the Leaflet default icon or your custom icon
        iconSize: [25, 41], // size of the icon
        iconAnchor: [12, 41], // point of the icon which will correspond to marker's location
        popupAnchor: [1, -34], // point from which the popup should open relative to the iconAnchor
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', // optional shadow
        shadowSize: [41, 41] // size of the shadow
    }
});
  // Initialize Socket.IO
  const socket = io();

  socket.on("connect", () => {
    console.log("Connected to server with ID: " + socket.id);
  });

  socket.on('connect_error', (err) => {
    console.log(`Connection failed due to: ${err.message}`);
  });

  socket.on('connect_timeout', () => {
    console.log('Connection timed out.');
  });

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${reason}`);
  });

  socket.emit("set-custom-id", { customId: 1 });

        socket.on("custom-id-set", (response) => {
          if (response.success) {
            console.log(`Custom ID ${response.customId} successfully set`);
          } else {
            console.error("Error setting custom ID:", response.error);
          }
        });

  const checkGeofenceStatus = (userLocation) => {
    const distance = getDistanceFromLatLonInKm(userLocation[0], userLocation[1], geofenceLat, geofenceLng);
    return distance <= geofenceRadius;
};
  // Define updateUserMarkers before its usage
  const updateUserMarkers = (data) => {
      const { id, latitude, longitude } = data;
      const userLocation = [latitude, longitude];
      console.log(id);

      if (!userMarkers[id]) {
          // Create a new marker if it doesn't exist
          userMarkers[id] = L.marker(userLocation, { icon: new userIcon() }).addTo(map)
              .bindPopup(`User ${id} is here.`)
              .openPopup();
      } else {
          // Update the marker's position if it already exists
          userMarkers[id].setLatLng(userLocation);
      }

      const isInsideGeofence = checkGeofenceStatus(userLocation);

      if (isInsideGeofence) {
          console.log(`User ${id} entered the geofence at: ${new Date().toLocaleString()}`);
      } else {
          console.log(`User ${id} left the geofence at: ${new Date().toLocaleString()}`);
      }
  };

  socket.on("receive-message", (data) => {
    console.log(data);
    updateUserMarkers(data);
  });

  async function showAllFences() {
    try {
      const response = await axios.post('/admin-o/curr-geos');
      const geofences = response.data;
      for (const fen of geofences) {
          let circle = L.circle([fen.latitude, fen.longitude], {
              color: '#FFA071',
              fillColor: '#EBD1C5',
              fillOpacity: 0.5,
              radius: fen.radius,
          }).bindPopup(`Office ${fen.name}`)
          .openPopup().addTo(map);

          map.fitBounds(circle.getBounds());
      }
    } catch (error) {
      console.error("Error fetching geofences:", error);
    }
  }
  showAllFences();
  async function showAllnili() {
    try {
        console.log("helo bhai");
        const response = await axios.get('/user/temp-geos');
        console.log(response);
        const geofences = response.data;
        console.log(geofences);

        if (geofences && geofences.length > 0) {
            console.log('Temporary geofences:', geofences);

            geofences.forEach(fen => {
                let daba = L.circle([fen.latitude, fen.longitude], {
                    color: ' #2E8B57',
                    fillColor: '#98FB9850',
                    fillOpacity: 0.5,
                    radius: fen.radius,
                }).bindPopup(`Office ${fen.name}`)
                  .openPopup()
                  .addTo(map);

                map.fitBounds(daba.getBounds());
            });
        } else {
            console.log('No temporary geofences found.');
        }
    } catch (error) {
        console.error("Error fetching geofences:", error);
    }
}
showAllnili()
  // User permission
  
  if (showGeofenceBtn) {
      showGeofenceBtn.addEventListener('click', () => {
          alert('Geofence button clicked');
      });
  }


  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = deg2rad(lat2 - lat1);
      const dLon = deg2rad(lon2 - lon1);
      const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
  }

  function deg2rad(deg) {
      return deg * (Math.PI / 180);
  }
});